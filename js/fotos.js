// =====================================================================
// TJE EXPRESS · fotos.js
// Utilidades compartidas: reducir fotos, subirlas al bucket privado
// "fotos" y mostrarlas; cargar librerías solo cuando se necesitan.
// Ruta de cada foto:  <empresa_id>/vehiculos/<id>.jpg
//                     <empresa_id>/conductores/<id>.jpg
// =====================================================================
(function () {
  const BUCKET = 'fotos';
  const MAX_LADO = 1024;          // píxeles del lado más largo
  const MAX_BYTES = 200 * 1024;   // ~200 KB como máximo (ahorro de datos)
  const urls = {};                // enlaces ya pedidos en esta sesión
  const scripts = {};             // librerías ya cargadas

  // Reduce la foto en el propio celular antes de subirla.
  async function reducir(archivo) {
    if (!archivo || !/^image\//.test(archivo.type)) throw new Error('El archivo elegido no es una imagen.');
    const url = URL.createObjectURL(archivo);
    try {
      const img = await new Promise((ok, mal) => {
        const i = new Image();
        i.onload = () => ok(i);
        i.onerror = () => mal(new Error('No se pudo leer la imagen. Prueba con una foto JPG o PNG.'));
        i.src = url;
      });
      const escala = Math.min(1, MAX_LADO / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * escala);
      const h = Math.round(img.naturalHeight * escala);
      const lienzo = document.createElement('canvas');
      lienzo.width = w;
      lienzo.height = h;
      const ctx = lienzo.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      // Baja la calidad de a poco hasta quedar bajo el límite
      let calidad = 0.82;
      let blob;
      do {
        blob = await new Promise((r) => lienzo.toBlob(r, 'image/jpeg', calidad));
        calidad -= 0.1;
      } while (blob && blob.size > MAX_BYTES && calidad > 0.35);
      if (!blob) throw new Error('No se pudo procesar la imagen.');
      return blob;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function subir(ruta, blob) {
    const { error } = await TJE.db.storage.from(BUCKET)
      .upload(ruta, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
    if (error) throw new Error(TJE.traducirError(error));
    delete urls[ruta];
  }

  // Enlace temporal (1 hora) para ver una foto privada.
  async function enlace(ruta) {
    if (!ruta) return null;
    if (urls[ruta]) return urls[ruta];
    const { data, error } = await TJE.db.storage.from(BUCKET).createSignedUrl(ruta, 3600);
    if (error || !data) return null;
    urls[ruta] = data.signedUrl;
    return urls[ruta];
  }

  // Carga una librería externa una sola vez, y solo cuando se usa.
  function cargarScript(src) {
    if (!scripts[src]) {
      scripts[src] = new Promise((ok, mal) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = ok;
        s.onerror = () => { delete scripts[src]; mal(new Error('No se pudo cargar un componente. Revisa tu conexión.')); };
        document.head.appendChild(s);
      });
    }
    return scripts[src];
  }

  // Conecta un <input type="file"> con todo el proceso: reducir → subir →
  // guardar la ruta en la tabla → mostrar la foto (sin volver a descargarla).
  function activarSubida({ input, estado, ruta, tabla, id, rutaActual, alMostrar }) {
    input.addEventListener('change', async () => {
      const archivo = input.files[0];
      if (!archivo) return;
      estado.hidden = false;
      estado.classList.remove('texto-error');
      estado.textContent = 'Reduciendo foto…';
      try {
        const blob = await reducir(archivo);
        const kb = Math.round(blob.size / 1024);
        estado.textContent = 'Subiendo foto (' + kb + ' KB)…';
        await subir(ruta, blob);
        if (rutaActual !== ruta) {
          const { error } = await TJE.db.from(tabla).update({ foto_path: ruta }).eq('id', id);
          if (error) throw new Error(TJE.traducirError(error));
          rutaActual = ruta;
        }
        alMostrar(URL.createObjectURL(blob));
        estado.textContent = 'Foto guardada ✓ (' + kb + ' KB)';
      } catch (e) {
        estado.textContent = e.message;
        estado.classList.add('texto-error');
      } finally {
        input.value = '';
      }
    });
  }

  window.TJE_FOTOS = { reducir, subir, enlace, cargarScript, activarSubida };
})();
