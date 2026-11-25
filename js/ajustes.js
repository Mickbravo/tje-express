// =====================================================================
// TJE EXPRESS · ajustes.js
// Módulo "Ajustes" para la oficina y el admin.
//   #ajustes                → bloque Bodegas (lista, activar / desactivar)
//   #ajustes/bodega/nueva   → formulario para agregar una bodega
//   #ajustes/bodega/<id>    → formulario para editar una bodega
// Las bodegas NO se borran: se desactivan (así no se pierde el historial).
// Más adelante aquí se suman Preferencias y Usuarios.
// =====================================================================
(function () {
  const COLOR_INICIAL = '#1E90FF';

  let carga = 0;            // evita que una carga lenta pinte sobre otra pantalla
  let avisoPendiente = '';  // mensaje "Guardado ✓" para mostrar al volver a la lista
  let perfilActual = null;  // para repintar la lista después de activar o desactivar

  const { escapar: esc, puedeEditar, colorBodega, numero } = window.TJE_UI;

  function mensajeError(e) {
    if (e && e.code === '23505') return 'Ya existe una bodega con ese nombre en la empresa.';
    return window.TJE.traducirError(e);
  }

  // "1 camioneta" / "3 camionetas"
  const plural = (n, uno, varios) => numero(n) + ' ' + (n === 1 ? uno : varios);

  // ------------------------------------------------------------------
  // Punto de entrada: decide qué pantalla mostrar
  // ------------------------------------------------------------------
  function pintar(cont, perfil, partes) {
    const miCarga = ++carga;
    perfilActual = perfil;
    if (!puedeEditar(perfil)) return (location.hash = '#turno');
    const [a, b] = partes;
    if (a === 'bodega' && b) return formulario(cont, perfil, b === 'nueva' ? null : b, miCarga);
    return lista(cont, perfil, miCarga);
  }

  // ------------------------------------------------------------------
  // LISTA DE BODEGAS
  // ------------------------------------------------------------------
  async function lista(cont, perfil, miCarga) {
    const aviso = avisoPendiente;
    avisoPendiente = '';

    cont.innerHTML =
      '<section class="barra-modulo">' +
        '<div><h1 class="titulo-modulo">Ajustes</h1><p class="sub">Datos de la empresa que la app usa en todas sus pantallas.</p></div>' +
      '</section>' +
      '<div id="aj-aviso">' + (aviso ? '<p class="aviso aviso-ok">' + esc(aviso) + '</p>' : '') + '</div>' +
      '<section class="panel">' +
        '<div class="panel-cabecera">' +
          '<div><h2>Bodegas</h2><p class="sub" id="aj-cuenta">Cargando…</p></div>' +
          '<a class="btn btn-primario btn-chico" href="#ajustes/bodega/nueva">+ Agregar bodega</a>' +
        '</div>' +
        '<div id="aj-lista"></div>' +
      '</section>';

    // Tres consultas chicas en paralelo: bodegas + cuántas camionetas y choferes tiene cada una
    const [rb, rv, rc] = await Promise.all([
      TJE.db.from('bodegas').select('id, nombre, direccion, color, activa, empresa_id, empresas(nombre)')
        .order('activa', { ascending: false }).order('nombre'),
      TJE.db.from('vehiculos').select('bodega_id'),
      TJE.db.from('conductores').select('bodega_id').eq('estado', 'activo')
    ]);
    if (miCarga !== carga) return;

    const fallo = rb.error || rv.error || rc.error;
    if (fallo) {
      document.getElementById('aj-cuenta').textContent = '';
      document.getElementById('aj-lista').innerHTML = '<p class="aviso aviso-error">' + esc(mensajeError(fallo)) + '</p>';
      return;
    }

    const contar = (filas) => filas.reduce((m, f) => (f.bodega_id ? m.set(f.bodega_id, (m.get(f.bodega_id) || 0) + 1) : m), new Map());
    const nVeh = contar(rv.data);
    const nCho = contar(rc.data);
    const bodegas = rb.data;
    const esAdmin = perfil.rol === 'admin';

    const activas = bodegas.filter((b) => b.activa).length;
    document.getElementById('aj-cuenta').textContent =
      bodegas.length ? plural(activas, 'bodega activa', 'bodegas activas') +
        (bodegas.length > activas ? ' · ' + plural(bodegas.length - activas, 'inactiva', 'inactivas') : '') : '';

    if (!bodegas.length) {
      document.getElementById('aj-lista').innerHTML =
        '<p class="sub">Aún no hay bodegas. Agrega la primera con el botón "Agregar bodega".</p>';
      return;
    }

    document.getElementById('aj-lista').innerHTML = bodegas.map((b) =>
      '<div class="fila-bodega' + (b.activa ? '' : ' inactiva') + '" data-id="' + esc(b.id) + '">' +
        '<span class="punto-color" style="background:' + colorBodega(b) + '" aria-hidden="true"></span>' +
        '<div class="fila-bodega-datos">' +
          '<strong>' + esc(b.nombre) + '</strong>' +
          '<span class="sub">' + esc(b.direccion || 'Sin dirección') + '</span>' +
          '<span class="sub">' +
            esc(plural(nVeh.get(b.id) || 0, 'camioneta', 'camionetas') + ' · ' + plural(nCho.get(b.id) || 0, 'chofer activo', 'choferes activos')) +
            (esAdmin && b.empresas ? ' · ' + esc(b.empresas.nombre) : '') +
          '</span>' +
        '</div>' +
        '<span class="pill ' + (b.activa ? 'pill-operativo' : 'pill-doc-falta') + '">' + (b.activa ? 'Activa' : 'Inactiva') + '</span>' +
        '<div class="fila-bodega-acciones">' +
          '<a class="btn btn-secundario btn-chico" href="#ajustes/bodega/' + esc(b.id) + '">Editar</a>' +
          '<button type="button" class="btn btn-secundario btn-chico' + (b.activa ? ' btn-peligro-suave' : '') + '" data-cambiar="' + esc(b.id) + '">' +
            (b.activa ? 'Desactivar' : 'Activar') + '</button>' +
        '</div>' +
      '</div>'
    ).join('');

    document.getElementById('aj-lista').addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-cambiar]');
      if (!btn) return;
      const b = bodegas.find((x) => x.id === btn.dataset.cambiar);
      if (b) cambiarEstado(b, nVeh.get(b.id) || 0, nCho.get(b.id) || 0, btn, miCarga);
    });
  }

  // Activar o desactivar. Al desactivar, avisa cuántas camionetas y choferes la usan.
  async function cambiarEstado(b, veh, cho, btn, miCarga) {
    const aviso = document.getElementById('aj-aviso');
    if (b.activa) {
      let texto = '¿Desactivar la bodega "' + b.nombre + '"?\n\nYa no se podrá elegir al agregar o editar camionetas y choferes.';
      if (veh || cho) {
        texto += '\n\nOjo: hoy tiene ' + plural(veh, 'camioneta', 'camionetas') + ' y ' + plural(cho, 'chofer activo', 'choferes activos') +
          '. Seguirán asignados a ella; no se mueven solos.';
      }
      if (!confirm(texto)) return;
    }
    btn.disabled = true;
    const { error } = await TJE.db.from('bodegas').update({ activa: !b.activa }).eq('id', b.id).select('id').single();
    if (miCarga !== carga) return;
    if (error) {
      btn.disabled = false;
      aviso.innerHTML = '<p class="aviso aviso-error">' + esc(mensajeError(error)) + '</p>';
      return;
    }
    avisoPendiente = b.activa ? 'Bodega desactivada ✓' : 'Bodega activada ✓';
    pintar(document.getElementById('contenido'), perfilActual, []);
  }

  // ------------------------------------------------------------------
  // FORMULARIO (agregar o editar una bodega)
  // ------------------------------------------------------------------
  async function formulario(cont, perfil, id, miCarga) {
    cont.innerHTML = '<p class="sub">Cargando…</p>';
    const esAdmin = perfil.rol === 'admin';

    const consultas = [];
    if (id) consultas.push(TJE.db.from('bodegas').select('id, nombre, direccion, color, activa, empresa_id, empresas(nombre)').eq('id', id).maybeSingle());
    // Solo el admin elige empresa, y solo al agregar (una bodega no cambia de empresa)
    if (esAdmin && !id) consultas.push(TJE.db.from('empresas').select('id, nombre').eq('activa', true).order('nombre'));
    const resultados = await Promise.all(consultas);
    if (miCarga !== carga) return;

    const rb = id ? resultados[0] : null;
    const re = esAdmin && !id ? resultados[0] : null;
    const fallo = (rb && rb.error) || (re && re.error);
    if (fallo || (id && !rb.data)) {
      cont.innerHTML = '<p class="aviso aviso-error">' + esc(fallo ? mensajeError(fallo) : 'No se encontró esta bodega.') + '</p>' +
        '<a class="btn btn-secundario" href="#ajustes">← Volver a Ajustes</a>';
      return;
    }

    const b = id ? rb.data : { nombre: '', direccion: '', color: COLOR_INICIAL, activa: true };
    const colorValido = /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : COLOR_INICIAL;

    cont.innerHTML =
      '<a class="volver" href="#ajustes">← Ajustes</a>' +
      '<form id="aj-form" class="panel formulario" novalidate>' +
        '<h1>' + (id ? 'Editar bodega' : 'Agregar bodega') + '</h1>' +
        '<div class="campos">' +
          (esAdmin && !id
            ? '<div class="campo campo-ancho"><label for="f-empresa">Empresa *</label><select id="f-empresa">' +
                '<option value="">Elige una empresa</option>' +
                re.data.map((e) => '<option value="' + esc(e.id) + '">' + esc(e.nombre) + '</option>').join('') +
              '</select></div>'
            : '') +
          '<div class="campo"><label for="f-nombre">Nombre *</label>' +
            '<input id="f-nombre" maxlength="40" autocomplete="off" placeholder="Pudahuel" value="' + esc(b.nombre) + '"></div>' +
          '<div class="campo"><label for="f-color">Color (para tarjetas y mapas)</label>' +
            '<input id="f-color" type="color" class="entrada-color" value="' + esc(colorValido) + '"></div>' +
          '<div class="campo campo-ancho"><label for="f-direccion">Dirección</label>' +
            '<input id="f-direccion" maxlength="120" autocomplete="off" placeholder="Calle, número, comuna" value="' + esc(b.direccion || '') + '"></div>' +
        '</div>' +
        '<p id="f-mensaje" class="aviso aviso-error" role="alert" hidden></p>' +
        '<div class="acciones">' +
          '<a class="btn btn-secundario" href="#ajustes">Cancelar</a>' +
          '<button type="submit" id="f-guardar" class="btn btn-primario">Guardar</button>' +
        '</div>' +
      '</form>';

    const $ = (x) => document.getElementById(x);

    $('aj-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const error = (t, campo) => {
        $('f-mensaje').textContent = t;
        $('f-mensaje').hidden = false;
        if (campo) $(campo).focus();
      };

      const nombre = $('f-nombre').value.trim().replace(/\s+/g, ' ');
      const direccion = $('f-direccion').value.trim().replace(/\s+/g, ' ');
      const empresaId = id ? b.empresa_id : (esAdmin ? $('f-empresa').value : perfil.empresa_id);

      if (!empresaId) return error('Elige la empresa de la bodega.', 'f-empresa');
      if (nombre.length < 2) return error('Escribe el nombre de la bodega (al menos 2 letras).', 'f-nombre');

      const datos = { nombre, direccion: direccion || null, color: $('f-color').value };
      if (!id) datos.empresa_id = empresaId;

      const btn = $('f-guardar');
      btn.disabled = true;
      btn.textContent = 'Guardando…';
      $('f-mensaje').hidden = true;

      const consulta = id
        ? TJE.db.from('bodegas').update(datos).eq('id', id).select('id').single()
        : TJE.db.from('bodegas').insert(datos).select('id').single();
      const { data, error: err } = await consulta;

      if (err || !data) {
        btn.disabled = false;
        btn.textContent = 'Guardar';
        return error(err ? mensajeError(err) : 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.');
      }
      avisoPendiente = id ? 'Cambios guardados ✓' : 'Bodega agregada ✓';
      location.hash = '#ajustes';
    });

    $('f-nombre').focus();
  }


  window.TJE_MODULOS = window.TJE_MODULOS || {};
  window.TJE_MODULOS.ajustes = { pintar };
})();
