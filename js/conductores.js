// =====================================================================
// TJE EXPRESS · conductores.js
// Módulo Conductores: lista, ficha, agregar y editar choferes.
//   #conductores              → lista (oficina y admin)
//   #conductores/nuevo        → formulario vacío
//   #conductores/<id>         → ficha del chofer
//   #conductores/<id>/editar  → formulario con sus datos
//   #ficha                    → "Mi ficha" del propio chofer (solo lectura)
// =====================================================================
(function () {
  const CONTRATOS = ['Indefinido', 'Plazo fijo', 'Honorarios', 'Otro'];
  const ESTADOS = { activo: 'Activo', inactivo: 'Inactivo' };
  const COLUMNAS_LISTA =
    'id, nombre, rut, cargo, estado, telefono_personal, telefono_empresa, ' +
    'bodega:bodegas!conductores_bodega_id_fkey(nombre, color), ' +
    'vehiculos:vehiculos!vehiculos_conductor_asignado_id_fkey(patente)';
  const COLUMNAS_FICHA = COLUMNAS_LISTA +
    ', empresa_id, bodega_id, fecha_nacimiento, direccion, fecha_vinculacion, tipo_contrato, foto_path, ' +
    'acceso:perfiles!perfiles_conductor_id_fkey(id)';

  let turno = 0;
  let avisoPendiente = '';

  const esc = (t) => window.TJE_UI.escapar(t);
  const normalizar = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const puedeEditar = (perfil) => perfil.rol === 'admin' || perfil.rol === 'oficina';
  const colorBodega = (b) => (b && /^#[0-9a-f]{3,8}$/i.test(b.color) ? b.color : '#8fa4be');
  const pillEstado = (e) => '<span class="pill pill-' + (e === 'activo' ? 'operativo' : 'fuera_de_servicio') + '">' + esc(ESTADOS[e] || e) + '</span>';
  const iniciales = (t) => String(t || '').replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean)
    .slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
  const patentes = (c) => (Array.isArray(c.vehiculos) ? c.vehiculos : c.vehiculos ? [c.vehiculos] : [])
    .map((v) => { const s = String(v.patente || ''); return s.length === 6 ? s.slice(0, 2) + '-' + s.slice(2, 4) + '-' + s.slice(4) : s; });

  // ---------- RUT chileno ----------
  const limpiarRut = (r) => String(r || '').toUpperCase().replace(/[^0-9K]/g, '');
  function rutValido(r) {
    const s = limpiarRut(r);
    if (s.length < 2) return false;
    const cuerpo = s.slice(0, -1);
    const dv = s.slice(-1);
    if (!/^\d+$/.test(cuerpo)) return false;
    let suma = 0;
    let m = 2;
    for (let i = cuerpo.length - 1; i >= 0; i--) {
      suma += Number(cuerpo[i]) * m;
      m = m === 7 ? 2 : m + 1;
    }
    const r11 = 11 - (suma % 11);
    return dv === (r11 === 11 ? '0' : r11 === 10 ? 'K' : String(r11));
  }
  function formatoRut(r) {
    const s = limpiarRut(r);
    if (s.length < 2) return s;
    return s.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + s.slice(-1);
  }
  const rutParaGuardar = (r) => { const s = limpiarRut(r); return s.slice(0, -1) + '-' + s.slice(-1); };

  // ---------- Fechas ----------
  const fechaLarga = (f) => (f
    ? new Date(f + 'T00:00:00Z').toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })
    : '—');
  function mesesEntre(desde) {
    const d = new Date(desde + 'T00:00:00Z');
    const h = new Date();
    let meses = (h.getUTCFullYear() - d.getUTCFullYear()) * 12 + (h.getUTCMonth() - d.getUTCMonth());
    if (h.getUTCDate() < d.getUTCDate()) meses -= 1;
    return Math.max(0, meses);
  }
  const edad = (f) => (f ? Math.floor(mesesEntre(f) / 12) + ' años' : '—');
  function antiguedad(f) {
    if (!f) return '';
    const m = mesesEntre(f);
    const a = Math.floor(m / 12);
    const r = m % 12;
    const partes = [];
    if (a) partes.push(a + (a === 1 ? ' año' : ' años'));
    if (r) partes.push(r + (r === 1 ? ' mes' : ' meses'));
    return partes.length ? partes.join(' y ') : 'menos de un mes';
  }

  // ---------- Teléfonos ----------
  const telLink = (t) => 'tel:' + String(t || '').replace(/[^\d+]/g, '');
  const telFila = (t) => (t ? '<a class="enlace-tel" href="' + esc(telLink(t)) + '">' + esc(t) + '</a>' : '—');

  function mensajeError(e) {
    if (e && e.code === '23505') return 'Ya existe un chofer con ese RUT en la empresa.';
    return window.TJE.traducirError(e);
  }

  // ------------------------------------------------------------------
  // Punto de entrada
  // ------------------------------------------------------------------
  function pintar(cont, perfil, partes) {
    const miTurno = ++turno;
    const [a, b] = partes;
    if (!puedeEditar(perfil)) return (location.hash = '#ficha');
    if (!a) return lista(cont, perfil, miTurno);
    if (a === 'nuevo') return formulario(cont, perfil, null, miTurno);
    if (b === 'editar') return formulario(cont, perfil, a, miTurno);
    return ficha(cont, perfil, a, miTurno);
  }

  // "Mi ficha" del chofer (solo lectura)
  function pintarMiFicha(cont, perfil) {
    const miTurno = ++turno;
    if (!perfil.conductor_id) {
      cont.innerHTML = '<p class="aviso aviso-error">Tu usuario no tiene una ficha de chofer enlazada. Avisa a la oficina.</p>';
      return;
    }
    return ficha(cont, perfil, perfil.conductor_id, miTurno, true);
  }

  // ------------------------------------------------------------------
  // LISTA
  // ------------------------------------------------------------------
  async function lista(cont, perfil, miTurno) {
    cont.innerHTML =
      '<section class="barra-modulo">' +
        '<div><h1 class="titulo-modulo">Conductores</h1><p class="sub" id="con-cuenta">Cargando…</p></div>' +
        '<div class="barra-acciones">' +
          '<input id="con-buscar" class="buscador" type="search" placeholder="Buscar nombre, RUT o teléfono" aria-label="Buscar chofer">' +
          '<a class="btn btn-primario" href="#conductores/nuevo">+ Agregar chofer</a>' +
        '</div>' +
      '</section>' +
      '<div id="con-grilla" class="grilla-tarjetas"></div>';

    const { data, error } = await TJE.db.from('conductores').select(COLUMNAS_LISTA).order('nombre');
    if (miTurno !== turno) return;
    const grilla = document.getElementById('con-grilla');
    if (error) {
      document.getElementById('con-cuenta').textContent = '';
      grilla.innerHTML = '<p class="aviso aviso-error">' + esc(mensajeError(error)) + '</p>';
      return;
    }
    document.getElementById('con-cuenta').textContent = data.length === 1 ? '1 chofer' : data.length + ' choferes';
    if (!data.length) {
      grilla.innerHTML = '<section class="panel vacio"><h1>Aún no hay choferes</h1>' +
        '<p>Agrega el primero con el botón "Agregar chofer".</p></section>';
      document.getElementById('con-buscar').hidden = true;
      return;
    }
    grilla.innerHTML = data.map(tarjeta).join('');
    document.getElementById('con-buscar').addEventListener('input', (ev) => {
      const q = normalizar(ev.target.value).replace(/[^a-z0-9 ]/g, '').trim();
      document.querySelectorAll('#con-grilla .tarjeta-veh').forEach((t) => {
        t.hidden = q && !t.dataset.buscar.includes(q);
      });
    });
  }

  function tarjeta(c) {
    const pats = patentes(c);
    const buscar = normalizar([c.nombre, limpiarRut(c.rut), c.telefono_personal, c.telefono_empresa, pats.join(' ')]
      .filter(Boolean).join(' ').replace(/[^\w ]/g, ''));
    return '<a class="tarjeta-veh" style="--c:' + colorBodega(c.bodega) + '" href="#conductores/' + esc(c.id) + '" data-buscar="' + esc(buscar) + '">' +
        '<div class="tarjeta-fila">' +
          '<span class="bodega-etq">' + esc(c.bodega ? c.bodega.nombre : 'Sin bodega') + '</span>' +
          pillEstado(c.estado) +
        '</div>' +
        '<div class="chofer-linea">' +
          '<span class="avatar avatar-chofer">' + esc(iniciales(c.nombre)) + '</span>' +
          '<div><div class="tarjeta-modelo">' + esc(c.nombre) + '</div><div class="sub">' + esc(c.cargo || '') + '</div></div>' +
        '</div>' +
        '<div class="tarjeta-fila sub">' +
          '<span>' + esc(c.telefono_empresa || c.telefono_personal || 'Sin teléfono') + '</span>' +
          '<span>' + esc(pats.length ? pats.join(', ') : 'Sin camioneta') + '</span>' +
        '</div>' +
      '</a>';
  }

  // ------------------------------------------------------------------
  // FICHA
  // ------------------------------------------------------------------
  async function ficha(cont, perfil, id, miTurno, esMiFicha) {
    cont.innerHTML = '<p class="sub">Cargando…</p>';
    const { data: c, error } = await TJE.db.from('conductores').select(COLUMNAS_FICHA).eq('id', id).maybeSingle();
    if (miTurno !== turno) return;
    if (error || !c) {
      cont.innerHTML = '<p class="aviso aviso-error">' + esc(error ? mensajeError(error) : 'No se encontró este chofer.') + '</p>' +
        (esMiFicha ? '' : '<a class="btn btn-secundario" href="#conductores">← Volver a Conductores</a>');
      return;
    }

    const editar = puedeEditar(perfil) && !esMiFicha;
    const aviso = avisoPendiente;
    avisoPendiente = '';
    const fila = (k, v) => '<div><dt>' + esc(k) + '</dt><dd>' + v + '</dd></div>';
    const telLlamar = c.telefono_empresa || c.telefono_personal;
    const pats = patentes(c);
    const tieneAcceso = Array.isArray(c.acceso) ? c.acceso.length > 0 : !!c.acceso;

    cont.innerHTML =
      (aviso ? '<p class="aviso aviso-ok">' + esc(aviso) + '</p>' : '') +
      (esMiFicha ? '' : '<a class="volver" href="#conductores">← Conductores</a>') +
      '<section class="panel ficha" style="--c:' + colorBodega(c.bodega) + '">' +
        '<div class="chofer-cabecera">' +
          '<div id="con-avatar" class="avatar-grande">' + esc(iniciales(c.nombre)) + '</div>' +
          '<div class="chofer-titulo">' +
            '<h1>' + esc(c.nombre) + '</h1>' +
            pillEstado(c.estado) +
            '<p class="sub">' + esc([c.cargo, c.bodega && c.bodega.nombre].filter(Boolean).join(' · ')) + '</p>' +
          '</div>' +
          '<div class="chofer-acciones">' +
            (telLlamar && !esMiFicha ? '<a class="btn btn-llamar" href="' + esc(telLink(telLlamar)) + '" aria-label="Llamar al chofer">📞 Llamar</a>' : '') +
            (editar ? '<a class="btn btn-secundario" href="#conductores/' + esc(c.id) + '/editar">Editar</a>' : '') +
          '</div>' +
        '</div>' +
      '</section>' +
      '<section class="panel ficha-seccion">' +
        '<h2>Datos personales</h2>' +
        '<dl class="lista-datos">' +
          fila('Edad', esc(edad(c.fecha_nacimiento))) +
          fila('RUT', esc(c.rut ? formatoRut(c.rut) : '—')) +
          fila('Dirección', esc(c.direccion || '—')) +
          fila('N° contacto (personal)', telFila(c.telefono_personal)) +
          fila('N° contacto (empresa)', telFila(c.telefono_empresa)) +
          fila('Fecha de vinculación', esc(fechaLarga(c.fecha_vinculacion)) +
            (c.fecha_vinculacion ? '<br><span class="sub">' + esc(antiguedad(c.fecha_vinculacion)) + '</span>' : '')) +
        '</dl>' +
      '</section>' +
      '<section class="panel ficha-seccion">' +
        '<h2>Información laboral</h2>' +
        '<dl class="lista-datos">' +
          fila('Cargo', esc(c.cargo || '—')) +
          fila('Bodega asignada', c.bodega ? '<span class="bodega-etq" style="--c:' + colorBodega(c.bodega) + '">' + esc(c.bodega.nombre) + '</span>' : '—') +
          fila('Tipo de contrato', esc(c.tipo_contrato || '—')) +
          fila('Camioneta asignada', esc(pats.length ? pats.join(', ') : 'Sin camioneta')) +
          fila('Estado', pillEstado(c.estado)) +
          (esMiFicha ? '' : fila('Acceso a la app', tieneAcceso ? 'Sí' : 'Aún no')) +
        '</dl>' +
      '</section>' +
      (editar
        ? '<section class="panel ficha-seccion">' +
            '<h2>Foto</h2>' +
            '<div class="bloque">' +
              '<label class="btn btn-secundario btn-archivo"><span id="con-foto-txt">' + (c.foto_path ? 'Cambiar foto' : 'Subir foto') + '</span>' +
              '<input id="con-foto-input" type="file" accept="image/*" hidden></label>' +
              '<p id="con-foto-estado" class="sub" hidden></p>' +
            '</div>' +
          '</section>'
        : '') +
      '<section class="panel ficha-seccion proximamente"><h2>Actividad y documentos</h2>' +
        '<p class="sub">Historial de jornadas y documentos (licencia, antecedentes, examen médico) en una próxima versión.</p></section>';

    const ponerFoto = (url) => {
      const av = document.getElementById('con-avatar');
      if (av && url) av.innerHTML = '<img alt="Foto de ' + esc(c.nombre) + '" src="' + esc(url) + '">';
    };
    if (c.foto_path) {
      TJE_FOTOS.enlace(c.foto_path).then((url) => { if (miTurno === turno) ponerFoto(url); });
    }
    if (editar) {
      TJE_FOTOS.activarSubida({
        input: document.getElementById('con-foto-input'),
        estado: document.getElementById('con-foto-estado'),
        ruta: c.empresa_id + '/conductores/' + c.id + '.jpg',
        tabla: 'conductores',
        id: c.id,
        rutaActual: c.foto_path,
        alMostrar: (url) => {
          ponerFoto(url);
          document.getElementById('con-foto-txt').textContent = 'Cambiar foto';
        }
      });
    }
  }

  // ------------------------------------------------------------------
  // FORMULARIO
  // ------------------------------------------------------------------
  async function formulario(cont, perfil, id, miTurno) {
    cont.innerHTML = '<p class="sub">Cargando…</p>';
    const consultas = [TJE.db.from('bodegas').select('id, nombre, empresa_id').eq('activa', true).order('nombre')];
    if (id) consultas.push(TJE.db.from('conductores').select('*').eq('id', id).maybeSingle());
    const [rb, rc] = await Promise.all(consultas);
    if (miTurno !== turno) return;
    const fallo = rb.error || (rc && rc.error);
    if (fallo || (id && !rc.data)) {
      cont.innerHTML = '<p class="aviso aviso-error">' + esc(fallo ? mensajeError(fallo) : 'No se encontró este chofer.') + '</p>' +
        '<a class="btn btn-secundario" href="#conductores">← Volver a Conductores</a>';
      return;
    }
    const bodegas = rb.data;
    const c = id ? rc.data : { cargo: 'Chofer repartidor', tipo_contrato: 'Indefinido', estado: 'activo' };
    const volver = id ? '#conductores/' + id : '#conductores';
    const campo = (idc, etq, html, ancho) =>
      '<div class="campo' + (ancho ? ' campo-ancho' : '') + '"><label for="' + idc + '">' + etq + '</label>' + html + '</div>';
    const input = (idc, valor, extra) => '<input id="' + idc + '" value="' + esc(valor || '') + '" ' + (extra || '') + '>';

    cont.innerHTML =
      '<a class="volver" href="' + volver + '">← Volver</a>' +
      '<form id="con-form" class="panel formulario" novalidate>' +
        '<h1>' + (id ? 'Editar chofer' : 'Agregar chofer') + '</h1>' +
        '<h2 class="subtitulo-form">Datos personales</h2>' +
        '<div class="campos">' +
          campo('f-nombre', 'Nombre completo *', input('f-nombre', c.nombre, 'maxlength="80" autocomplete="off" placeholder="Carlos More"'), true) +
          campo('f-rut', 'RUT', input('f-rut', c.rut ? formatoRut(c.rut) : '', 'maxlength="12" autocomplete="off" placeholder="12.345.678-5"')) +
          campo('f-nac', 'Fecha de nacimiento', input('f-nac', c.fecha_nacimiento, 'type="date"')) +
          campo('f-dir', 'Dirección', input('f-dir', c.direccion, 'maxlength="120" placeholder="Pudahuel, Santiago"'), true) +
          campo('f-telp', 'N° contacto (personal)', input('f-telp', c.telefono_personal, 'type="tel" inputmode="tel" maxlength="20" placeholder="+56 9 1234 5678"')) +
          campo('f-tele', 'N° contacto (empresa)', input('f-tele', c.telefono_empresa, 'type="tel" inputmode="tel" maxlength="20" placeholder="+56 2 2345 6789"')) +
        '</div>' +
        '<h2 class="subtitulo-form">Información laboral</h2>' +
        '<div class="campos">' +
          campo('f-cargo', 'Cargo', input('f-cargo', c.cargo, 'maxlength="60"')) +
          campo('f-vinc', 'Fecha de vinculación', input('f-vinc', c.fecha_vinculacion, 'type="date"')) +
          campo('f-bodega', 'Bodega *', '<select id="f-bodega"><option value="">Elige una bodega</option>' +
            bodegas.map((b) => '<option value="' + esc(b.id) + '"' + (b.id === c.bodega_id ? ' selected' : '') + '>' + esc(b.nombre) + '</option>').join('') + '</select>') +
          campo('f-contrato', 'Tipo de contrato', '<select id="f-contrato">' +
            CONTRATOS.map((t) => '<option' + (t === c.tipo_contrato ? ' selected' : '') + '>' + t + '</option>').join('') + '</select>') +
          campo('f-estado', 'Estado', '<select id="f-estado">' +
            Object.keys(ESTADOS).map((k) => '<option value="' + k + '"' + (k === c.estado ? ' selected' : '') + '>' + ESTADOS[k] + '</option>').join('') + '</select>') +
        '</div>' +
        '<p id="f-mensaje" class="aviso aviso-error" role="alert" hidden></p>' +
        '<div class="acciones">' +
          '<a class="btn btn-secundario" href="' + volver + '">Cancelar</a>' +
          '<button type="submit" id="f-guardar" class="btn btn-primario">Guardar</button>' +
        '</div>' +
      '</form>';

    const $ = (x) => document.getElementById(x);
    // El RUT se ordena solo al salir del campo: 123456785 → 12.345.678-5
    $('f-rut').addEventListener('blur', () => { if ($('f-rut').value.trim()) $('f-rut').value = formatoRut($('f-rut').value); });

    $('con-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const error = (t, campo) => { $('f-mensaje').textContent = t; $('f-mensaje').hidden = false; if (campo) $(campo).focus(); };
      const nombre = $('f-nombre').value.trim().replace(/\s+/g, ' ');
      const rut = $('f-rut').value.trim();
      const bodega = bodegas.find((b) => b.id === $('f-bodega').value);
      const hoy = new Date().toISOString().slice(0, 10);

      if (nombre.length < 3) return error('Escribe el nombre completo del chofer.', 'f-nombre');
      if (rut && !rutValido(rut)) return error('El RUT no es válido. Revisa el número y el dígito verificador.', 'f-rut');
      if ($('f-nac').value && $('f-nac').value > hoy) return error('La fecha de nacimiento no puede ser futura.', 'f-nac');
      if ($('f-nac').value && parseInt(edad($('f-nac').value), 10) < 18)
        return error('El chofer debe ser mayor de 18 años.', 'f-nac');
      if (!bodega) return error('Elige la bodega del chofer.', 'f-bodega');

      const datos = {
        empresa_id: bodega.empresa_id,
        bodega_id: bodega.id,
        nombre,
        rut: rut ? rutParaGuardar(rut) : null,
        fecha_nacimiento: $('f-nac').value || null,
        direccion: $('f-dir').value.trim() || null,
        telefono_personal: $('f-telp').value.trim() || null,
        telefono_empresa: $('f-tele').value.trim() || null,
        cargo: $('f-cargo').value.trim() || 'Chofer repartidor',
        fecha_vinculacion: $('f-vinc').value || null,
        tipo_contrato: $('f-contrato').value,
        estado: $('f-estado').value
      };

      const btn = $('f-guardar');
      btn.disabled = true;
      btn.textContent = 'Guardando…';
      $('f-mensaje').hidden = true;
      const { data, error: err } = await (id
        ? TJE.db.from('conductores').update(datos).eq('id', id).select('id').single()
        : TJE.db.from('conductores').insert(datos).select('id').single());
      if (err || !data) {
        btn.disabled = false;
        btn.textContent = 'Guardar';
        return error(err ? mensajeError(err) : 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
      }
      avisoPendiente = id ? 'Cambios guardados ✓' : 'Chofer agregado ✓';
      location.hash = '#conductores/' + data.id;
    });
    $('f-nombre').focus();
  }

  window.TJE_MODULOS = window.TJE_MODULOS || {};
  window.TJE_MODULOS.conductores = { pintar };
  window.TJE_MODULOS.ficha = { pintar: (cont, perfil) => pintarMiFicha(cont, perfil) };
})();
