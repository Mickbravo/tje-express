// =====================================================================
// TJE EXPRESS · sesion.js
// Todo lo relacionado con "entrar", "salir" y "¿quién soy?".
// Lo usan index.html (login) y app.html (la app).
// =====================================================================
(function () {
  const cfg = window.TJE_CONFIG;

  // Conexión única a Supabase. La sesión queda guardada en el celular/PC,
  // así el chofer no tiene que escribir su clave cada día.
  const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  const ROLES = { admin: 'Administrador', oficina: 'Oficina', chofer: 'Chofer' };

  // Convierte los errores técnicos (en inglés) en mensajes claros.
  function traducirError(err) {
    const m = String((err && err.message) || '').toLowerCase();
    if (err && err.code === '23505') return 'Ya existe un registro con ese mismo dato.';
    if ((err && err.code === '42501') || m.includes('row-level security') || m.includes('permission denied'))
      return 'No tienes permiso para hacer esto.';
    if (m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
    if (m.includes('email not confirmed')) return 'Este correo aún no está confirmado. Pide a la oficina que lo confirme.';
    if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed'))
      return 'Sin conexión a internet. Revisa la señal e inténtalo de nuevo.';
    if (m.includes('rate limit') || m.includes('too many'))
      return 'Demasiados intentos seguidos. Espera un minuto e inténtalo de nuevo.';
    return 'No se pudo completar la acción (' + ((err && err.message) || 'error desconocido') + ').';
  }

  // Lee la sesión guardada en el equipo (no gasta datos).
  async function sesionActual() {
    const { data } = await db.auth.getSession();
    return data.session;
  }

  // Busca el perfil del usuario conectado: nombre, rol y empresa.
  async function obtenerPerfil() {
    const sesion = await sesionActual();
    if (!sesion) return null;
    const { data, error } = await db
      .from('perfiles')
      .select('id, nombre, rol, empresa_id, conductor_id, empresas(nombre)')
      .eq('id', sesion.user.id)
      .eq('activo', true)
      .maybeSingle();
    if (error) throw new Error(traducirError(error));
    if (data) data.correo = sesion.user.email;
    return data;
  }

  // Entrar con correo y contraseña. Si el usuario no tiene perfil activo,
  // se cierra la sesión: tener cuenta no basta para usar la app.
  async function iniciarSesion(correo, clave) {
    const { error } = await db.auth.signInWithPassword({ email: correo, password: clave });
    if (error) throw new Error(traducirError(error));
    const perfil = await obtenerPerfil();
    if (!perfil) {
      await db.auth.signOut();
      throw new Error('Tu usuario no tiene un perfil activo en TJE Express. Pide a la oficina que lo habilite.');
    }
    return perfil;
  }

  // Protege app.html: sin sesión, vuelve al login recordando a dónde iba
  // (servirá cuando el chofer escanee el QR de la camioneta).
  async function exigirSesion() {
    const sesion = await sesionActual();
    if (!sesion) {
      const destino = 'app.html' + location.search + location.hash;
      location.replace('index.html?next=' + encodeURIComponent(destino));
      return null;
    }
    const perfil = await obtenerPerfil(); // si falla la red, lanza error (se muestra en pantalla)
    if (!perfil) {
      await db.auth.signOut();
      location.replace('index.html?e=perfil');
      return null;
    }
    return perfil;
  }

  async function cerrarSesion() {
    try { await db.auth.signOut(); } finally { location.replace('index.html'); }
  }

  window.TJE = { db, ROLES, traducirError, sesionActual, obtenerPerfil, iniciarSesion, exigirSesion, cerrarSesion };
})();
