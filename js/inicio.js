// =====================================================================
// TJE EXPRESS · inicio.js
// Tablero de Inicio para la oficina y el admin: de un vistazo,
// qué requiere atención hoy.
//   #inicio → camionetas, choferes, turnos abiertos y documentos
// Hace 4 consultas chicas (solo las columnas que se muestran).
// Cuando llegue el GPS, aquí se sumarán las camionetas en ruta.
// =====================================================================
(function () {
  const HORAS_TURNO_LARGO = 12; // un turno abierto más de 12 horas se marca como "olvidado"

  let carga = 0; // evita que una carga lenta pinte sobre otra pantalla

  const { escapar: esc, puedeEditar, formatoPatente, primerNombre } = window.TJE_UI;
  const hora = (f) => new Date(f).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  const horasDesde = (f) => (Date.now() - new Date(f).getTime()) / 3600000;
  function duracion(desde) {
    const min = Math.max(0, Math.floor(horasDesde(desde) * 60));
    const h = Math.floor(min / 60);
    return (h ? h + ' h ' : '') + (min % 60) + ' min';
  }
  const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);

  async function pintar(cont, perfil) {
    const miCarga = ++carga;
    if (!puedeEditar(perfil)) return (location.hash = '#turno');

    const empresa = perfil.rol === 'admin'
      ? 'TJELabs (todas las empresas)'
      : (perfil.empresas && perfil.empresas.nombre) || '—';

    cont.innerHTML =
      '<section class="barra-modulo">' +
        '<div><h1 class="titulo-modulo">Hola, ' + esc(primerNombre(perfil.nombre)) + '</h1>' +
        '<p class="sub">' + esc(empresa) + ' · <span id="ini-estado">Cargando…</span></p></div>' +
        '<div class="barra-acciones"><button type="button" class="btn btn-secundario" id="ini-actualizar">Actualizar</button></div>' +
      '</section>' +
      '<div id="ini-cuerpo" class="doc-cuerpo"></div>';
    document.getElementById('ini-actualizar').addEventListener('click', () => pintar(cont, perfil));

    const [rv, rc, rt, rd] = await Promise.all([
      TJE.db.from('vehiculos').select('id, patente, marca, modelo, estado').order('patente'),
      TJE.db.from('conductores').select('id, nombre').eq('estado', 'activo').order('nombre'),
      TJE.db.from('turnos')
        .select('id, inicio, conductor:conductores!turnos_conductor_id_fkey(nombre), vehiculo:vehiculos!turnos_vehiculo_id_fkey(patente)')
        .is('fin', null).order('inicio').limit(50),
      TJE.db.from('documentos').select('id, vehiculo_id, conductor_id, tipo, fecha_vencimiento').limit(500)
    ]);
    if (miCarga !== carga) return;
    const cuerpo = document.getElementById('ini-cuerpo');
    const estado = document.getElementById('ini-estado');
    const fallo = rv.error || rc.error || rt.error || rd.error;
    if (fallo) {
      estado.textContent = 'sin conexión';
      cuerpo.innerHTML = '<p class="aviso aviso-error">' + esc(TJE.traducirError(fallo)) + '</p>';
      return;
    }
    estado.textContent = 'actualizado ' + hora(new Date());

    const vehiculos = rv.data;
    const choferes = rc.data;
    const turnos = rt.data;

    // ---------- Documentos: mismas reglas que la pantalla Documentos ----------
    const DOC = window.TJE_MODULOS.documentos;
    const filas = [];
    vehiculos.forEach((v) => DOC.armar('v', rd.data.filter((d) => d.vehiculo_id === v.id))
      .forEach((f) => filas.push(Object.assign(f, { quien: formatoPatente(v.patente), enlace: '#documentos/v/' + v.id }))));
    choferes.forEach((c) => DOC.armar('c', rd.data.filter((d) => d.conductor_id === c.id))
      .forEach((f) => filas.push(Object.assign(f, { quien: c.nombre, enlace: '#documentos/c/' + c.id }))));
    const de = (e) => filas.filter((f) => f.estado === e);
    const porFecha = (a, b) => String(a.doc.fecha_vencimiento).localeCompare(String(b.doc.fecha_vencimiento));
    const vencidos = de('vencido').sort(porFecha);
    const porVencer = de('por_vencer').sort(porFecha);
    const faltan = de('falta');

    // ---------- Camionetas y turnos ----------
    const operativas = vehiculos.filter((v) => v.estado === 'operativo');
    const detenidas = vehiculos.filter((v) => v.estado !== 'operativo');
    const largos = turnos.filter((t) => horasDesde(t.inicio) >= HORAS_TURNO_LARGO);

    // ---------- Lista "Requiere atención" (lo más urgente primero) ----------
    const atencion = [];
    vencidos.forEach((f) => atencion.push(['vencido', f.enlace,
      f.tipo.nombre + ' · ' + f.quien, 'Vencido: ' + DOC.cuandoVence(f.doc)]));
    largos.forEach((t) => atencion.push(['vencido', '#turnos',
      'Turno abierto hace ' + Math.floor(horasDesde(t.inicio)) + ' horas',
      (t.vehiculo ? formatoPatente(t.vehiculo.patente) : 'Camioneta') + ' · ' + (t.conductor ? t.conductor.nombre : 'Chofer') + ' · ¿se olvidó cerrarlo?']));
    porVencer.forEach((f) => atencion.push(['por_vencer', f.enlace,
      f.tipo.nombre + ' · ' + f.quien, 'Por vencer: ' + DOC.cuandoVence(f.doc)]));
    detenidas.forEach((v) => atencion.push(['por_vencer', '#vehiculos/' + v.id,
      formatoPatente(v.patente) + ' · ' + ([v.marca, v.modelo].filter(Boolean).join(' ') || 'Camioneta'),
      v.estado === 'en_mantencion' ? 'En mantención' : 'Fuera de servicio']));
    if (faltan.length) atencion.push(['falta', '#documentos',
      plural(faltan.length, 'documento sin registrar', 'documentos sin registrar'), 'Complétalos en la pantalla Documentos']);

    cuerpo.innerHTML =
      '<section class="doc-contadores">' +
        ficha('#vehiculos', detenidas.length ? 'por_vencer' : 'al_dia', operativas.length + ' de ' + vehiculos.length, 'Camionetas operativas') +
        ficha('#turnos', largos.length ? 'vencido' : 'al_dia', turnos.length, turnos.length === 1 ? 'Camioneta en turno ahora' : 'Camionetas en turno ahora') +
        ficha('#documentos', vencidos.length ? 'vencido' : 'al_dia', vencidos.length, vencidos.length === 1 ? 'Documento vencido' : 'Documentos vencidos') +
        ficha('#documentos', porVencer.length ? 'por_vencer' : 'al_dia', porVencer.length, 'Por vencer (30 días)') +
      '</section>' +
      '<section class="panel">' +
        '<h2>Requiere atención</h2>' +
        (atencion.length
          ? '<div class="ini-lista">' + atencion.map((a) =>
              '<a class="ini-item" href="' + esc(a[1]) + '"><span class="doc-punto doc-' + a[0] + '"></span>' +
              '<span class="ini-texto"><strong>' + esc(a[2]) + '</strong><small>' + esc(a[3]) + '</small></span>' +
              '<span class="ini-flecha" aria-hidden="true">›</span></a>').join('') + '</div>'
          : '<p class="aviso aviso-ok">Todo en orden ✓ No hay nada pendiente.</p>') +
      '</section>' +
      '<section class="panel">' +
        '<h2>En turno ahora</h2>' +
        (turnos.length
          ? '<div class="ini-lista">' + turnos.map((t) =>
              '<a class="ini-item" href="#turnos"><span class="placa">' + esc(t.vehiculo ? formatoPatente(t.vehiculo.patente) : '—') + '</span>' +
              '<span class="ini-texto"><strong>' + esc(t.conductor ? t.conductor.nombre : 'Chofer') + '</strong>' +
              '<small>Desde las ' + esc(hora(t.inicio)) + ' · ' + esc(duracion(t.inicio)) + '</small></span>' +
              '<span class="ini-flecha" aria-hidden="true">›</span></a>').join('') + '</div>'
          : '<p class="sub">Ningún chofer tiene un turno abierto en este momento.</p>') +
      '</section>' +
      '<p class="sub">' + esc(plural(choferes.length, 'chofer activo', 'choferes activos')) + ' · ' +
        esc(plural(vehiculos.length, 'camioneta registrada', 'camionetas registradas')) +
        ' · La ubicación en vivo llegará cuando el GPS esté conectado a la app.</p>';
  }

  const ficha = (enlace, estado, numero, texto) =>
    '<a class="doc-contador doc-' + estado + '" href="' + enlace + '"><b>' + esc(numero) + '</b><span>' + esc(texto) + '</span></a>';

  window.TJE_MODULOS = window.TJE_MODULOS || {};
  window.TJE_MODULOS.inicio = { pintar };
})();
