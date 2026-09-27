// =====================================================================
// TJE EXPRESS · login.js
// Lógica de la pantalla de inicio de sesión (index.html).
// =====================================================================
(async function () {
  const $ = (id) => document.getElementById(id);
  document.querySelectorAll('[data-version]').forEach((e) => (e.textContent = TJE_CONFIG.version));

  // A dónde ir después de entrar (solo se aceptan páginas de la propia app).
  const params = new URLSearchParams(location.search);
  let destino = params.get('next') || 'app.html';
  if (!/^app\.html([?#].*)?$/.test(destino)) destino = 'app.html';

  function mostrar(texto) {
    const m = $('mensaje');
    m.textContent = texto;
    m.hidden = false;
  }

  if (params.get('e') === 'perfil')
    mostrar('Tu usuario no tiene un perfil activo en TJE Express. Pide a la oficina que lo habilite.');

  // Si ya había una sesión abierta en este equipo, pasa directo a la app.
  if (params.get('e') !== 'perfil' && (await TJE.sesionActual())) {
    location.replace(destino);
    return;
  }

  // Mostrar u ocultar la contraseña.
  $('ver-clave').addEventListener('click', () => {
    const campo = $('clave');
    const visible = campo.type === 'text';
    campo.type = visible ? 'password' : 'text';
    $('ver-clave').setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
    $('ver-clave').classList.toggle('activo', !visible);
  });

  $('form-login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const correo = $('correo').value.trim().toLowerCase();
    const clave = $('clave').value;
    if (!correo || !clave) return mostrar('Escribe tu correo y tu contraseña.');

    const btn = $('btn-ingresar');
    btn.disabled = true;
    btn.textContent = 'Ingresando…';
    $('mensaje').hidden = true;
    try {
      await TJE.iniciarSesion(correo, clave);
      location.replace(destino);
    } catch (e) {
      mostrar(e.message);
      btn.disabled = false;
      btn.textContent = 'Ingresar';
    }
  });

  $('form-login').hidden = false;
  $('correo').focus();
})();
