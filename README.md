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

## Versiones

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
