# TJE Express

Gestión de flota, rutas y GPS · desarrollado por **TJELabs**.

App web (HTML + JavaScript) publicada en GitHub Pages, con base de datos en Supabase
(multiempresa, seguridad RLS por empresa y rol).

## Estructura

| Archivo | Qué hace |
|---|---|
| `index.html` | Pantalla de inicio de sesión |
| `app.html` | La app: menú y secciones según el rol |
| `css/estilos.css` | Colores y diseño (celular y escritorio) |
| `js/config.js` | Conexión a Supabase y versión |
| `js/sesion.js` | Entrar, salir y saber quién soy |
| `js/login.js` | Lógica de la pantalla de inicio de sesión |
| `js/ui.js` | Funciones compartidas por todos los módulos: escapar texto, buscar sin tildes, patentes, colores, filas y etiquetas. Se carga antes que los módulos |
| `js/app.js` | Menú, navegación y secciones |
| `js/fotos.js` | Reducir, subir y mostrar fotos; cargar librerías solo cuando se usan |
| `js/vehiculos.js` | Módulo Vehículos: lista, ficha, agregar y editar |
| `js/conductores.js` | Módulo Conductores: lista, ficha con foto, agregar y editar; "Mi ficha" del chofer |
| `js/turno.js` | Módulo "Mi turno" del chofer: escanear el QR de la camioneta, iniciar y cerrar el turno |
| `js/turnos.js` | Módulo "Turnos" de la oficina: quién tiene qué camioneta ahora, historial de 7 días y cerrar un turno olvidado |
| `js/documentos.js` | Módulo Documentos: papeles de cada camioneta y chofer con vencimiento, semáforo y archivo adjunto; "Mis documentos" del chofer |
| `js/gastos.js` | Módulo Gastos (oficina y admin): gastos por camioneta y mes con foto de boleta, verificación de las lecturas del tablero (foto al lado del km anotado) y costos por camioneta ($/km, km/litro) |
| `js/inicio.js` | Tablero de Inicio (oficina y admin): camionetas operativas, turnos abiertos, documentos vencidos y por vencer, y la lista "Requiere atención" |

## Versiones

- **v0.9.1** · En **Mi turno**, el chofer anota el km del tablero y toma una foto al iniciar y al cerrar el turno. Si no puede tomar la foto, escribe el motivo y el turno sigue igual. Se verifica en Gastos > Tablero. Cambia solo `js/turno.js` (más estilos). Sin SQL nuevo.
- **v0.9.0** · Nuevo menú **Gastos** (oficina y admin) con tres pestañas: Gastos (combustible, mantención, peaje, otro; foto de boleta opcional), Tablero (verificar el km que anota el chofer contra la foto) y Costos (total, costo por km y km por litro por camioneta). Requiere SQL 08. El chofer todavía no toma la foto del tablero (llega en v0.9.1).
- **v0.8.1** · Escanear el QR de una camioneta con sesión de admin u oficina abre la ficha de la camioneta (el chofer sigue yendo a "Mi turno"); botón "Documentos" en la ficha de la camioneta; la hora de cierre de un turno la pone siempre la base de datos, también cuando cierra la oficina (SQL 07).
- **v0.8.0** · Inicio pasa a ser un tablero: 4 indicadores, lista "Requiere atención" (documentos vencidos y por vencer, turnos abiertos más de 12 horas, camionetas detenidas, documentos sin registrar) y camionetas en turno ahora.
- **v0.7.0** · Módulo Documentos (oficina y admin): permiso de circulación, revisión técnica, emisión de gases, SOAP, seguro y padrón por camioneta; licencia por chofer. Semáforo con el peor documento, aviso 30 días antes del vencimiento, foto (reducida) o PDF adjunto. "Mis documentos" para el chofer (solo lectura).
- **v0.6.1** · "Mi turno" se vuelve a consultar sola cuando el chofer regresa a la app (por si la oficina cerró su turno); aviso claro si el turno ya estaba cerrado.
- **v0.6.0** · Módulo "Turnos" (oficina y admin): camionetas en turno ahora, historial de los últimos 7 días y botón para cerrar un turno olvidado.
- **v0.5.0** · Módulo "Mi turno" (chofer): el QR de la camioneta abre el turno; muestra patente, foto y tiempo en turno; botón cerrar. La hora la pone la base de datos (SQL 06). Sin kilómetros: llegarán desde el GPS.
- **v0.4.1** · Cache busting (`?v=` en cada archivo: los celulares bajan la versión nueva solos y, sin cambios, usan la copia guardada); nuevo `js/ui.js` con funciones compartidas; escape reforzado; Supabase fijo en 2.117.2.
- **v0.4.0** · Módulo Conductores: lista por bodega, ficha con foto, edad y antigüedad calculadas, validación de RUT, botón llamar, "Mi ficha" para el chofer.
- **v0.3.1** · Tarjetas y ficha con el borde completo del color de la bodega; "Cerrar sesión" solo en el equipo actual; etiqueta QR sin encabezado ni pie de Chrome.
- **v0.3.0** · Foto de cada camioneta (reducida a ~200 KB), código QR imprimible, búsqueda sin importar tildes y ficha más cómoda en pantallas grandes.
- **v0.2.0** · Módulo Vehículos: lista por bodega, ficha, agregar y editar (oficina y admin).
- **v0.1.1** · Iniciales del avatar sin símbolos; menú lateral muestra el nombre completo ("Mis documentos").
- **v0.1.0** · Estructura base, inicio de sesión y menú según rol (admin, oficina, chofer).

## Cómo publicar una versión nueva

1. Cambiar el número de versión en `js/config.js`.
2. Cambiar el mismo número en todos los `?v=` de `index.html` y `app.html`.
3. Subir los archivos descomprimidos (no el zip) con *Add file → Upload files*.
4. Agregar la línea de la versión en este README.
5. Probar con F5 normal que la app muestre la versión nueva.
