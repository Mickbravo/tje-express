// =====================================================================
// TJE EXPRESS · app.js
// Arma la app según el rol: menú, barra superior y secciones.
// Por ahora cada sección es un espacio "en construcción".
// =====================================================================
(async function () {
  const $ = (id) => document.getElementById(id);

  // ---------- Íconos (dibujados en el código: no gastan descargas) ----------
  const ICONOS = {
    inicio: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
    mapa: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    conductor: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
    vehiculo: '<path d="M2 6h12v10H2z"/><path d="M14 9h4l3 3.5V16h-7"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
    ruta: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16"/>',
    documento: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/>',
    llave: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z"/>',
    reportes: '<path d="M3 21h18"/><path d="M6 17v-5M11 17V6M16 17v-8M20 17v-3"/>',
    alertas: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M18 18h3v3"/>',
    empresa: '<path d="M4 21V5l8-2v18"/><path d="M12 9h8v12"/><path d="M3 21h18"/><path d="M8 8v.01M8 12v.01M8 16v.01M16 13v.01M16 17v.01"/>',
    mas: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    salir: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>'
  };
  const icono = (n) =>
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (ICONOS[n] || '') + '</svg>';

  // Iniciales y primer nombre ignorando símbolos: "[PRUEBA] Oficina" → "PO"
  const soloLetras = (t) => String(t || '').replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const iniciales = (t) => soloLetras(t).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
  const primerNombre = (t) => soloLetras(t)[0] || '';

  const escapar = (t) =>
    String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Utilidades compartidas con los módulos (vehiculos.js, etc.)
  window.TJE_UI = { icono, escapar };

  // ---------- Menús por rol ----------
  // "barra: true" = aparece en la barra inferior del celular.
  const MENU_OFICINA = [
    { id: 'inicio', txt: 'Inicio / Monitoreo', corto: 'Flota', ic: 'inicio', barra: true },
    { id: 'mapa', txt: 'Mapa general', ic: 'mapa' },
    { id: 'conductores', txt: 'Conductores', ic: 'conductor', barra: true },
    { id: 'vehiculos', txt: 'Vehículos', ic: 'vehiculo', barra: true },
    { id: 'rutas', txt: 'Rutas', ic: 'ruta' },
    { id: 'documentos', txt: 'Documentos', ic: 'documento' },
    { id: 'mantencion', txt: 'Mantención', ic: 'llave' },
    { id: 'reportes', txt: 'Reportes', ic: 'reportes', barra: true },
    { id: 'alertas', txt: 'Alertas', ic: 'alertas' },
    { id: 'ajustes', txt: 'Ajustes', ic: 'ajustes' }
  ];
  const MENUS = {
    admin: [...MENU_OFICINA, { id: 'empresas', txt: 'Empresas', ic: 'empresa' }],
    oficina: MENU_OFICINA,
    chofer: [
      { id: 'turno', txt: 'Mi turno', ic: 'qr', barra: true },
      { id: 'ruta', txt: 'Mi ruta', ic: 'ruta', barra: true },
      { id: 'documentos', txt: 'Mis documentos', corto: 'Documentos', ic: 'documento', barra: true },
      { id: 'ficha', txt: 'Mi ficha', ic: 'conductor', barra: true }
    ]
  };

  // Qué se construirá en cada sección (según el orden acordado).
  const PROXIMAMENTE = {
    mapa: 'Todas las camionetas en un solo mapa, en tiempo real.',
    rutas: 'Planificar rutas y asignarlas a chofer y camioneta (módulo de RutasJuan).',
    documentos: 'Licencias, SOAP, revisión técnica y sus vencimientos.',
    mantencion: 'Kilometraje, próximas mantenciones e historial de costos.',
    reportes: 'Resúmenes de entregas, kilómetros y uso de la flota.',
    alertas: 'Vencimientos y avisos importantes.',
    ajustes: 'Bodegas, usuarios y preferencias de la empresa.',
    empresas: 'Clientes de TJELabs que usan TJE Express.',
    turno: 'Aquí escanearás el QR de la camioneta para iniciar y cerrar tu turno.',
    ruta: 'Tu ruta del día: entregas en orden y botón para marcarlas.'
  };

  let perfil = null;
  let menu = [];

  // ---------- Arranque ----------
  async function arrancar() {
    $('cargando-texto').textContent = 'Cargando…';
    $('btn-reintentar').hidden = true;
    try {
      perfil = await TJE.exigirSesion();
      if (!perfil) return; // ya se redirigió al login
    } catch (e) {
      $('cargando-texto').textContent = e.message;
      $('btn-reintentar').hidden = false;
      return;
    }
    armarInterfaz();
    $('cargando').hidden = true;
    $('app').hidden = false;
    irA(location.hash.slice(1));
  }

  function armarInterfaz() {
    document.querySelectorAll('[data-version]').forEach((e) => (e.textContent = TJE_CONFIG.version));
    menu = MENUS[perfil.rol] || [];

    // Usuario
    $('usuario-nombre').textContent = perfil.nombre;
    $('usuario-rol').textContent = TJE.ROLES[perfil.rol] || perfil.rol;
    $('avatar').textContent = iniciales(perfil.nombre);
    $('btn-salir').innerHTML = icono('salir');
    $('btn-salir').addEventListener('click', () => {
      if (confirm('¿Cerrar sesión en este equipo?')) TJE.cerrarSesion();
    });

    // Menú lateral (escritorio): todo
    $('menu-lateral').innerHTML = menu.map((m) => itemMenu(m)).join('');

    // Barra inferior (celular): los principales + "Más" si sobran
    const enBarra = menu.filter((m) => m.barra);
    const resto = menu.filter((m) => !m.barra);
    let html = enBarra.map((m) => itemMenu(m, true)).join('');
    if (resto.length) {
      html += '<button type="button" class="menu-item" id="btn-mas">' + icono('mas') + '<span>Más</span></button>';
      $('menu-mas').innerHTML = resto.map((m) => itemMenu(m)).join('');
    }
    $('menu-inferior').innerHTML = html;
    $('menu-inferior').style.setProperty('--columnas', enBarra.length + (resto.length ? 1 : 0));

    if (resto.length) {
      $('btn-mas').addEventListener('click', () => ($('hoja-mas').hidden = !$('hoja-mas').hidden));
      $('hoja-mas').addEventListener('click', (ev) => {
        if (ev.target === $('hoja-mas') || ev.target.closest('a')) $('hoja-mas').hidden = true;
      });
    }

    // Si el chofer perdió su sesión, TJE lo devuelve al login
    TJE.db.auth.onAuthStateChange((evento) => {
      if (evento === 'SIGNED_OUT') location.replace('index.html');
    });
    window.addEventListener('hashchange', () => irA(location.hash.slice(1)));
  }

  function itemMenu(m, corto) {
    return '<a class="menu-item" href="#' + m.id + '" data-id="' + m.id + '">' +
      icono(m.ic) + '<span>' + escapar(corto && m.corto ? m.corto : m.txt) + '</span></a>';
  }

  // ---------- Navegación entre secciones ----------
  // La dirección puede traer sub-rutas: "vehiculos/<id>/editar"
  function irA(ruta) {
    const [id, ...resto] = String(ruta || '').split('/');
    const item = menu.find((m) => m.id === id) || menu[0];
    if (!item) return;
    document.querySelectorAll('.menu-item[data-id]').forEach((a) => {
      const activo = a.dataset.id === item.id;
      a.classList.toggle('activo', activo);
      if (activo) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $('titulo-seccion').textContent = item.txt;
    document.title = item.txt + ' · TJE Express';
    const btnMas = $('btn-mas');
    if (btnMas) btnMas.classList.toggle('activo', !item.barra);

    window.scrollTo(0, 0);
    $('contenido').scrollTop = 0;
    if (item.id === 'inicio') return pintarInicio();
    const modulo = (window.TJE_MODULOS || {})[item.id];
    if (modulo) return modulo.pintar($('contenido'), perfil, item.id === id ? resto : []);
    pintarProximamente(item);
  }

  function pintarProximamente(item) {
    $('contenido').innerHTML =
      '<section class="panel vacio">' +
        '<div class="vacio-icono">' + icono(item.ic) + '</div>' +
        '<h1>' + escapar(item.txt) + '</h1>' +
        '<p>' + escapar(PROXIMAMENTE[item.id] || 'Sección en preparación.') + '</p>' +
        '<span class="etiqueta">En construcción</span>' +
      '</section>';
  }

  // Inicio: saludo + prueba de conexión (cuenta bodegas y empresas que
  // el usuario puede ver; así comprobamos que las reglas RLS funcionan).
  async function pintarInicio() {
    const empresa = perfil.rol === 'admin'
      ? 'TJELabs (acceso a todas las empresas)'
      : (perfil.empresas && perfil.empresas.nombre) || '—';

    $('contenido').innerHTML =
      '<section class="panel bienvenida">' +
        '<h1>Hola, ' + escapar(primerNombre(perfil.nombre)) + '</h1>' +
        '<dl class="datos">' +
          '<div><dt>Empresa</dt><dd>' + escapar(empresa) + '</dd></div>' +
          '<div><dt>Rol</dt><dd>' + escapar(TJE.ROLES[perfil.rol]) + '</dd></div>' +
          '<div><dt>Correo</dt><dd>' + escapar(perfil.correo) + '</dd></div>' +
        '</dl>' +
      '</section>' +
      '<section class="panel">' +
        '<h2>Conexión con la base de datos</h2>' +
        '<ul class="chequeos" id="chequeos"><li>Comprobando…</li></ul>' +
      '</section>';

    // "head: true" trae solo la cantidad, no las filas: casi no gasta datos.
    const contar = async (tabla) => {
      const { count, error } = await TJE.db.from(tabla).select('id', { count: 'exact', head: true });
      if (error) throw error;
      return count;
    };
    try {
      const [empresas, bodegas, vehiculos, conductores] = await Promise.all([contar('empresas'), contar('bodegas'), contar('vehiculos'), contar('conductores')]);
      $('chequeos').innerHTML =
        '<li class="ok">Sesión activa y perfil encontrado</li>' +
        '<li class="ok">Empresas visibles: <b>' + empresas + '</b></li>' +
        '<li class="ok">Bodegas visibles: <b>' + bodegas + '</b></li>' +
        '<li class="ok">Vehículos registrados: <b>' + vehiculos + '</b></li>' +
        '<li class="ok">Choferes registrados: <b>' + conductores + '</b></li>';
    } catch (e) {
      $('chequeos').innerHTML = '<li class="error">' + escapar(TJE.traducirError(e)) + '</li>';
    }
  }

  $('btn-reintentar').addEventListener('click', arrancar);
  arrancar();
})();
