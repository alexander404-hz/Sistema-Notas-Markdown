# 📝 Sistema de Notas Markdown

Aplicación de notas en **Markdown**, con operaciones CRUD completas, vista previa en tiempo real y búsqueda — todo persistido en `localStorage`, sin backend.

🔗 **Sitio en vivo:** [alexander404-hz.github.io/Sistema-Notas-Markdown](https://alexander404-hz.github.io/Sistema-Notas-Markdown/)

[![Preview de Sistema de Notas Markdown](assets/img/preview.png)](https://alexander404-hz.github.io/Sistema-Notas-Markdown/)

## ✨ Características

- **CRUD completo**: crear, editar, eliminar y restaurar notas.
- **Editor Markdown con vista previa en tiempo real**, incluyendo soporte para listas de tareas (`- [ ]` / `- [x]`).
- **Búsqueda** de notas por título/contenido.
- **Filtros**: por favoritas y por rango de fechas (hoy, 7 días, este mes o rango personalizado).
- **Orden configurable**: por fecha de edición, fecha de creación o título (asc/desc).
- **Selección múltiple** con acciones en lote (favoritear, exportar, eliminar).
- **Papelera**: las notas eliminadas se pueden restaurar o borrar definitivamente.
- **Exportar / Importar** notas en formato `.json`.
- **100% responsive**, con una experiencia adaptada a mobile (navegación entre lista y editor, menús posicionados dinámicamente, etc.).
- **Persistencia local**: todo se guarda en `localStorage`, no requiere servidor ni base de datos.

## 🛠️ Tecnologías

- HTML5 semántico
- CSS3 (sin frameworks, variables CSS y diseño responsive propio)
- JavaScript vanilla (ES Modules)
- [markdown-it](https://github.com/markdown-it/markdown-it) + [markdown-it-task-lists](https://github.com/revin/markdown-it-task-lists) (vía CDN) para el renderizado de Markdown
- `localStorage` como capa de persistencia

## 📁 Estructura del proyecto

```
Sistema-Notas-Markdown/
├── index.html
├── site.webmanifest
├── favicon.ico
├── assets/
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   └── app.js
│   ├── icons/
│   │   ├── favicon.svg
│   │   ├── favicon-16x16.png
│   │   ├── favicon-32x32.png
│   │   └── apple-touch-icon.png
│   └── img/
│       └── preview.png
└── README.md
```

## 🚀 Cómo correrlo localmente

1. Clona el repositorio:
   ```bash
   git clone https://github.com/alexander404-hz/Sistema-Notas-Markdown.git
   ```
2. Entra a la carpeta del proyecto:
   ```bash
   cd Sistema-Notas-Markdown
   ```
3. Abre `index.html` directamente en tu navegador, o usa una extensión como **Live Server** (VS Code) para servirlo localmente.

No requiere instalación de dependencias ni build steps: es un sitio estático (HTML, CSS y JS puro).

## 📖 Uso

1. Hacé clic en **+** para crear una nueva nota.
2. Escribí en Markdown en el panel del editor; la vista previa se actualiza en tiempo real.
3. Guardá con el botón **Guardar**.
4. Usá la barra de búsqueda y los filtros (favoritas, fecha, orden) para encontrar notas rápidamente.
5. Seleccioná varias notas desde el menú **⋮ → Seleccionar notas** para favoritear, exportar o eliminar en lote.
6. Las notas eliminadas quedan en la **🗑 Papelera**, desde donde se pueden restaurar o borrar definitivamente.
7. Exportá o importá tus notas en `.json` desde el menú **⋮**.

## 🌐 Despliegue

El proyecto se despliega en **GitHub Pages** desde este mismo repositorio.

## 👤 Autor

**Alexander Hz.**

## 📄 Licencia

Este proyecto no cuenta con una licencia definida — todos los derechos reservados.
