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
| `js/app.js` | Menú, navegación y secciones |

## Versiones

- **v0.1.1** · Iniciales del avatar sin símbolos; menú lateral muestra el nombre completo ("Mis documentos").
- **v0.1.0** · Estructura base, inicio de sesión y menú según rol (admin, oficina, chofer).
