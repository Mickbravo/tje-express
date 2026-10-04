// =====================================================================
// TJE EXPRESS · ui.js
// Utilidades compartidas por todos los módulos (una sola copia).
// Se carga ANTES que los módulos. Los módulos las usan como
// window.TJE_UI.escapar(...), window.TJE_UI.fila(...), etc.
// =====================================================================
(function () {
  // ---------- Seguridad: todo texto que venga de la base de datos ----------
  // se "escapa" antes de mostrarse, para que nunca se ejecute como código.
  const escapar = (t) =>
    String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // "Citroën" y "citroen" cuentan como lo mismo al buscar
  const normalizar = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  // Quién puede agregar y editar (la base de datos lo vuelve a revisar con RLS)
  const puedeEditar = (perfil) => !!perfil && (perfil.rol === 'admin' || perfil.rol === 'oficina');

  // Color de la bodega; si no es un color válido, gris
  const colorBodega = (b) => (b && /^#[0-9a-f]{3,8}$/i.test(b.color) ? b.color : '#8fa4be');

  // Iniciales y primer nombre ignorando símbolos: "[PRUEBA] Oficina" → "PO"
  const soloLetras = (t) => String(t || '').replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const iniciales = (t) => soloLetras(t).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || '?';
  const primerNombre = (t) => soloLetras(t)[0] || '';

  // 125430 → "125.430"; vacío o inválido → "—"
  const numero = (n) => (n == null || n === '' || isNaN(Number(n)) ? '—' : Number(n).toLocaleString('es-CL'));

  // Patentes: "abcd12" → "AB-CD-12"
  const limpiarPatente = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const formatoPatente = (p) => {
    const s = limpiarPatente(p);
    return s.length === 6 ? s.slice(0, 2) + '-' + s.slice(2, 4) + '-' + s.slice(4) : s;
  };

  // ---------- Piezas de pantalla ----------
  // Fila de una ficha. "html" debe venir YA escapado (o ser HTML armado aquí).
  const fila = (k, html) => '<div><dt>' + escapar(k) + '</dt><dd>' + html + '</dd></div>';
  // Igual que fila, pero escapa el valor automáticamente (usar para textos simples).
  const filaTexto = (k, txt) => fila(k, escapar(txt));
  // Etiqueta de color (estado)
  const pill = (clase, texto) => '<span class="pill pill-' + escapar(clase) + '">' + escapar(texto) + '</span>';

  window.TJE_UI = Object.assign(window.TJE_UI || {}, {
    escapar, normalizar, puedeEditar, colorBodega, iniciales, primerNombre,
    numero, limpiarPatente, formatoPatente, fila, filaTexto, pill
  });
})();
