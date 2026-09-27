// =====================================================================
// TJE EXPRESS · vehiculos.js
// Módulo Vehículos: lista, ficha, agregar y editar camionetas.
//   #vehiculos              → lista
//   #vehiculos/nuevo        → formulario vacío (oficina y admin)
//   #vehiculos/<id>         → ficha de una camioneta
//   #vehiculos/<id>/editar  → formulario con sus datos (oficina y admin)
// =====================================================================
(function () {
  const TIPOS = ['Furgón', 'Camioneta', 'Camión', 'Otro'];
  const ESTADOS = {
    operativo: 'Operativo',
    en_mantencion: 'En mantención',
    fuera_de_servicio: 'Fuera de servicio'
  };
  // Solo las columnas que se muestran (ahorro de datos).
  const COLUMNAS_LISTA =
    'id, patente, tipo, marca, modelo, anio, km_actual, estado, ' +
    'bodega:bodegas!vehiculos_bodega_id_fkey(nombre, color), ' +
    'conductor:conductores!vehiculos_conductor_asignado_id_fkey(nombre)';

  let turno = 0;            // evita que una carga lenta pinte sobre otra pantalla
  let avisoPendiente = '';  // mensaje "Guardado ✓" para mostrar en la ficha

  const esc = (t) => window.TJE_UI.escapar(t);
  const numero = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('es-CL'));
  const limpiarPatente = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const formatoPatente = (p) => {
    const s = limpiarPatente(p);
    return s.length === 6 ? s.slice(0, 2) + '-' + s.slice(2, 4) + '-' + s.slice(4) : s;
  };
  const puedeEditar = (perfil) => perfil.rol === 'admin' || perfil.rol === 'oficina';
  const pillEstado = (e) => '<span class="pill pill-' + esc(e) + '">' + esc(ESTADOS[e] || e) + '</span>';
  const colorBodega = (b) => (b && /^#[0-9a-f]{3,8}$/i.test(b.color) ? b.color : '#8fa4be');

  function mensajeError(e) {
    if (e && e.code === '23505') return 'Ya existe un vehículo con esa patente.';
    return window.TJE.traducirError(e);
  }

  // ------------------------------------------------------------------
  // Punto de entrada: decide qué pantalla mostrar
  // ------------------------------------------------------------------
  function pintar(cont, perfil, partes) {
    const miTurno = ++turno;
    const [a, b] = partes;
    if (!a) return lista(cont, perfil, miTurno);
    if (a === 'nuevo') return puedeEditar(perfil) ? formulario(cont, perfil, null, miTurno) : (location.hash = '#vehiculos');
    if (b === 'editar') return puedeEditar(perfil) ? formulario(cont, perfil, a, miTurno) : (location.hash = '#vehiculos/' + a);
    return ficha(cont, perfil, a, miTurno);
  }

  // ------------------------------------------------------------------
  // LISTA
  // ------------------------------------------------------------------
  async function lista(cont, perfil, miTurno) {
    cont.innerHTML =
      '<section class="barra-modulo">' +
        '<div><h1 class="titulo-modulo">Vehículos</h1><p class="sub" id="veh-cuenta">Cargando…</p></div>' +
        '<div class="barra-acciones">' +
          '<input id="veh-buscar" class="buscador" type="search" placeholder="Buscar patente, marca o chofer" aria-label="Buscar vehículo">' +
          (puedeEditar(perfil) ? '<a class="btn btn-primario" href="#vehiculos/nuevo">+ Agregar vehículo</a>' : '') +
        '</div>' +
      '</section>' +
      '<div id="veh-grilla" class="grilla-tarjetas"></div>';

    const { data, error } = await TJE.db.from('vehiculos').select(COLUMNAS_LISTA).order('patente');
    if (miTurno !== turno) return;
    if (error) {
      document.getElementById('veh-cuenta').textContent = '';
      document.getElementById('veh-grilla').innerHTML = '<p class="aviso aviso-error">' + esc(mensajeError(error)) + '</p>';
      return;
    }

    const cuenta = document.getElementById('veh-cuenta');
    cuenta.textContent = data.length === 1 ? '1 vehículo' : data.length + ' vehículos';

    if (!data.length) {
      document.getElementById('veh-grilla').innerHTML =
        '<section class="panel vacio"><h1>Aún no hay vehículos</h1>' +
        '<p>' + (puedeEditar(perfil) ? 'Agrega la primera camioneta con el botón "Agregar vehículo".' : 'La oficina todavía no ha registrado camionetas.') + '</p></section>';
      document.getElementById('veh-buscar').hidden = true;
      return;
    }

    document.getElementById('veh-grilla').innerHTML = data.map(tarjeta).join('');

    // Búsqueda en el propio equipo (no gasta datos)
    document.getElementById('veh-buscar').addEventListener('input', (ev) => {
      const q = ev.target.value.trim().toLowerCase().replace(/[^a-z0-9áéíóúñ ]/g, '');
      document.querySelectorAll('#veh-grilla .tarjeta-veh').forEach((t) => {
        t.hidden = q && !t.dataset.buscar.includes(q);
      });
    });
  }

  function tarjeta(v) {
    const c = colorBodega(v.bodega);
    const buscar = [limpiarPatente(v.patente), v.marca, v.modelo, v.conductor && v.conductor.nombre]
      .filter(Boolean).join(' ').toLowerCase();
    return '<a class="tarjeta-veh" style="--c:' + c + '" href="#vehiculos/' + esc(v.id) + '" data-buscar="' + esc(buscar) + '">' +
        '<div class="tarjeta-fila">' +
          '<span class="bodega-etq">' + esc(v.bodega ? v.bodega.nombre : 'Sin bodega') + '</span>' +
          pillEstado(v.estado) +
        '</div>' +
        '<div class="placa">' + esc(formatoPatente(v.patente)) + '</div>' +
        '<div class="tarjeta-modelo">' + esc([v.marca, v.modelo].filter(Boolean).join(' ') || v.tipo || '—') + '</div>' +
        '<div class="tarjeta-fila sub">' +
          '<span>' + numero(v.km_actual) + ' km</span>' +
          '<span>' + esc(v.conductor ? v.conductor.nombre : 'Sin chofer asignado') + '</span>' +
        '</div>' +
      '</a>';
  }

  // ------------------------------------------------------------------
  // FICHA
  // ------------------------------------------------------------------
  async function ficha(cont, perfil, id, miTurno) {
    cont.innerHTML = '<p class="sub">Cargando…</p>';
    const { data: v, error } = await TJE.db
      .from('vehiculos')
      .select(COLUMNAS_LISTA + ', gps_imei')
      .eq('id', id)
      .maybeSingle();
    if (miTurno !== turno) return;
    if (error || !v) {
      cont.innerHTML = '<p class="aviso aviso-error">' + esc(error ? mensajeError(error) : 'No se encontró este vehículo.') + '</p>' +
        '<a class="btn btn-secundario" href="#vehiculos">← Volver a Vehículos</a>';
      return;
    }

    const aviso = avisoPendiente;
    avisoPendiente = '';
    const fila = (k, val) => '<div><dt>' + esc(k) + '</dt><dd>' + val + '</dd></div>';

    cont.innerHTML =
      (aviso ? '<p class="aviso aviso-ok">' + esc(aviso) + '</p>' : '') +
      '<a class="volver" href="#vehiculos">← Vehículos</a>' +
      '<section class="panel ficha" style="--c:' + colorBodega(v.bodega) + '">' +
        '<div class="ficha-cabecera">' +
          '<div>' +
            '<div class="placa placa-grande">' + esc(formatoPatente(v.patente)) + '</div>' +
            '<h1>' + esc([v.marca, v.modelo].filter(Boolean).join(' ') || v.tipo || 'Vehículo') + '</h1>' +
            pillEstado(v.estado) +
          '</div>' +
          (puedeEditar(perfil) ? '<a class="btn btn-secundario" href="#vehiculos/' + esc(v.id) + '/editar">Editar</a>' : '') +
        '</div>' +
        '<dl class="lista-datos">' +
          fila('Tipo de vehículo', esc(v.tipo || '—')) +
          fila('Marca', esc(v.marca || '—')) +
          fila('Modelo', esc(v.modelo || '—')) +
          fila('Año', esc(v.anio || '—')) +
          fila('Kilometraje actual', numero(v.km_actual) + ' km') +
          fila('Bodega asignada', v.bodega ? '<span class="bodega-etq">' + esc(v.bodega.nombre) + '</span>' : '—') +
          fila('Chofer asignado', esc(v.conductor ? v.conductor.nombre : 'Sin chofer asignado')) +
          fila('GPS', esc(v.gps_imei ? 'IMEI ' + v.gps_imei : 'Sin GPS instalado')) +
        '</dl>' +
      '</section>' +
      '<section class="panel proximamente"><h2>Foto y código QR</h2>' +
        '<p class="sub">Se agregarán en la próxima versión.</p></section>';
  }

  // ------------------------------------------------------------------
  // FORMULARIO (agregar o editar)
  // ------------------------------------------------------------------
  async function formulario(cont, perfil, id, miTurno) {
    cont.innerHTML = '<p class="sub">Cargando…</p>';

    const consultas = [
      TJE.db.from('bodegas').select('id, nombre, color, empresa_id').eq('activa', true).order('nombre'),
      TJE.db.from('conductores').select('id, nombre, empresa_id').eq('estado', 'activo').order('nombre')
    ];
    if (id) consultas.push(TJE.db.from('vehiculos').select('*').eq('id', id).maybeSingle());
    const [rb, rc, rv] = await Promise.all(consultas);
    if (miTurno !== turno) return;

    const fallo = rb.error || rc.error || (rv && rv.error);
    if (fallo || (id && !rv.data)) {
      cont.innerHTML = '<p class="aviso aviso-error">' + esc(fallo ? mensajeError(fallo) : 'No se encontró este vehículo.') + '</p>' +
        '<a class="btn btn-secundario" href="#vehiculos">← Volver a Vehículos</a>';
      return;
    }
    const bodegas = rb.data;
    const conductores = rc.data;
    const v = id ? rv.data : { estado: 'operativo', km_actual: 0, tipo: 'Furgón' };

    const opciones = (lista, valor, vacio) =>
      (vacio ? '<option value="">' + esc(vacio) + '</option>' : '') +
      lista.map((o) => '<option value="' + esc(o.id) + '"' + (o.id === valor ? ' selected' : '') + '>' + esc(o.nombre) + '</option>').join('');

    const volver = id ? '#vehiculos/' + id : '#vehiculos';
    cont.innerHTML =
      '<a class="volver" href="' + volver + '">← Volver</a>' +
      '<form id="veh-form" class="panel formulario" novalidate>' +
        '<h1>' + (id ? 'Editar ' + esc(formatoPatente(v.patente)) : 'Agregar vehículo') + '</h1>' +
        '<div class="campos">' +
          '<div class="campo"><label for="f-patente">Patente *</label>' +
            '<input id="f-patente" maxlength="10" autocomplete="off" placeholder="AB-CD-12" value="' + esc(formatoPatente(v.patente)) + '"></div>' +
          '<div class="campo"><label for="f-tipo">Tipo</label><select id="f-tipo">' +
            TIPOS.map((t) => '<option' + (t === v.tipo ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div>' +
          '<div class="campo"><label for="f-marca">Marca</label>' +
            '<input id="f-marca" maxlength="40" placeholder="Citroën" value="' + esc(v.marca || '') + '"></div>' +
          '<div class="campo"><label for="f-modelo">Modelo</label>' +
            '<input id="f-modelo" maxlength="40" placeholder="Berlingo" value="' + esc(v.modelo || '') + '"></div>' +
          '<div class="campo"><label for="f-anio">Año</label>' +
            '<input id="f-anio" type="number" inputmode="numeric" min="1990" max="2100" placeholder="2022" value="' + esc(v.anio || '') + '"></div>' +
          '<div class="campo"><label for="f-km">Kilometraje actual</label>' +
            '<input id="f-km" type="number" inputmode="numeric" min="0" step="1" value="' + esc(v.km_actual ?? 0) + '"></div>' +
          '<div class="campo"><label for="f-bodega">Bodega *</label><select id="f-bodega">' +
            opciones(bodegas, v.bodega_id, 'Elige una bodega') + '</select></div>' +
          '<div class="campo"><label for="f-estado">Estado</label><select id="f-estado">' +
            Object.keys(ESTADOS).map((k) => '<option value="' + k + '"' + (k === v.estado ? ' selected' : '') + '>' + ESTADOS[k] + '</option>').join('') +
          '</select></div>' +
          '<div class="campo campo-ancho"><label for="f-chofer">Chofer asignado</label><select id="f-chofer"></select></div>' +
        '</div>' +
        '<p id="f-mensaje" class="aviso aviso-error" role="alert" hidden></p>' +
        '<div class="acciones">' +
          '<a class="btn btn-secundario" href="' + volver + '">Cancelar</a>' +
          '<button type="submit" id="f-guardar" class="btn btn-primario">Guardar</button>' +
        '</div>' +
      '</form>';

    const $ = (x) => document.getElementById(x);

    // El chofer asignado debe ser de la misma empresa que la bodega elegida
    function llenarChoferes() {
      const bodega = bodegas.find((b) => b.id === $('f-bodega').value);
      const lista = bodega ? conductores.filter((c) => c.empresa_id === bodega.empresa_id) : [];
      const actual = $('f-chofer').value || v.conductor_asignado_id;
      $('f-chofer').innerHTML = opciones(lista, actual, bodega ? 'Sin chofer asignado' : 'Primero elige la bodega');
    }
    llenarChoferes();
    $('f-bodega').addEventListener('change', llenarChoferes);

    $('veh-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const error = (t, campo) => {
        $('f-mensaje').textContent = t;
        $('f-mensaje').hidden = false;
        if (campo) $(campo).focus();
      };

      const patente = limpiarPatente($('f-patente').value);
      const anio = $('f-anio').value ? parseInt($('f-anio').value, 10) : null;
      const km = $('f-km').value === '' ? 0 : parseInt($('f-km').value, 10);
      const bodega = bodegas.find((b) => b.id === $('f-bodega').value);

      if (patente.length < 5 || patente.length > 8) return error('Escribe una patente válida (ejemplo: AB-CD-12).', 'f-patente');
      if (anio !== null && (isNaN(anio) || anio < 1990 || anio > 2100)) return error('El año debe estar entre 1990 y 2100.', 'f-anio');
      if (isNaN(km) || km < 0) return error('El kilometraje debe ser un número positivo.', 'f-km');
      if (!bodega) return error('Elige la bodega a la que pertenece la camioneta.', 'f-bodega');

      const datos = {
        empresa_id: bodega.empresa_id,
        bodega_id: bodega.id,
        patente,
        tipo: $('f-tipo').value,
        marca: $('f-marca').value.trim() || null,
        modelo: $('f-modelo').value.trim() || null,
        anio,
        km_actual: km,
        estado: $('f-estado').value,
        conductor_asignado_id: $('f-chofer').value || null
      };

      const btn = $('f-guardar');
      btn.disabled = true;
      btn.textContent = 'Guardando…';
      $('f-mensaje').hidden = true;

      const consulta = id
        ? TJE.db.from('vehiculos').update(datos).eq('id', id).select('id').single()
        : TJE.db.from('vehiculos').insert(datos).select('id').single();
      const { data, error: err } = await consulta;

      if (err || !data) {
        btn.disabled = false;
        btn.textContent = 'Guardar';
        return error(err ? mensajeError(err) : 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
      }
      avisoPendiente = id ? 'Cambios guardados ✓' : 'Vehículo agregado ✓';
      location.hash = '#vehiculos/' + data.id;
    });

    $('f-patente').focus();
  }

  window.TJE_MODULOS = window.TJE_MODULOS || {};
  window.TJE_MODULOS.vehiculos = { pintar };
})();
