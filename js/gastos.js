// =====================================================================
// TJE EXPRESS · gastos.js
// Módulo "Gastos" (solo oficina y admin). Tres pestañas:
//   #gastos                  → Gastos del mes (combustible, mantención, peaje, otro)
//   #gastos/nuevo            → agregar un gasto
//   #gastos/g/<id>           → editar o eliminar un gasto
//   #gastos/tablero          → lecturas del tablero que anotan los choferes
//   #gastos/tablero/<id>     → verificar una lectura (foto al lado del km)
//   #gastos/costos           → costo por camioneta: total, $/km, km/litro
// Tablas: "gastos" y "lecturas_tablero" (SQL 08). El chofer no tiene acceso.
// Fotos de boleta → bucket "documentos": <empresa_id>/gastos/<id>.jpg
// Fotos del tablero → bucket "tablero": <empresa_id>/<vehiculo_id>/<id>.jpg
// Los costos se calculan aquí, en la pantalla; no se guardan.
// =====================================================================
(function () {
  const TIPOS = { combustible: 'Combustible', mantencion: 'Mantención', peaje: 'Peaje', otro: 'Otro' };
  const ESTADOS = { pendiente: 'Pendiente', coincide: 'Coincide', no_coincide: 'No coincide' };
  const PILL_ESTADO = { pendiente: 'doc-por_vencer', coincide: 'doc-al_dia', no_coincide: 'doc-vencido' };

  let carga = 0;            // evita que una carga lenta pinte sobre otra pantalla
  let avisoPendiente = '';  // "Guardado ✓" para la pantalla siguiente
  let mes = mesActual();    // mes que se está mirando (AAAA-MM); se recuerda al cambiar de pestaña

  const { escapar: esc, puedeEditar, formatoPatente, numero, pill } = window.TJE_UI;
  const error = (e) => window.TJE.traducirError(e);
  const pesos = (n) => '$' + numero(Math.round(n || 0));

  // ---------- Fechas ----------
  function hoy() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function mesActual() { return hoy().slice(0, 7); }
  // Primer día del mes y primer día del mes siguiente (para filtrar "desde ... hasta antes de ...")
  function rangoMes(m) {
    const [a, n] = m.split('-').map(Number);
    const sig = n === 12 ? (a + 1) + '-01' : a + '-' + String(n + 1).padStart(2, '0');
    return { desde: m + '-01', hasta: sig + '-01' };
  }
  // Para fechas con hora (created_at): se usa la hora de Chile del equipo
  const inicioLocal = (f) => new Date(f + 'T00:00:00').toISOString();
  const nombreMes = (m) => new Date(m + '-15T12:00:00').toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  const fechaCorta = (f) => (f ? f.split('-').reverse().join('-') : '—');
  const fechaHora = (f) => new Date(f).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  // ------------------------------------------------------------------
  // Punto de entrada
  // ------------------------------------------------------------------
  function pintar(cont, perfil, partes) {
    const miCarga = ++carga;
    if (!puedeEditar(perfil)) return (location.hash = '#turno');
    const [a, b] = partes;
    if (a === 'nuevo') return formularioGasto(cont, null, miCarga);
    if (a === 'g' && b) return formularioGasto(cont, b, miCarga);
    if (a === 'tablero' && b) return verificar(cont, b, miCarga);
    if (a === 'tablero') return listaTablero(cont, miCarga);
    if (a === 'costos') return costos(cont, miCarga);
    return listaGastos(cont, miCarga);
  }

  // Encabezado común: título, selector de mes y pestañas
  function cabecera(activa, pendientes) {
    const aviso = avisoPendiente;
    avisoPendiente = '';
    const pestana = (id, texto, href) =>
      '<a class="pestana' + (activa === id ? ' activa' : '') + '" href="' + href + '"' + (activa === id ? ' aria-current="page"' : '') + '>' + texto + '</a>';
    return (aviso ? '<p class="aviso aviso-ok">' + esc(aviso) + '</p>' : '') +
      '<section class="barra-modulo">' +
        '<div><h1 class="titulo-modulo">Gastos</h1><p class="sub">Costos de cada camioneta y control del kilometraje.</p></div>' +
        '<label class="gas-mes"><span class="sub">Mes</span><input type="month" id="gas-mes" value="' + esc(mes) + '" max="' + esc(mesActual()) + '"></label>' +
      '</section>' +
      '<nav class="pestanas" aria-label="Secciones de Gastos">' +
        pestana('gastos', 'Gastos', '#gastos') +
        pestana('tablero', 'Tablero' + (pendientes ? ' <span class="gas-globo">' + pendientes + '</span>' : ''), '#gastos/tablero') +
        pestana('costos', 'Costos', '#gastos/costos') +
      '</nav>';
  }
  // Al cambiar el mes, se vuelve a pintar la misma pestaña
  function activarMes() {
    const campo = document.getElementById('gas-mes');
    campo.addEventListener('change', () => {
      if (!/^\d{4}-\d{2}$/.test(campo.value)) return;
      mes = campo.value;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
  }
  const mostrarFallo = (cont, e, volver) => {
    cont.innerHTML = '<p class="aviso aviso-error">' + esc(typeof e === 'string' ? e : error(e)) + '</p>' +
      '<a class="btn btn-secundario" href="' + esc(volver || '#gastos') + '">← Volver</a>';
  };

  // Consultas chicas que usan varias pestañas
  const consultaVehiculos = () => TJE.db.from('vehiculos').select('id, empresa_id, patente, marca, modelo').order('patente');
  function consultaLecturas(m, columnas) {
    const r = rangoMes(m);
    return TJE.db.from('lecturas_tablero').select(columnas)
      .gte('created_at', inicioLocal(r.desde)).lt('created_at', inicioLocal(r.hasta))
      .order('created_at').limit(2000);
  }
  // Solo cuenta las pendientes (no baja filas): para el globito de la pestaña
  const contarPendientes = () => TJE.db.from('lecturas_tablero')
    .select('id', { count: 'exact', head: true }).eq('estado', 'pendiente').eq('sin_foto', false);

  // ------------------------------------------------------------------
  // PESTAÑA 1: GASTOS DEL MES
  // ------------------------------------------------------------------
  async function listaGastos(cont, miCarga) {
    cont.innerHTML = '<p class="sub">Cargando…</p>';
    const r = rangoMes(mes);
    const [rg, rp] = await Promise.all([
      TJE.db.from('gastos')
        .select('id, fecha, tipo, monto, litros, detalle, foto_path, vehiculo:vehiculos!gastos_vehiculo_id_fkey(patente)')
        .gte('fecha', r.desde).lt('fecha', r.hasta)
        .order('fecha', { ascending: false }).limit(1000),
      contarPendientes()
    ]);
    if (miCarga !== carga) return;
    if (rg.error) return mostrarFallo(cont, rg.error, '#inicio');
    const gastos = rg.data;
    const total = gastos.reduce((s, g) => s + g.monto, 0);
    const porTipo = (t) => gastos.filter((g) => g.tipo === t).reduce((s, g) => s + g.monto, 0);

    cont.innerHTML = cabecera('gastos', rp.count) +
      '<section class="doc-contadores">' +
        contador('gas-total', pesos(total), 'Total de ' + nombreMes(mes)) +
        contador('gas-combustible', pesos(porTipo('combustible')), 'Combustible') +
        contador('gas-mantencion', pesos(porTipo('mantencion')), 'Mantención') +
        contador('gas-otro', pesos(porTipo('peaje') + porTipo('otro')), 'Peajes y otros') +
      '</section>' +
      '<section class="panel">' +
        '<div class="doc-fila-titulo"><h2>' + gastos.length + (gastos.length === 1 ? ' gasto' : ' gastos') + '</h2>' +
          '<a class="btn btn-primario btn-chico" href="#gastos/nuevo">+ Agregar gasto</a></div>' +
        (gastos.length
          ? '<div class="doc-lista">' + gastos.map(filaGasto).join('') + '</div>'
          : '<p class="sub">No hay gastos registrados en ' + esc(nombreMes(mes)) + '.</p>') +
      '</section>';
    activarMes();
  }

  const contador = (clase, valor, texto) =>
    '<div class="doc-contador ' + clase + '"><b>' + esc(valor) + '</b><span>' + esc(texto) + '</span></div>';

  function filaGasto(g) {
    const lineas = [esc(fechaCorta(g.fecha))];
    if (g.litros) lineas.push(esc(numero(g.litros)) + ' litros');
    if (g.detalle) lineas.push(esc(g.detalle));
    if (g.foto_path) lineas.push('con boleta');
    return '<a class="doc-fila gas-fila" href="#gastos/g/' + esc(g.id) + '">' +
        '<div class="doc-fila-titulo"><strong>' + esc(TIPOS[g.tipo] || g.tipo) + ' · ' +
          '<span class="placa placa-chica">' + esc(formatoPatente(g.vehiculo ? g.vehiculo.patente : '')) + '</span></strong>' +
          '<b>' + esc(pesos(g.monto)) + '</b></div>' +
        '<p class="sub">' + lineas.join(' · ') + '</p>' +
      '</a>';
  }

  // ------------------------------------------------------------------
  // FORMULARIO DE GASTO (agregar / editar / eliminar)
  // ------------------------------------------------------------------
  async function formularioGasto(cont, id, miCarga) {
    cont.innerHTML = '<p class="sub">Cargando…</p>';
    const [rv, rg] = await Promise.all([
      consultaVehiculos(),
      id ? TJE.db.from('gastos').select('id, empresa_id, vehiculo_id, fecha, tipo, monto, litros, km, detalle, foto_path').eq('id', id).maybeSingle()
         : Promise.resolve({ data: null, error: null })
    ]);
    if (miCarga !== carga) return;
    if (rv.error || rg.error) return mostrarFallo(cont, rv.error || rg.error);
    if (id && !rg.data) return mostrarFallo(cont, 'No se encontró este gasto.');
    const g = rg.data;
    const vehiculos = rv.data;
    if (!vehiculos.length) return mostrarFallo(cont, 'Primero registra una camioneta en Vehículos.', '#vehiculos');

    const opcion = (valor, texto, elegido) => '<option value="' + esc(valor) + '"' + (elegido ? ' selected' : '') + '>' + esc(texto) + '</option>';
    cont.innerHTML =
      '<a class="volver" href="#gastos">← Gastos</a>' +
      '<form id="gas-form" class="panel formulario" novalidate>' +
        '<h1>' + (g ? 'Editar gasto' : 'Agregar gasto') + '</h1>' +
        '<div class="campos">' +
          '<div class="campo"><label for="g-veh">Camioneta *</label><select id="g-veh">' +
            (g ? '' : '<option value="">Elige una camioneta</option>') +
            vehiculos.map((v) => opcion(v.id, formatoPatente(v.patente) + (v.marca ? ' · ' + v.marca + ' ' + (v.modelo || '') : ''), g && g.vehiculo_id === v.id)).join('') +
          '</select></div>' +
          '<div class="campo"><label for="g-fecha">Fecha *</label><input id="g-fecha" type="date" max="' + hoy() + '" value="' + esc(g ? g.fecha : hoy()) + '"></div>' +
          '<div class="campo"><label for="g-tipo">Tipo *</label><select id="g-tipo">' +
            Object.keys(TIPOS).map((t) => opcion(t, TIPOS[t], g ? g.tipo === t : t === 'combustible')).join('') +
          '</select></div>' +
          '<div class="campo"><label for="g-monto">Monto en pesos *</label><input id="g-monto" inputmode="numeric" placeholder="Ej: 45000" value="' + esc(g ? g.monto : '') + '"></div>' +
          '<div class="campo" id="g-campo-litros"><label for="g-litros">Litros</label><input id="g-litros" inputmode="decimal" placeholder="Ej: 40,5" value="' + esc(g && g.litros ? String(g.litros).replace('.', ',') : '') + '">' +
            '<p class="sub">Sirve para calcular cuántos km rinde cada litro.</p></div>' +
          '<div class="campo"><label for="g-km">Km del tablero (opcional)</label><input id="g-km" inputmode="numeric" placeholder="Ej: 125430" value="' + esc(g && g.km != null ? g.km : '') + '"></div>' +
          '<div class="campo campo-ancho"><label for="g-detalle">Detalle</label><input id="g-detalle" maxlength="300" placeholder="Ej: Copec Pudahuel, cambio de aceite, TAG…" value="' + esc(g ? g.detalle || '' : '') + '"></div>' +
          '<div class="campo campo-ancho"><label for="g-foto">Foto de la boleta (opcional)</label><input id="g-foto" type="file" accept="image/*">' +
            '<p class="sub">' + (g && g.foto_path ? 'Ya hay una boleta guardada. Si eliges otra foto, la reemplaza. ' : '') + 'La foto se reduce sola a unos 200 KB.</p>' +
            (g && g.foto_path ? '<button type="button" class="btn btn-secundario btn-chico" id="g-ver">Ver boleta</button>' : '') + '</div>' +
        '</div>' +
        '<p id="g-mensaje" class="aviso aviso-error" role="alert" hidden></p>' +
        '<div class="acciones">' +
          (g ? '<button type="button" id="g-borrar" class="btn btn-secundario btn-peligro">Eliminar</button>' : '') +
          '<a class="btn btn-secundario" href="#gastos">Cancelar</a>' +
          '<button type="submit" id="g-guardar" class="btn btn-primario">Guardar</button>' +
        '</div>' +
      '</form>';

    const $ = (x) => document.getElementById(x);
    const avisar = (t, campo) => { $('g-mensaje').textContent = t; $('g-mensaje').hidden = false; if (campo) $(campo).focus(); };
    const btn = $('g-guardar');
    const ocupado = (si, texto) => { btn.disabled = si; btn.textContent = si ? texto : 'Guardar'; };
    // Los litros solo tienen sentido para combustible
    const mostrarLitros = () => { $('g-campo-litros').hidden = $('g-tipo').value !== 'combustible'; };
    $('g-tipo').addEventListener('change', mostrarLitros);
    mostrarLitros();
    if (g && g.foto_path) $('g-ver').addEventListener('click', (ev) => verPrivado(ev.currentTarget, 'documentos', g.foto_path));

    $('gas-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      $('g-mensaje').hidden = true;
      const veh = vehiculos.find((v) => v.id === $('g-veh').value);
      const fecha = $('g-fecha').value;
      const tipo = $('g-tipo').value;
      const monto = Number($('g-monto').value.replace(/[.$\s]/g, ''));
      const textoLitros = $('g-litros').value.trim().replace(',', '.');
      const litros = tipo === 'combustible' && textoLitros ? Number(textoLitros) : null;
      const textoKm = $('g-km').value.replace(/[.\s]/g, '');
      const km = textoKm ? Number(textoKm) : null;
      const archivo = $('g-foto').files[0] || null;

      if (!veh) return avisar('Elige la camioneta.', 'g-veh');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > hoy()) return avisar('Escribe una fecha válida (no futura).', 'g-fecha');
      if (!Number.isInteger(monto) || monto <= 0) return avisar('Escribe el monto en pesos, solo números (ej: 45000).', 'g-monto');
      if (litros !== null && (isNaN(litros) || litros <= 0 || litros >= 1000)) return avisar('Los litros deben ser un número (ej: 40,5).', 'g-litros');
      if (km !== null && (!Number.isInteger(km) || km < 0)) return avisar('El km debe ser un número entero (ej: 125430).', 'g-km');

      try {
        const gid = g ? g.id : crypto.randomUUID();
        // 1) Boleta (si se eligió): se reduce y se sube primero
        let ruta = g ? g.foto_path : null;
        if (archivo) {
          ocupado(true, 'Reduciendo foto…');
          const blob = await TJE_FOTOS.reducir(archivo).catch((e) => { e.claro = true; throw e; });
          ruta = veh.empresa_id + '/gastos/' + gid + '.jpg';
          ocupado(true, 'Subiendo boleta (' + Math.round(blob.size / 1024) + ' KB)…');
          const { error: errSubida } = await TJE.db.storage.from('documentos')
            .upload(ruta, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
          if (errSubida) throw errSubida;
        }
        // 2) Datos del gasto
        ocupado(true, 'Guardando…');
        const datos = {
          vehiculo_id: veh.id, empresa_id: veh.empresa_id, fecha, tipo, monto, litros, km,
          detalle: $('g-detalle').value.trim() || null, foto_path: ruta
        };
        const consulta = g
          ? TJE.db.from('gastos').update(datos).eq('id', g.id).select('id').single()
          : TJE.db.from('gastos').insert(Object.assign({ id: gid }, datos)).select('id').single();
        const { data, error: errGuardar } = await consulta;
        if (errGuardar || !data) throw errGuardar || new Error('sin respuesta');
        // Si la boleta cambió de camioneta/empresa, se borra la anterior
        if (g && g.foto_path && ruta !== g.foto_path) await TJE.db.storage.from('documentos').remove([g.foto_path]);
        mes = fecha.slice(0, 7); // muestra el mes del gasto recién guardado
        avisoPendiente = TIPOS[tipo] + ' ' + pesos(monto) + ' guardado ✓';
        location.hash = '#gastos';
      } catch (e) {
        ocupado(false);
        avisar(e && e.claro ? e.message : error(e));
      }
    });

    if (g) {
      $('g-borrar').addEventListener('click', async () => {
        if (!confirm('¿Eliminar este gasto de ' + pesos(g.monto) + '?\n\nSe borra también la foto de la boleta. No se puede deshacer.')) return;
        $('g-borrar').disabled = true;
        const { error: err } = await TJE.db.from('gastos').delete().eq('id', g.id);
        if (err) { $('g-borrar').disabled = false; return avisar(error(err)); }
        if (g.foto_path) await TJE.db.storage.from('documentos').remove([g.foto_path]);
        avisoPendiente = 'Gasto eliminado';
        location.hash = '#gastos';
      });
    }
  }

  // Abre un archivo privado con un enlace temporal de 5 minutos
  async function verPrivado(boton, bucket, ruta) {
    const ventana = window.open('', '_blank'); // se abre de inmediato para que el navegador no la bloquee
    boton.disabled = true;
    const { data, error: err } = await TJE.db.storage.from(bucket).createSignedUrl(ruta, 300);
    boton.disabled = false;
    if (err || !data) {
      if (ventana) ventana.close();
      return alert('No se pudo abrir la foto. ' + (err ? error(err) : ''));
    }
    if (ventana) ventana.location.href = data.signedUrl;
    else location.href = data.signedUrl;
  }

  // ------------------------------------------------------------------
  // PESTAÑA 2: TABLERO (lecturas de los choferes)
  // ------------------------------------------------------------------
  const COLUMNAS_LECTURA = 'id, vehiculo_id, turno_id, momento, km_anotado, km_verificado, estado, sin_foto, motivo_sin_foto, foto_path, created_at, ' +
    'vehiculo:vehiculos!lecturas_tablero_vehiculo_id_fkey(patente), chofer:conductores!lecturas_tablero_chofer_id_fkey(nombre)';

  // Marca las lecturas cuyo km es MENOR que la lectura anterior de la misma camioneta
  function marcarRetrocesos(lecturas) {
    const ultimo = {};
    lecturas.forEach((l) => {
      const km = l.km_verificado != null ? l.km_verificado : l.km_anotado;
      l.retrocede = ultimo[l.vehiculo_id] != null && km < ultimo[l.vehiculo_id];
      ultimo[l.vehiculo_id] = km;
    });
    return lecturas;
  }

  async function listaTablero(cont, miCarga) {
    cont.innerHTML = '<p class="sub">Cargando…</p>';
    const [rl, rp] = await Promise.all([consultaLecturas(mes, COLUMNAS_LECTURA), contarPendientes()]);
    if (miCarga !== carga) return;
    if (rl.error) return mostrarFallo(cont, rl.error, '#inicio');
    const todas = marcarRetrocesos(rl.data);
    const conFoto = todas.filter((l) => !l.sin_foto).reverse(); // más nuevas primero
    const pendientes = conFoto.filter((l) => l.estado === 'pendiente');
    const revisadas = conFoto.filter((l) => l.estado !== 'pendiente');
    const sinFoto = todas.filter((l) => l.sin_foto).reverse();
    const n = (e) => conFoto.filter((l) => l.estado === e).length;

    cont.innerHTML = cabecera('tablero', rp.count) +
      '<section class="doc-contadores">' +
        contador('doc-por_vencer', String(pendientes.length), 'Por verificar') +
        contador('doc-vencido', String(n('no_coincide')), 'No coinciden') +
        contador('doc-al_dia', String(n('coincide')), 'Coinciden') +
        contador('doc-falta', String(sinFoto.length), 'Sin foto') +
      '</section>' +
      (todas.length ? '' : '<p class="aviso aviso-atencion">Aún no hay lecturas en ' + esc(nombreMes(mes)) +
        '. Aparecerán cuando los choferes fotografíen el tablero al iniciar y cerrar su turno.</p>') +
      bloqueLecturas('Por verificar', pendientes, 'Toca una lectura para ver la foto y anotar el km que se ve.') +
      bloqueLecturas('Sin foto', sinFoto, 'El chofer anotó el km pero no pudo tomar la foto.') +
      bloqueLecturas('Ya revisadas', revisadas, '');
    activarMes();
  }

  function bloqueLecturas(titulo, lista, ayuda) {
    if (!lista.length) return '';
    return '<section class="panel"><h2>' + esc(titulo) + ' (' + lista.length + ')</h2>' +
      (ayuda ? '<p class="sub">' + esc(ayuda) + '</p>' : '') +
      '<div class="doc-lista">' + lista.map(filaLectura).join('') + '</div></section>';
  }

  function filaLectura(l) {
    const lineas = [
      esc(fechaHora(l.created_at)),
      l.momento === 'inicio' ? 'inicio de turno' : 'cierre de turno',
      esc(l.chofer ? l.chofer.nombre : '—')
    ];
    if (l.sin_foto) lineas.push('Motivo: ' + esc(l.motivo_sin_foto));
    if (l.km_verificado != null && l.km_verificado !== l.km_anotado) lineas.push('la oficina vio <b>' + esc(numero(l.km_verificado)) + ' km</b>');
    const titulo = '<div class="doc-fila-titulo"><strong><span class="placa placa-chica">' + esc(formatoPatente(l.vehiculo ? l.vehiculo.patente : '')) + '</span> ' +
        esc(numero(l.km_anotado)) + ' km</strong>' + (l.sin_foto ? pill('doc-falta', 'Sin foto') : pill(PILL_ESTADO[l.estado], ESTADOS[l.estado])) + '</div>';
    const cuerpo = titulo + '<p class="sub">' + lineas.join(' · ') + '</p>' +
      (l.retrocede ? '<p class="sub texto-error">⚠ Este km es menor que la lectura anterior de esta camioneta.</p>' : '');
    return l.sin_foto
      ? '<div class="doc-fila">' + cuerpo + '</div>'
      : '<a class="doc-fila gas-fila" href="#gastos/tablero/' + esc(l.id) + '">' + cuerpo + '</a>';
  }

  // Verificar una lectura: foto al lado del km anotado
  async function verificar(cont, id, miCarga) {
    cont.innerHTML = '<p class="sub">Cargando…</p>';
    const { data: l, error: err } = await TJE.db.from('lecturas_tablero').select(COLUMNAS_LECTURA).eq('id', id).maybeSingle();
    if (miCarga !== carga) return;
    if (err || !l) return mostrarFallo(cont, err || 'No se encontró esta lectura.', '#gastos/tablero');
    if (l.sin_foto) return mostrarFallo(cont, 'Esta lectura no tiene foto.', '#gastos/tablero');

    cont.innerHTML =
      '<a class="volver" href="#gastos/tablero">← Tablero</a>' +
      '<section class="panel ficha">' +
        '<div class="doc-fila-titulo"><div class="placa placa-grande">' + esc(formatoPatente(l.vehiculo ? l.vehiculo.patente : '')) + '</div>' +
          pill(PILL_ESTADO[l.estado], ESTADOS[l.estado]) + '</div>' +
        '<p class="sub">' + esc(fechaHora(l.created_at)) + ' · ' + (l.momento === 'inicio' ? 'inicio de turno' : 'cierre de turno') +
          ' · ' + esc(l.chofer ? l.chofer.nombre : '—') + '</p>' +
        '<div class="gas-verificar">' +
          '<div id="v-foto" class="foto-marco"><span class="sub">Cargando foto…</span></div>' +
          '<form id="v-form" class="formulario" novalidate>' +
            '<p>El chofer anotó: <b class="gas-km">' + esc(numero(l.km_anotado)) + ' km</b></p>' +
            '<div class="campo"><label for="v-km">¿Qué km se ve en la foto? *</label>' +
              '<input id="v-km" inputmode="numeric" placeholder="Ej: ' + esc(l.km_anotado) + '" value="' + esc(l.km_verificado != null ? l.km_verificado : '') + '"></div>' +
            '<p id="v-dif" class="sub" hidden></p>' +
            '<p id="v-mensaje" class="aviso aviso-error" role="alert" hidden></p>' +
            '<div class="acciones">' +
              '<button type="button" id="v-igual" class="btn btn-secundario">Es el mismo km</button>' +
              '<button type="submit" id="v-guardar" class="btn btn-primario">Guardar</button>' +
            '</div>' +
            '<p class="sub">La foto se ve con un enlace que dura 5 minutos. Si no carga, vuelve a abrir esta lectura.</p>' +
          '</form>' +
        '</div>' +
      '</section>';

    const $ = (x) => document.getElementById(x);
    // Foto privada con enlace de 5 minutos
    TJE.db.storage.from('tablero').createSignedUrl(l.foto_path, 300).then(({ data }) => {
      const marco = $('v-foto');
      if (!marco) return;
      marco.innerHTML = data
        ? '<img alt="Foto del tablero" src="' + esc(data.signedUrl) + '">'
        : '<span class="sub">No se pudo cargar la foto.</span>';
    });
    // Muestra la diferencia mientras se escribe
    const leerKm = () => { const t = $('v-km').value.replace(/[.\s]/g, ''); return t ? Number(t) : null; };
    const mostrarDif = () => {
      const km = leerKm();
      const dif = $('v-dif');
      dif.hidden = km === null || isNaN(km);
      if (dif.hidden) return;
      const d = km - l.km_anotado;
      dif.textContent = d === 0 ? '✓ Coincide con lo anotado.' : 'Diferencia: ' + (d > 0 ? '+' : '') + numero(d) + ' km (quedará marcada como "no coincide").';
      dif.classList.toggle('texto-error', d !== 0);
    };
    $('v-km').addEventListener('input', mostrarDif);
    mostrarDif();
    $('v-igual').addEventListener('click', () => { $('v-km').value = l.km_anotado; mostrarDif(); $('v-form').requestSubmit(); });

    $('v-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      $('v-mensaje').hidden = true;
      const km = leerKm();
      if (km === null || !Number.isInteger(km) || km < 0) {
        $('v-mensaje').textContent = 'Escribe el km que se ve en la foto, solo números.';
        $('v-mensaje').hidden = false;
        return $('v-km').focus();
      }
      const btn = $('v-guardar');
      btn.disabled = true;
      btn.textContent = 'Guardando…';
      // Solo se envía el km; quién, cuándo y "coincide / no coincide" los pone la base (SQL 08)
      const { data, error: e2 } = await TJE.db.from('lecturas_tablero').update({ km_verificado: km }).eq('id', l.id).select('estado').single();
      if (e2 || !data) {
        btn.disabled = false;
        btn.textContent = 'Guardar';
        $('v-mensaje').textContent = error(e2 || new Error('sin respuesta'));
        $('v-mensaje').hidden = false;
        return;
      }
      avisoPendiente = formatoPatente(l.vehiculo ? l.vehiculo.patente : '') + ': ' + ESTADOS[data.estado].toLowerCase() + ' ✓';
      location.hash = '#gastos/tablero';
    });
  }

  // ------------------------------------------------------------------
  // PESTAÑA 3: COSTOS POR CAMIONETA (se calcula aquí, no se guarda)
  // ------------------------------------------------------------------
  async function costos(cont, miCarga) {
    cont.innerHTML = '<p class="sub">Cargando…</p>';
    const r = rangoMes(mes);
    const [rv, rg, rl, rp] = await Promise.all([
      consultaVehiculos(),
      TJE.db.from('gastos').select('vehiculo_id, tipo, monto, litros').gte('fecha', r.desde).lt('fecha', r.hasta).limit(2000),
      consultaLecturas(mes, 'vehiculo_id, turno_id, momento, km_anotado, km_verificado'),
      contarPendientes()
    ]);
    if (miCarga !== carga) return;
    const fallo = rv.error || rg.error || rl.error;
    if (fallo) return mostrarFallo(cont, fallo, '#inicio');

    // Km por turno = km al cierre − km al inicio (si la oficina verificó, se usa su km)
    const turnos = {};
    rl.data.forEach((l) => {
      const t = turnos[l.turno_id] || (turnos[l.turno_id] = { vehiculo_id: l.vehiculo_id });
      t[l.momento] = l.km_verificado != null ? l.km_verificado : l.km_anotado;
    });
    const filas = rv.data.map((v) => {
      const gs = rg.data.filter((g) => g.vehiculo_id === v.id);
      const suma = (f) => gs.filter(f).reduce((s, g) => s + g.monto, 0);
      const ts = Object.values(turnos).filter((t) => t.vehiculo_id === v.id && t.inicio != null && t.cierre != null && t.cierre >= t.inicio);
      const km = ts.reduce((s, t) => s + (t.cierre - t.inicio), 0);
      const litros = gs.filter((g) => g.tipo === 'combustible' && g.litros).reduce((s, g) => s + Number(g.litros), 0);
      return {
        v, km, litros, turnos: ts.length,
        total: suma(() => true),
        combustible: suma((g) => g.tipo === 'combustible'),
        mantencion: suma((g) => g.tipo === 'mantencion'),
        otros: suma((g) => g.tipo === 'peaje' || g.tipo === 'otro')
      };
    }).filter((f) => f.total > 0 || f.km > 0);

    const tot = filas.reduce((s, f) => ({ total: s.total + f.total, km: s.km + f.km }), { total: 0, km: 0 });
    cont.innerHTML = cabecera('costos', rp.count) +
      '<section class="doc-contadores">' +
        contador('gas-total', pesos(tot.total), 'Gasto total del mes') +
        contador('gas-combustible', numero(tot.km) + ' km', 'Km recorridos (turnos completos)') +
        contador('gas-mantencion', tot.km ? pesos(tot.total / tot.km) : '—', 'Costo por km (flota)') +
      '</section>' +
      (filas.length
        ? '<section class="panel"><div class="doc-lista">' + filas.map(filaCosto).join('') + '</div></section>'
        : '<p class="aviso aviso-atencion">No hay gastos ni turnos completos en ' + esc(nombreMes(mes)) + '.</p>') +
      '<p class="sub">Los km salen de las lecturas del tablero (cierre − inicio de cada turno). Si un turno no tiene ' +
        'las dos lecturas, sus km no se cuentan. El rendimiento (km por litro) es aproximado cuando no se llena el estanque en cada carga.</p>';
    activarMes();
  }

  function filaCosto(f) {
    const lineas = [
      'Combustible ' + pesos(f.combustible),
      'Mantención ' + pesos(f.mantencion),
      'Peajes y otros ' + pesos(f.otros)
    ];
    const datos = [
      numero(f.km) + ' km en ' + f.turnos + (f.turnos === 1 ? ' turno' : ' turnos'),
      'Costo por km: <b>' + (f.km ? esc(pesos(f.total / f.km)) : '—') + '</b>',
      'Rendimiento: <b>' + (f.km && f.litros ? esc(numero(Math.round((f.km / f.litros) * 10) / 10)) + ' km/litro' : '—') + '</b>'
    ];
    return '<div class="doc-fila">' +
        '<div class="doc-fila-titulo"><strong><span class="placa placa-chica">' + esc(formatoPatente(f.v.patente)) + '</span> ' +
          esc([f.v.marca, f.v.modelo].filter(Boolean).join(' ')) + '</strong><b>' + esc(pesos(f.total)) + '</b></div>' +
        '<p class="sub">' + lineas.map(esc).join(' · ') + '</p>' +
        '<p class="sub">' + datos.join(' · ') + '</p>' +
      '</div>';
  }

  window.TJE_MODULOS = window.TJE_MODULOS || {};
  window.TJE_MODULOS.gastos = { pintar };
})();
