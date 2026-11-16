// =====================================================================
// TJE EXPRESS · turnos.js
// Módulo "Turnos" para la oficina y el admin.
//   #turnos → quién tiene qué camioneta AHORA + turnos de los últimos 7 días
// La oficina puede cerrar un turno que el chofer olvidó cerrar.
// (La pantalla del chofer es otra: js/turno.js, "Mi turno".)
// =====================================================================
(function () {
  const DIAS = 7;      // cuántos días de historial se muestran
  const MAXIMO = 100;  // tope de filas por consulta (ahorro de datos)

  let carga = 0; // evita que una carga lenta pinte sobre otra pantalla

  const { escapar: esc, puedeEditar, colorBodega, formatoPatente } = window.TJE_UI;

  // Solo las columnas que se muestran (ahorro de datos).
  const COLUMNAS =
    'id, inicio, fin, ' +
    'conductor:conductores!turnos_conductor_id_fkey(nombre), ' +
    'vehiculo:vehiculos!turnos_vehiculo_id_fkey(patente, marca, modelo, bodega:bodegas!vehiculos_bodega_id_fkey(nombre, color))';

  const hora = (f) => new Date(f).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  const dia = (f) => new Date(f).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  function duracion(desde, hasta) {
    const min = Math.max(0, Math.floor(((hasta ? new Date(hasta) : new Date()) - new Date(desde)) / 60000));
    const h = Math.floor(min / 60);
    return (h ? h + ' h ' : '') + (min % 60) + ' min';
  }
  const modelo = (v) => [v.marca, v.modelo].filter(Boolean).join(' ') || 'Camioneta';

  // ------------------------------------------------------------------
  // Punto de entrada
  // ------------------------------------------------------------------
  async function pintar(cont, perfil) {
    const miCarga = ++carga;
    if (!puedeEditar(perfil)) return (location.hash = '#turno');

    cont.innerHTML =
      '<section class="barra-modulo">' +
        '<div><h1 class="titulo-modulo">Turnos</h1><p class="sub" id="tur-cuenta">Cargando…</p></div>' +
        '<div class="barra-acciones"><button type="button" class="btn btn-secundario" id="tur-actualizar">Actualizar</button></div>' +
      '</section>' +
      '<div id="tur-cuerpo" style="display:grid;gap:16px"></div>';
    document.getElementById('tur-actualizar').addEventListener('click', () => pintar(cont, perfil));

    // Una sola consulta: los turnos abiertos + los de los últimos días.
    const desde = new Date(Date.now() - DIAS * 86400000).toISOString();
    const { data, error } = await TJE.db
      .from('turnos')
      .select(COLUMNAS)
      .or('fin.is.null,inicio.gte.' + desde)
      .order('inicio', { ascending: false })
      .limit(MAXIMO);
    if (miCarga !== carga) return;

    const cuerpo = document.getElementById('tur-cuerpo');
    const cuenta = document.getElementById('tur-cuenta');
    if (error) {
      cuenta.textContent = '';
      cuerpo.innerHTML = '<p class="aviso aviso-error">' + esc(TJE.traducirError(error)) + '</p>';
      return;
    }

    const abiertos = data.filter((t) => !t.fin);
    const cerrados = data.filter((t) => t.fin);
    cuenta.textContent = (abiertos.length === 1 ? '1 camioneta en turno ahora' : abiertos.length + ' camionetas en turno ahora') +
      ' · actualizado ' + hora(new Date());

    cuerpo.innerHTML =
      '<section class="panel">' +
        '<h2>En turno ahora</h2>' +
        (abiertos.length
          ? '<div class="grilla-tarjetas">' + abiertos.map(tarjetaAbierto).join('') + '</div>'
          : '<p class="sub">Ningún chofer tiene un turno abierto en este momento.</p>') +
      '</section>' +
      '<section class="panel">' +
        '<h2>Últimos ' + DIAS + ' días</h2>' +
        (cerrados.length ? historial(cerrados) : '<p class="sub">No hay turnos cerrados en los últimos ' + DIAS + ' días.</p>') +
        (data.length === MAXIMO ? '<p class="sub">Se muestran los ' + MAXIMO + ' turnos más recientes.</p>' : '') +
      '</section>';

    cuerpo.querySelectorAll('[data-cerrar]').forEach((btn) =>
      btn.addEventListener('click', () => cerrar(cont, perfil, btn)));
  }

  // Tarjeta de un turno abierto (borde del color de la bodega)
  function tarjetaAbierto(t) {
    const v = t.vehiculo || {};
    const chofer = t.conductor ? t.conductor.nombre : 'Chofer no encontrado';
    return '<div class="tarjeta-veh" style="--c:' + colorBodega(v.bodega) + '">' +
        '<div class="tarjeta-fila">' +
          '<span class="bodega-etq">' + esc(v.bodega ? v.bodega.nombre : 'Sin bodega') + '</span>' +
          '<span class="pill pill-operativo">En turno</span>' +
        '</div>' +
        '<div class="placa">' + esc(formatoPatente(v.patente)) + '</div>' +
        '<div class="tarjeta-modelo">' + esc(chofer) + '</div>' +
        '<div class="tarjeta-fila sub">' +
          '<span>' + esc(modelo(v)) + '</span>' +
          '<span>Desde ' + esc(hora(t.inicio)) + ' · ' + esc(duracion(t.inicio)) + '</span>' +
        '</div>' +
        '<button type="button" class="btn btn-secundario" data-cerrar="' + esc(t.id) + '" ' +
          'data-quien="' + esc(chofer) + '" data-patente="' + esc(formatoPatente(v.patente)) + '">Cerrar turno</button>' +
      '</div>';
  }

  // Historial agrupado por día
  function historial(turnos) {
    let html = '';
    let diaActual = '';
    turnos.forEach((t) => {
      const d = dia(t.inicio);
      if (d !== diaActual) {
        html += (diaActual ? '</dl>' : '') + '<p class="sub"><b>' + esc(d) + '</b></p><dl class="lista-datos">';
        diaActual = d;
      }
      const v = t.vehiculo || {};
      html += '<div>' +
          '<dt>' + esc(t.conductor ? t.conductor.nombre : '—') + ' · ' + esc(formatoPatente(v.patente)) + '</dt>' +
          '<dd>' + esc(hora(t.inicio)) + ' a ' + esc(hora(t.fin)) + ' · ' + esc(duracion(t.inicio, t.fin)) + '</dd>' +
        '</div>';
    });
    return html + '</dl>';
  }

  // La oficina cierra un turno olvidado (queda con la hora de este momento)
  async function cerrar(cont, perfil, btn) {
    if (!confirm('¿Cerrar el turno de ' + btn.dataset.quien + ' en la camioneta ' + btn.dataset.patente +
      '?\n\nQuedará cerrado con la hora de este momento.')) return;
    btn.disabled = true;
    btn.textContent = 'Cerrando…';
    const { error } = await TJE.db.from('turnos')
      .update({ fin: new Date().toISOString() })
      .eq('id', btn.dataset.cerrar)
      .is('fin', null);
    if (error) {
      btn.disabled = false;
      btn.textContent = 'Cerrar turno';
      alert(TJE.traducirError(error));
      return;
    }
    pintar(cont, perfil);
  }

  window.TJE_MODULOS = window.TJE_MODULOS || {};
  window.TJE_MODULOS.turnos = { pintar };
})();
