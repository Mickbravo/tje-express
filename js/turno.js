// =====================================================================
// TJE EXPRESS · turno.js
// Módulo "Mi turno" del chofer (celular).
//   #turno            → muestra el turno abierto, o cómo iniciar uno
//   #turno/<código>   → llega aquí al escanear el QR de la camioneta
// Un turno = "este chofer, en esta camioneta, desde esta hora".
// La hora la pone la base de datos (no el celular), así no se puede
// adelantar ni atrasar.
// Los kilómetros NO se piden: llegarán desde el GPS.
// =====================================================================
(function () {
  let turno = 0; // evita que una carga lenta pinte sobre otra pantalla (no confundir con el turno del chofer)

  // Para volver a consultar cuando el chofer regresa a la app (ver "refrescar")
  let ultimo = null;        // { cont, perfil } de la última vez que se pintó
  let mostrandoAbierto = false; // true solo mientras se ve la pantalla "Turno abierto"
  let ultimaConsulta = 0;   // hora de la última consulta a la base

  const { escapar: esc, formatoPatente, colorBodega, fila } = window.TJE_UI;

  // Solo las columnas que se muestran (ahorro de datos).
  const COLUMNAS_VEH = 'id, qr_codigo, patente, marca, modelo, tipo, estado, foto_path, bodega:bodegas!vehiculos_bodega_id_fkey(nombre, color)';

  const horaCorta = (f) => new Date(f).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  const fechaCorta = (f) => new Date(f).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  function duracion(desde) {
    const min = Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 60000));
    const h = Math.floor(min / 60);
    return (h ? h + ' h ' : '') + (min % 60) + ' min';
  }

  function mensajeError(e) {
    const m = String((e && e.message) || '');
    if (e && e.code === '23505' && m.includes('vehiculo')) return 'Esta camioneta ya tiene un turno abierto con otro chofer. Avisa a la oficina.';
    if (e && e.code === '23505') return 'Ya tienes un turno abierto. Ciérralo antes de iniciar otro.';
    return window.TJE.traducirError(e);
  }

  // ------------------------------------------------------------------
  // Punto de entrada
  // ------------------------------------------------------------------
  async function pintar(cont, perfil, partes) {
    const miTurno = ++turno;
    const codigo = partes[0] || '';
    ultimo = { cont, perfil };
    mostrandoAbierto = false;
    if (!perfil.conductor_id) {
      cont.innerHTML = '<p class="aviso aviso-error">Tu usuario no tiene una ficha de chofer enlazada. Avisa a la oficina.</p>';
      return;
    }
    cont.innerHTML = '<p class="sub">Cargando…</p>';

    // 1) ¿Tengo un turno abierto? (la base solo me deja ver los míos)
    const { data: abierto, error } = await TJE.db
      .from('turnos')
      .select('id, inicio, vehiculo:vehiculos!turnos_vehiculo_id_fkey(' + COLUMNAS_VEH + ')')
      .is('fin', null)
      .maybeSingle();
    ultimaConsulta = Date.now();
    if (miTurno !== turno) return;
    if (error) return mostrarError(cont, error);

    if (abierto) return pantallaAbierto(cont, perfil, abierto, codigo);
    if (codigo) return pantallaIniciar(cont, perfil, codigo, miTurno);
    pantallaSinTurno(cont);
  }

  function mostrarError(cont, error) {
    cont.innerHTML = '<p class="aviso aviso-error">' + esc(mensajeError(error)) + '</p>' +
      '<button type="button" class="btn btn-secundario" id="tur-reintentar">Reintentar</button>';
    document.getElementById('tur-reintentar').addEventListener('click', () => window.dispatchEvent(new HashChangeEvent('hashchange')));
  }

  // Tarjeta de la camioneta (patente, modelo, bodega y foto)
  function tarjetaCamioneta(v) {
    return '<section class="panel ficha" style="--c:' + colorBodega(v.bodega) + '">' +
        '<div class="placa placa-grande">' + esc(formatoPatente(v.patente)) + '</div>' +
        '<h1>' + esc([v.marca, v.modelo].filter(Boolean).join(' ') || v.tipo || 'Camioneta') + '</h1>' +
        '<p class="sub">' + esc(v.bodega ? 'Bodega ' + v.bodega.nombre : 'Sin bodega') + '</p>' +
        '<div id="tur-foto" class="foto-marco"' + (v.foto_path ? '' : ' hidden') + '><span class="sub">Cargando foto…</span></div>' +
      '</section>';
  }

  // La foto se baja solo si existe (y queda guardada en el celular)
  async function mostrarFoto(v, miTurno) {
    if (!v.foto_path) return;
    const url = await TJE_FOTOS.enlace(v.foto_path);
    const marco = document.getElementById('tur-foto');
    if (miTurno !== turno || !marco) return;
    marco.innerHTML = url
      ? '<img alt="Foto de la camioneta ' + esc(formatoPatente(v.patente)) + '" src="' + esc(url) + '">'
      : '<span class="sub">No se pudo cargar la foto</span>';
  }

  // ------------------------------------------------------------------
  // A) Sin turno y sin QR: explicar cómo empezar
  // ------------------------------------------------------------------
  function pantallaSinTurno(cont) {
    const puedeEscanear = 'BarcodeDetector' in window && navigator.mediaDevices;
    cont.innerHTML =
      '<section class="panel vacio">' +
        '<div class="vacio-icono">' + TJE_UI.icono('qr') + '</div>' +
        '<h1>No tienes un turno abierto</h1>' +
        '<p>Para empezar, abre la <b>cámara del celular</b> y apunta al código QR pegado en la camioneta. Toca el enlace que aparece y la app abrirá tu turno.</p>' +
        (puedeEscanear ? '<button type="button" class="btn btn-primario" id="tur-escanear">Escanear QR aquí</button>' : '') +
      '</section>' +
      '<div id="tur-camara"></div>';
    if (puedeEscanear) document.getElementById('tur-escanear').addEventListener('click', escanear);
  }

  // Lector de QR dentro de la app (Chrome en Android). No descarga nada:
  // usa el lector que ya trae el celular. En iPhone se usa la cámara normal.
  async function escanear() {
    const zona = document.getElementById('tur-camara');
    const btn = document.getElementById('tur-escanear');
    let flujo;
    try {
      flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch (e) {
      zona.innerHTML = '<p class="aviso aviso-error">No se pudo abrir la cámara. Revisa el permiso de cámara o usa la cámara normal del celular.</p>';
      return;
    }
    btn.hidden = true;
    zona.innerHTML = '<section class="panel"><video id="tur-video" playsinline muted style="width:100%;border-radius:10px"></video>' +
      '<button type="button" class="btn btn-secundario" id="tur-cancelar">Cancelar</button></section>';
    const video = document.getElementById('tur-video');
    video.srcObject = flujo;
    await video.play();
    const lector = new BarcodeDetector({ formats: ['qr_code'] });
    let activo = true;
    const parar = () => { activo = false; flujo.getTracks().forEach((t) => t.stop()); };
    document.getElementById('tur-cancelar').addEventListener('click', () => { parar(); pantallaSinTurno(document.getElementById('contenido')); });
    window.addEventListener('hashchange', parar, { once: true });

    const buscar = async () => {
      if (!activo) return;
      try {
        const codigos = await lector.detect(video);
        const texto = codigos.length ? codigos[0].rawValue : '';
        const m = texto.match(/#turno\/([^/?#\s]+)/);
        if (m) { parar(); location.hash = '#turno/' + m[1]; return; }
        if (texto) zona.querySelector('.panel').insertAdjacentHTML('afterbegin', '<p class="aviso aviso-error">Ese QR no es de una camioneta TJE.</p>');
      } catch (e) { /* cuadro sin QR: seguir buscando */ }
      setTimeout(buscar, 300);
    };
    buscar();
  }

  // ------------------------------------------------------------------
  // B) Escaneó un QR y no tiene turno: mostrar la camioneta y "Iniciar"
  // ------------------------------------------------------------------
  async function pantallaIniciar(cont, perfil, codigo, miTurno) {
    const { data: v, error } = await TJE.db.from('vehiculos').select(COLUMNAS_VEH).eq('qr_codigo', codigo).maybeSingle();
    if (miTurno !== turno) return;
    if (error) return mostrarError(cont, error);
    if (!v) {
      cont.innerHTML = '<p class="aviso aviso-error">Este código QR no corresponde a ninguna camioneta de tu empresa. Avisa a la oficina.</p>' +
        '<a class="btn btn-secundario" href="#turno">← Volver</a>';
      return;
    }

    const noOperativa = v.estado && v.estado !== 'operativo';
    cont.innerHTML =
      tarjetaCamioneta(v) +
      (noOperativa ? '<p class="aviso aviso-error">Ojo: esta camioneta figura como <b>' + esc(v.estado === 'en_mantencion' ? 'en mantención' : 'fuera de servicio') + '</b>. Confirma con la oficina antes de salir.</p>' : '') +
      '<section class="panel">' +
        '<p>¿Inicias tu turno en esta camioneta ahora?</p>' +
        '<button type="button" class="btn btn-primario" id="tur-iniciar">Iniciar turno</button> ' +
        '<a class="btn btn-secundario" href="#turno">Cancelar</a>' +
        '<p id="tur-estado" class="sub" hidden></p>' +
      '</section>';
    mostrarFoto(v, miTurno);

    document.getElementById('tur-iniciar').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      const estado = document.getElementById('tur-estado');
      btn.disabled = true;
      estado.hidden = false;
      estado.classList.remove('texto-error');
      estado.textContent = 'Iniciando turno…';
      // Solo se envía quién y qué camioneta; la hora la pone la base.
      const { error: e2 } = await TJE.db.from('turnos').insert({
        empresa_id: perfil.empresa_id,
        conductor_id: perfil.conductor_id,
        vehiculo_id: v.id
      });
      if (e2) {
        btn.disabled = false;
        estado.textContent = mensajeError(e2);
        estado.classList.add('texto-error');
        return;
      }
      location.hash = '#turno'; // vuelve a la pantalla del turno abierto
    });
  }

  // ------------------------------------------------------------------
  // C) Turno abierto: datos y botón "Cerrar turno"
  // ------------------------------------------------------------------
  function pantallaAbierto(cont, perfil, t, codigo) {
    const v = t.vehiculo || {};
    mostrandoAbierto = true;
    const otraCamioneta = codigo && v.id && codigo !== v.qr_codigo;
    cont.innerHTML =
      (otraCamioneta ? '<p class="aviso aviso-error">Ya tienes un turno abierto en otra camioneta. Ciérralo antes de iniciar uno nuevo.</p>' : '') +
      '<p class="aviso aviso-ok">Turno abierto ✓</p>' +
      tarjetaCamioneta(v) +
      '<section class="panel">' +
        '<dl class="lista-datos">' +
          fila('Día', esc(fechaCorta(t.inicio))) +
          fila('Inicio', esc(horaCorta(t.inicio))) +
          fila('Tiempo en turno', '<span id="tur-duracion">' + esc(duracion(t.inicio)) + '</span>') +
        '</dl>' +
        '<button type="button" class="btn btn-secundario" id="tur-cerrar">Cerrar turno</button>' +
        '<p id="tur-estado" class="sub" hidden></p>' +
      '</section>';
    mostrarFoto(v, turno);

    document.getElementById('tur-cerrar').addEventListener('click', async (ev) => {
      if (!confirm('¿Cerrar tu turno en la camioneta ' + formatoPatente(v.patente) + '?')) return;
      const btn = ev.currentTarget;
      const estado = document.getElementById('tur-estado');
      btn.disabled = true;
      estado.hidden = false;
      estado.classList.remove('texto-error');
      estado.textContent = 'Cerrando turno…';
      // La hora de término también la pone la base (ver SQL 06).
      const { error } = await TJE.db.from('turnos').update({ fin: new Date().toISOString() }).eq('id', t.id);
      mostrandoAbierto = false;
      if (error) {
        // La oficina ya lo había cerrado: no es un error, solo se avisa.
        if (String(error.message || '').includes('ya está cerrado')) {
          cont.innerHTML = '<p class="aviso aviso-ok">La oficina ya había cerrado este turno ✓</p>' +
            '<a class="btn btn-secundario" href="#ficha">Ir a Mi ficha</a>';
          return;
        }
        mostrandoAbierto = true;
        btn.disabled = false;
        estado.textContent = mensajeError(error);
        estado.classList.add('texto-error');
        return;
      }
      cont.innerHTML = '<p class="aviso aviso-ok">Turno cerrado ✓ Buen descanso.</p>' +
        '<a class="btn btn-secundario" href="#ficha">Ir a Mi ficha</a>';
      if (location.hash !== '#turno') history.replaceState(null, '', '#turno');
    });
  }

  // ------------------------------------------------------------------
  // Refrescar: cuando el chofer vuelve a la app (desbloquea el celular o
  // regresa a la pestaña) y está viendo "Turno abierto", se consulta de
  // nuevo por si la oficina lo cerró. Una consulta chica, y como máximo
  // una cada 30 segundos (ahorro de datos).
  // ------------------------------------------------------------------
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (!mostrandoAbierto || !ultimo) return;
    if (!/^#turno(\/|$)/.test(location.hash)) return;
    if (Date.now() - ultimaConsulta < 30000) return;
    const btn = document.getElementById('tur-cerrar');
    if (btn && btn.disabled) return; // está cerrando en este momento
    pintar(ultimo.cont, ultimo.perfil, []);
  });

  window.TJE_MODULOS = window.TJE_MODULOS || {};
  window.TJE_MODULOS.turno = { pintar };
})();
