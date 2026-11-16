// =====================================================================
// TJE EXPRESS · documentos.js
// Módulo Documentos: papeles de cada camioneta y de cada chofer,
// con su vencimiento y un "semáforo" (rojo, amarillo, verde).
//   #documentos                    → resumen (oficina y admin)
//   #documentos/v/<id>             → documentos de una camioneta
//   #documentos/c/<id>             → documentos de un chofer
//   #documentos/v/<id>/<tipo>      → agregar o editar ese documento
//   #documentos (rol chofer)       → "Mis documentos" (solo lectura)
// Los archivos (foto o PDF) van al bucket privado "documentos":
//   <empresa_id>/vehiculos/<id>/<tipo>.jpg   (o .pdf)
//   <empresa_id>/conductores/<id>/<tipo>.jpg (o .pdf)
// =====================================================================
(function () {
  const BUCKET = 'documentos';
  const DIAS_AVISO = 30;                 // "por vencer" = faltan 30 días o menos
  const MAX_PDF = 2 * 1024 * 1024;       // PDF de 2 MB como máximo (ahorro de datos)

  // Tipos fijos (definidos con los papeles reales de la flota, 28-sep-2026).
  //   vence: false    → el documento no tiene vencimiento (padrón)
  //   opcional: true  → si falta, no cuenta como "falta"
  const TIPOS = {
    v: [
      { slug: 'permiso', nombre: 'Permiso de circulación', ayuda: 'Ej: Municipalidad de Pudahuel' },
      { slug: 'revision', nombre: 'Revisión técnica', ayuda: 'Ej: planta y comuna', mes: true },
      { slug: 'gases', nombre: 'Emisión de gases', ayuda: 'Ej: planta y comuna', mes: true },
      { slug: 'soap', nombre: 'SOAP', ayuda: 'Ej: aseguradora y N° de póliza' },
      { slug: 'seguro', nombre: 'Seguro', ayuda: 'Ej: aseguradora y N° de póliza', opcional: true },
      { slug: 'padron', nombre: 'Padrón', ayuda: 'Ej: N° de folio', vence: false }
    ],
    c: [
      { slug: 'licencia', nombre: 'Licencia de conducir', ayuda: 'Ej: Clase B' }
    ]
  };
  const ESTADOS = {
    vencido: 'Vencido',
    falta: 'Falta',
    por_vencer: 'Por vencer',
    al_dia: 'Al día',
    registrado: 'Registrado',
    opcional: 'No registrado'
  };
  // De peor a mejor: así el semáforo de la camioneta toma el peor documento.
  const ORDEN = ['vencido', 'por_vencer', 'falta', 'al_dia'];
  const COLUMNAS_DOC = 'id, empresa_id, vehiculo_id, conductor_id, tipo, detalle, fecha_emision, fecha_vencimiento, archivo_path';

  let carga = 0;            // evita que una carga lenta pinte sobre otra pantalla
  let avisoPendiente = '';  // mensaje "Guardado ✓" para la pantalla siguiente

  const { escapar: esc, puedeEditar, colorBodega, formatoPatente, pill } = window.TJE_UI;
  const error = (e) => window.TJE.traducirError(e);

  // ---------- Fechas (siempre como texto "AAAA-MM-DD", sin horas) ----------
  function hoy() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  const aDias = (f) => { const [a, m, d] = f.split('-').map(Number); return Date.UTC(a, m - 1, d) / 86400000; };
  const diasPara = (f) => Math.round(aDias(f) - aDias(hoy()));
  const fechaCorta = (f) => (f ? f.split('-').reverse().join('-') : '—');
  const fechaValida = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f) && !isNaN(aDias(f));

  // ---------- Estado de un documento ----------
  function estadoDe(tipo, doc) {
    if (!doc) return tipo.opcional ? 'opcional' : 'falta';
    if (tipo.vence === false) return 'registrado';
    if (!doc.fecha_vencimiento) return 'falta';
    const d = diasPara(doc.fecha_vencimiento);
    return d < 0 ? 'vencido' : d <= DIAS_AVISO ? 'por_vencer' : 'al_dia';
  }
  function cuandoVence(doc) {
    if (!doc || !doc.fecha_vencimiento) return '';
    const d = diasPara(doc.fecha_vencimiento);
    if (d < -1) return 'venció hace ' + (-d) + ' días';
    if (d === -1) return 'venció ayer';
    if (d === 0) return 'vence hoy';
    if (d === 1) return 'vence mañana';
    return 'vence en ' + d + ' días';
  }
  const pillEstado = (e) => pill('doc-' + e, ESTADOS[e] || e);
  const peor = (estados) => ORDEN.find((e) => estados.includes(e)) || 'al_dia';

  // Junta cada tipo fijo con su documento guardado (si existe).
  // Si hubiera dos del mismo tipo, se usa el que vence más tarde.
  function armar(clase, docs) {
    return TIPOS[clase].map((tipo) => {
      const doc = docs
        .filter((d) => d.tipo === tipo.nombre)
        .sort((a, b) => String(b.fecha_vencimiento || '').localeCompare(String(a.fecha_vencimiento || '')))[0] || null;
      return { tipo, doc, estado: estadoDe(tipo, doc) };
    });
  }

  // ------------------------------------------------------------------
  // Punto de entrada
  // ------------------------------------------------------------------
  function pintar(cont, perfil, partes) {
    const miCarga = ++carga;
    if (!puedeEditar(perfil)) return misDocumentos(cont, perfil, miCarga);
    const [clase, id, slug] = partes;
    if ((clase === 'v' || clase === 'c') && id) {
      const tipo = slug && TIPOS[clase].find((t) => t.slug === slug);
      if (slug && !tipo) return (location.hash = '#documentos/' + clase + '/' + id);
      return tipo ? formulario(cont, clase, id, tipo, miCarga) : detalle(cont, clase, id, miCarga);
    }
    return resumen(cont, miCarga);
  }

  // ------------------------------------------------------------------
  // RESUMEN (oficina y admin): 3 consultas chicas, una sola vez
  // ------------------------------------------------------------------
  async function resumen(cont, miCarga) {
    const aviso = avisoPendiente;
    avisoPendiente = '';
    cont.innerHTML =
      (aviso ? '<p class="aviso aviso-ok">' + esc(aviso) + '</p>' : '') +
      '<section class="barra-modulo">' +
        '<div><h1 class="titulo-modulo">Documentos</h1><p class="sub" id="doc-cuenta">Cargando…</p></div>' +
      '</section>' +
      '<div id="doc-cuerpo" class="doc-cuerpo"></div>';

    const [rv, rc, rd] = await Promise.all([
      TJE.db.from('vehiculos').select('id, patente, marca, modelo, bodega:bodegas!vehiculos_bodega_id_fkey(nombre, color)').order('patente'),
      TJE.db.from('conductores').select('id, nombre, bodega:bodegas!conductores_bodega_id_fkey(nombre, color)').eq('estado', 'activo').order('nombre'),
      TJE.db.from('documentos').select('id, vehiculo_id, conductor_id, tipo, fecha_vencimiento').limit(500)
    ]);
    if (miCarga !== carga) return;
    const cuerpo = document.getElementById('doc-cuerpo');
    const cuenta = document.getElementById('doc-cuenta');
    const fallo = rv.error || rc.error || rd.error;
    if (fallo) {
      cuenta.textContent = '';
      cuerpo.innerHTML = '<p class="aviso aviso-error">' + esc(error(fallo)) + '</p>';
      return;
    }

    const vehiculos = rv.data.map((v) => ({ item: v, filas: armar('v', rd.data.filter((d) => d.vehiculo_id === v.id)) }));
    const choferes = rc.data.map((c) => ({ item: c, filas: armar('c', rd.data.filter((d) => d.conductor_id === c.id)) }));
    const todas = [...vehiculos, ...choferes].flatMap((x) => x.filas);
    const n = (e) => todas.filter((f) => f.estado === e).length;

    cuenta.textContent = vehiculos.length + (vehiculos.length === 1 ? ' camioneta' : ' camionetas') + ' · ' +
      choferes.length + (choferes.length === 1 ? ' chofer' : ' choferes');

    cuerpo.innerHTML =
      '<section class="doc-contadores">' +
        contador('vencido', n('vencido'), 'Vencidos') +
        contador('por_vencer', n('por_vencer'), 'Por vencer (' + DIAS_AVISO + ' días)') +
        contador('falta', n('falta'), 'Faltan') +
        contador('al_dia', n('al_dia'), 'Al día') +
      '</section>' +
      '<section class="panel">' +
        '<h2>Camionetas</h2>' +
        (vehiculos.length
          ? '<div class="grilla-tarjetas">' + vehiculos.map((x) => tarjeta('v', x)).join('') + '</div>'
          : '<p class="sub">Aún no hay camionetas registradas.</p>') +
      '</section>' +
      '<section class="panel">' +
        '<h2>Choferes</h2>' +
        (choferes.length
          ? '<div class="grilla-tarjetas">' + choferes.map((x) => tarjeta('c', x)).join('') + '</div>'
          : '<p class="sub">Aún no hay choferes activos.</p>') +
      '</section>';
  }

  const contador = (estado, numero, texto) =>
    '<div class="doc-contador doc-' + estado + '"><b>' + numero + '</b><span>' + esc(texto) + '</span></div>';

  function tarjeta(clase, x) {
    const general = peor(x.filas.map((f) => f.estado));
    const titulo = clase === 'v'
      ? '<div class="placa">' + esc(formatoPatente(x.item.patente)) + '</div>' +
        '<div class="tarjeta-modelo">' + esc([x.item.marca, x.item.modelo].filter(Boolean).join(' ') || 'Camioneta') + '</div>'
      : '<div class="tarjeta-modelo">' + esc(x.item.nombre) + '</div>';
    return '<a class="tarjeta-veh" style="--c:' + colorBodega(x.item.bodega) + '" href="#documentos/' + clase + '/' + esc(x.item.id) + '">' +
        '<div class="tarjeta-fila">' +
          '<span class="bodega-etq">' + esc(x.item.bodega ? x.item.bodega.nombre : 'Sin bodega') + '</span>' +
          pillEstado(general) +
        '</div>' +
        titulo +
        '<ul class="doc-mini">' +
          x.filas.filter((f) => f.estado !== 'opcional').map((f) =>
            '<li><span class="doc-punto doc-' + f.estado + '"></span>' + esc(f.tipo.nombre) +
            '<small>' + esc(f.doc && f.tipo.vence !== false && f.doc.fecha_vencimiento ? fechaCorta(f.doc.fecha_vencimiento) : ESTADOS[f.estado]) + '</small></li>'
          ).join('') +
        '</ul>' +
      '</a>';
  }

  // ------------------------------------------------------------------
  // DETALLE de una camioneta o de un chofer
  // ------------------------------------------------------------------
  async function cargarDueno(clase, id) {
    const consulta = clase === 'v'
      ? TJE.db.from('vehiculos').select('id, empresa_id, patente, marca, modelo, bodega:bodegas!vehiculos_bodega_id_fkey(nombre, color)')
      : TJE.db.from('conductores').select('id, empresa_id, nombre, bodega:bodegas!conductores_bodega_id_fkey(nombre, color)');
    const [rdueno, rdocs] = await Promise.all([
      consulta.eq('id', id).maybeSingle(),
      TJE.db.from('documentos').select(COLUMNAS_DOC).eq(clase === 'v' ? 'vehiculo_id' : 'conductor_id', id)
    ]);
    return { dueno: rdueno.data, docs: rdocs.data || [], fallo: rdueno.error || rdocs.error };
  }
  const nombreDueno = (clase, d) => (clase === 'v' ? formatoPatente(d.patente) : d.nombre);

  async function detalle(cont, clase, id, miCarga) {
    cont.innerHTML = '<p class="sub">Cargando…</p>';
    const { dueno, docs, fallo } = await cargarDueno(clase, id);
    if (miCarga !== carga) return;
    if (fallo || !dueno) {
      cont.innerHTML = '<p class="aviso aviso-error">' + esc(fallo ? error(fallo) : 'No se encontró este registro.') + '</p>' +
        '<a class="btn btn-secundario" href="#documentos">← Volver a Documentos</a>';
      return;
    }
    const aviso = avisoPendiente;
    avisoPendiente = '';
    const filas = armar(clase, docs);
    const base = '#documentos/' + clase + '/' + esc(dueno.id);

    cont.innerHTML =
      (aviso ? '<p class="aviso aviso-ok">' + esc(aviso) + '</p>' : '') +
      '<a class="volver" href="#documentos">← Documentos</a>' +
      '<section class="panel ficha" style="--c:' + colorBodega(dueno.bodega) + '">' +
        '<div class="ficha-cabecera"><div>' +
          (clase === 'v'
            ? '<div class="placa placa-grande">' + esc(formatoPatente(dueno.patente)) + '</div>' +
              '<h1>' + esc([dueno.marca, dueno.modelo].filter(Boolean).join(' ') || 'Camioneta') + '</h1>'
            : '<h1>' + esc(dueno.nombre) + '</h1>') +
          pillEstado(peor(filas.map((f) => f.estado))) +
        '</div></div>' +
        '<div class="doc-lista">' + filas.map((f) => filaDetalle(f, base, true)).join('') + '</div>' +
      '</section>';

    cont.querySelectorAll('[data-archivo]').forEach((b) => b.addEventListener('click', () => verArchivo(b)));
  }

  function filaDetalle(f, base, editable) {
    const d = f.doc;
    const lineas = [];
    if (d && d.detalle) lineas.push(esc(d.detalle));
    if (d && d.fecha_emision) lineas.push('Emisión: ' + esc(fechaCorta(d.fecha_emision)));
    if (d && f.tipo.vence !== false) {
      lineas.push('Vence: <b>' + esc(fechaCorta(d.fecha_vencimiento)) + '</b>' +
        (d.fecha_vencimiento ? ' (' + esc(cuandoVence(d)) + ')' : ''));
    }
    if (!d) lineas.push(f.tipo.opcional ? 'Opcional: aún no se ha registrado.' : 'Aún no se ha registrado.');
    return '<div class="doc-fila">' +
        '<div class="doc-fila-titulo"><strong>' + esc(f.tipo.nombre) + '</strong>' + pillEstado(f.estado) + '</div>' +
        '<p class="sub">' + lineas.join(' · ') + '</p>' +
        (editable
          ? '<div class="doc-fila-acciones">' +
              (d && d.archivo_path ? '<button type="button" class="btn btn-secundario btn-chico" data-archivo="' + esc(d.archivo_path) + '">Ver archivo</button>' : '') +
              '<a class="btn btn-secundario btn-chico" href="' + base + '/' + f.tipo.slug + '">' + (d ? 'Editar' : 'Agregar') + '</a>' +
            '</div>'
          : '') +
      '</div>';
  }

  // Abre el archivo privado con un enlace temporal (5 minutos).
  async function verArchivo(boton) {
    const ventana = window.open('', '_blank'); // se abre de inmediato para que el navegador no la bloquee
    boton.disabled = true;
    const texto = boton.textContent;
    boton.textContent = 'Abriendo…';
    const { data, error: err } = await TJE.db.storage.from(BUCKET).createSignedUrl(boton.dataset.archivo, 300);
    boton.disabled = false;
    boton.textContent = texto;
    if (err || !data) {
      if (ventana) ventana.close();
      return alert('No se pudo abrir el archivo. ' + (err ? error(err) : ''));
    }
    if (ventana) ventana.location.href = data.signedUrl;
    else location.href = data.signedUrl;
  }

  // ------------------------------------------------------------------
  // FORMULARIO: agregar o editar un documento
  // ------------------------------------------------------------------
  async function formulario(cont, clase, id, tipo, miCarga) {
    cont.innerHTML = '<p class="sub">Cargando…</p>';
    const { dueno, docs, fallo } = await cargarDueno(clase, id);
    if (miCarga !== carga) return;
    const volver = '#documentos/' + clase + '/' + id;
    if (fallo || !dueno) {
      cont.innerHTML = '<p class="aviso aviso-error">' + esc(fallo ? error(fallo) : 'No se encontró este registro.') + '</p>' +
        '<a class="btn btn-secundario" href="#documentos">← Volver a Documentos</a>';
      return;
    }
    const doc = armar(clase, docs).find((f) => f.tipo.slug === tipo.slug).doc;
    const conVence = tipo.vence !== false;

    cont.innerHTML =
      '<a class="volver" href="' + esc(volver) + '">← Volver</a>' +
      '<form id="doc-form" class="panel formulario" novalidate>' +
        '<h1>' + esc(tipo.nombre) + '</h1>' +
        '<p class="sub">' + esc(nombreDueno(clase, dueno)) + '</p>' +
        '<div class="campos">' +
          '<div class="campo campo-ancho"><label for="d-detalle">Detalle</label>' +
            '<input id="d-detalle" maxlength="120" placeholder="' + esc(tipo.ayuda) + '" value="' + esc(doc ? doc.detalle || '' : '') + '"></div>' +
          '<div class="campo"><label for="d-emision">Fecha de emisión</label>' +
            '<input id="d-emision" type="date" value="' + esc(doc ? doc.fecha_emision || '' : '') + '"></div>' +
          (conVence
            ? '<div class="campo"><label for="d-vence">Fecha de vencimiento *</label>' +
              '<input id="d-vence" type="date" value="' + esc(doc ? doc.fecha_vencimiento || '' : '') + '">' +
              (tipo.mes ? '<p class="sub">Si el papel dice solo mes y año, usa el último día de ese mes.</p>' : '') + '</div>'
            : '<div class="campo"><label>Vencimiento</label><p class="sub">Este documento no vence.</p></div>') +
          '<div class="campo campo-ancho"><label for="d-archivo">Foto o PDF del documento (opcional)</label>' +
            '<input id="d-archivo" type="file" accept="image/*,application/pdf">' +
            '<p class="sub">' + (doc && doc.archivo_path ? 'Ya hay un archivo guardado. Si eliges otro, lo reemplaza. ' : '') +
              'Las fotos se reducen solas a unos 200 KB. PDF de hasta 2 MB.</p></div>' +
        '</div>' +
        '<p id="d-mensaje" class="aviso aviso-error" role="alert" hidden></p>' +
        '<div class="acciones">' +
          (doc ? '<button type="button" id="d-borrar" class="btn btn-secundario btn-peligro">Eliminar</button>' : '') +
          '<a class="btn btn-secundario" href="' + esc(volver) + '">Cancelar</a>' +
          '<button type="submit" id="d-guardar" class="btn btn-primario">Guardar</button>' +
        '</div>' +
      '</form>';

    const $ = (x) => document.getElementById(x);
    const avisar = (t, campo) => {
      $('d-mensaje').textContent = t;
      $('d-mensaje').hidden = false;
      if (campo) $(campo).focus();
    };
    const btn = $('d-guardar');
    const ocupado = (si, texto) => { btn.disabled = si; btn.textContent = si ? texto : 'Guardar'; };

    $('doc-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      $('d-mensaje').hidden = true;
      const emision = $('d-emision').value || null;
      const vence = conVence ? $('d-vence').value || null : null;
      const archivo = $('d-archivo').files[0] || null;

      if (emision && (!fechaValida(emision) || emision > hoy())) return avisar('La fecha de emisión no puede ser futura.', 'd-emision');
      if (conVence && (!vence || !fechaValida(vence))) return avisar('Escribe la fecha de vencimiento.', 'd-vence');
      if (emision && vence && vence < emision) return avisar('El vencimiento no puede ser anterior a la emisión.', 'd-vence');
      const esPdf = archivo && archivo.type === 'application/pdf';
      if (archivo && !esPdf && !/^image\//.test(archivo.type)) return avisar('El archivo debe ser una foto o un PDF.', 'd-archivo');
      if (esPdf && archivo.size > MAX_PDF) return avisar('El PDF pesa más de 2 MB. Súbelo como foto o usa un PDF más liviano.', 'd-archivo');

      try {
        // 1) Archivo (si se eligió uno): se sube primero
        let ruta = doc ? doc.archivo_path : null;
        if (archivo) {
          ocupado(true, esPdf ? 'Subiendo PDF…' : 'Reduciendo foto…');
          const contenido = esPdf ? archivo : await TJE_FOTOS.reducir(archivo).catch((e) => { e.claro = true; throw e; });
          const nueva = dueno.empresa_id + '/' + (clase === 'v' ? 'vehiculos' : 'conductores') + '/' + dueno.id + '/' + tipo.slug + (esPdf ? '.pdf' : '.jpg');
          ocupado(true, 'Subiendo archivo (' + Math.round(contenido.size / 1024) + ' KB)…');
          const { error: errSubida } = await TJE.db.storage.from(BUCKET)
            .upload(nueva, contenido, { upsert: true, contentType: esPdf ? 'application/pdf' : 'image/jpeg', cacheControl: '3600' });
          if (errSubida) throw errSubida;
          // Si antes era foto y ahora PDF (o al revés), se borra el archivo antiguo
          if (ruta && ruta !== nueva) await TJE.db.storage.from(BUCKET).remove([ruta]);
          ruta = nueva;
        }

        // 2) Datos del documento
        ocupado(true, 'Guardando…');
        const datos = {
          detalle: $('d-detalle').value.trim() || null,
          fecha_emision: emision,
          fecha_vencimiento: vence,
          archivo_path: ruta
        };
        const consulta = doc
          ? TJE.db.from('documentos').update(datos).eq('id', doc.id).select('id').single()
          : TJE.db.from('documentos').insert(Object.assign(datos, {
              empresa_id: dueno.empresa_id,
              tipo: tipo.nombre,
              vehiculo_id: clase === 'v' ? dueno.id : null,
              conductor_id: clase === 'c' ? dueno.id : null
            })).select('id').single();
        const { data, error: errGuardar } = await consulta;
        if (errGuardar || !data) throw errGuardar || new Error('sin respuesta');
        avisoPendiente = tipo.nombre + ' guardado ✓';
        location.hash = volver;
      } catch (e) {
        ocupado(false);
        avisar(e && e.claro ? e.message : error(e)); // "claro" = mensaje ya escrito en español por fotos.js
      }
    });

    if (doc) {
      $('d-borrar').addEventListener('click', async () => {
        if (!confirm('¿Eliminar "' + tipo.nombre + '" de ' + nombreDueno(clase, dueno) + '?\n\nSe borra también su archivo. No se puede deshacer.')) return;
        $('d-borrar').disabled = true;
        const { error: err } = await TJE.db.from('documentos').delete().eq('id', doc.id);
        if (err) {
          $('d-borrar').disabled = false;
          return avisar(error(err));
        }
        if (doc.archivo_path) await TJE.db.storage.from(BUCKET).remove([doc.archivo_path]);
        avisoPendiente = tipo.nombre + ' eliminado';
        location.hash = volver;
      });
    }
  }

  // ------------------------------------------------------------------
  // "MIS DOCUMENTOS" (chofer): solo lectura, solo los suyos
  // ------------------------------------------------------------------
  async function misDocumentos(cont, perfil, miCarga) {
    cont.innerHTML =
      '<section class="barra-modulo"><div><h1 class="titulo-modulo">Mis documentos</h1>' +
      '<p class="sub">Tus documentos y sus vencimientos.</p></div></section>' +
      '<div id="doc-cuerpo" class="doc-cuerpo"><p class="sub">Cargando…</p></div>';
    if (!perfil.conductor_id) {
      document.getElementById('doc-cuerpo').innerHTML =
        '<p class="aviso aviso-error">Tu usuario no está ligado a una ficha de chofer. Pide a la oficina que lo revise.</p>';
      return;
    }
    // La base de datos (RLS) solo le entrega al chofer sus propios documentos.
    const { data, error: err } = await TJE.db.from('documentos')
      .select('id, tipo, detalle, fecha_emision, fecha_vencimiento')
      .eq('conductor_id', perfil.conductor_id);
    if (miCarga !== carga) return;
    const cuerpo = document.getElementById('doc-cuerpo');
    if (err) {
      cuerpo.innerHTML = '<p class="aviso aviso-error">' + esc(error(err)) + '</p>';
      return;
    }
    const filas = armar('c', data);
    const general = peor(filas.map((f) => f.estado));
    const mensajes = {
      vencido: 'Tienes un documento vencido. Avisa a la oficina cuando lo renueves.',
      por_vencer: 'Tienes un documento por vencer. Renuévalo con tiempo.',
      falta: 'La oficina aún no ha registrado todos tus documentos.',
      al_dia: 'Todo al día ✓'
    };
    cuerpo.innerHTML =
      '<p class="aviso ' + (general === 'al_dia' ? 'aviso-ok' : general === 'vencido' ? 'aviso-error' : 'aviso-atencion') + '">' + esc(mensajes[general]) + '</p>' +
      '<section class="panel"><div class="doc-lista">' + filas.map((f) => filaDetalle(f, '', false)).join('') + '</div></section>' +
      '<p class="sub">Si algún dato está mal, pide a la oficina que lo corrija.</p>';
  }

  window.TJE_MODULOS = window.TJE_MODULOS || {};
  window.TJE_MODULOS.documentos = { pintar };
})();
