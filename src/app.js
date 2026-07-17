// =============================================================================
// SISTEMA DE NOTAS - Módulo Core
// =============================================================================

const STORAGE_KEY = "markdown-notes";
let currentNoteId = null;
let messageTimer;

// ----------------------------------------------------------------------------
// VALIDACIÓN
// ----------------------------------------------------------------------------

/**
 * Valida que el valor sea un entero positivo mayor a 0.
 * @param {number} num - Número a validar.
 * @returns {boolean} `true` si es un entero positivo, `false` en caso contrario.
 */
function isValidNumber(num) {
  return Number.isInteger(num) && num > 0;
}

/**
 * Valida que el valor sea un string con contenido real (no solo espacios).
 * @param {string} str - Texto a validar.
 * @returns {boolean} `true` si el string tiene contenido, `false` en caso contrario.
 */
function isValidString(str) {
  return str && typeof str === "string" && str.trim().length > 0;
}

// ----------------------------------------------------------------------------
// TEXTO
// ----------------------------------------------------------------------------

/**
 * Deriva un título a partir de la primera línea del contenido.
 * Si supera los 50 caracteres, se trunca y se agrega "...".
 * @param {string} content - Contenido de la nota.
 * @returns {string} Título derivado o "Sin título" si el contenido es inválido.
 */
function deriveTitle(content) {
  if (!isValidString(content)) return "Sin título";

  const firstLine = content.trim().split("\n")[0].trim();
  return firstLine.length <= 50 ? firstLine : `${firstLine.slice(0, 50)}...`;
}

/**
 * Exrtrae un resumen corto del contenido.
 * @param {string} content - Contenido de la nota.
 * @param {number} [maxLen] - Límite de caracteres del resumen. Por defecto: 70.
 * @returns {string} Resumen del contenido, truncado con "..." si supera el límite.
 */
function deriveExcerpt(content, maxLen) {
  if (!isValidString(content)) return "";

  const limit = isValidNumber(maxLen) ? maxLen : 70;
  const clean = content.trim();

  return clean.length <= limit ? clean : clean.slice(0, limit) + "...";
}

// ----------------------------------------------------------------------------
// RESULT FACTORY
// Contenedor estándar para respuestas de operaciones.
// Facilita la comunicación entre capas y evita lanzar excepciones para
// errores de negocio esperados.
// ----------------------------------------------------------------------------

const Result = {
  /**
   * Respuesta de operación exitosa.
   * @param {Object} data - Payload del resultado (ej. `{ note }` o `{ notes }`).
   * @returns {{ success: true, data: Object }}
   */
  ok: (data) => ({ success: true, data }),

  /**
   * Respuesta de operación fallida.
   * @param {string} message - Descripción del error ocurrido.
   * @returns {{ success: false, message: string }}
   */
  fail: (message) => ({ success: false, message }),
};

// ----------------------------------------------------------------------------
// UTILIDADES INTERNAS
// ----------------------------------------------------------------------------

// Copia superficial del arreglo de notas para evitar mutaciones externas al store.
const cloneNotes = (notesToClone) => notesToClone.map((note) => ({ ...note }));

// --------------------------------------------
// GENERACIÓN DE ID ÚNICO
// --------------------------------------------

/**
 * Genera un ID único basado en la fecha actual
 * @returns {number} Timestamp en milisegundos desde 1970
 */
function generateId() {
  const timestamp = Date.now();
  return timestamp;
}

// ----------------------------------------------------------------------------
// ENTIDAD NOTA
// ----------------------------------------------------------------------------

/**
 * Crea un nuevo objeto de nota con sus metadatos iniciales.
 * Si no se provee título, se deriva automáticamente del contenido.
 * @param {string} content - Contenido de la nota. No puede estar vacío.
 * @param {string} [title] - Título opcional. Si se omite, se deriva del contenido.
 * @returns {Object|null} Objeto nota, o `null` si el contenido es inválido.
 */
function createNote(content, title) {
  if (!isValidString(content)) return null;
  const now = Date.now();

  return {
    id: generateId(),
    content: content.trim(),
    title: isValidString(title) ? title : deriveTitle(content),
    excerpt: deriveExcerpt(content, 100),
    createdAt: now,
    updatedAt: now,
    favorite: false,
  };
}

// ----------------------------------------------------------------------------
// LOCAL STORE
// ----------------------------------------------------------------------------

/**
 * Guarda las notas en localstorage
 * @param {Array} notes - Array de notas a guardar.
 */
function saveToStorage(notes) {
  if (!Array.isArray(notes)) {
    console.error("No se pueden guardar notas, datos inválidos");
    return;
  }

  const notesJSON = JSON.stringify(notes);
  localStorage.setItem(STORAGE_KEY, notesJSON);
}

/**
 * Carga las notas desde localstorage
 * @returns {Array} notes - Array de notas o array vacio si no hay.
 */
function loadFromStorage() {
  const notesJSON = localStorage.getItem(STORAGE_KEY);

  if (!notesJSON) return [];

  try {
    const notes = JSON.parse(notesJSON);
    return Array.isArray(notes) ? notes : [];
  } catch (error) {
    console.error("Error al parsear notas:", error);
    return [];
  }
}

// ----------------------------------------------------------------------------
// STORE DE NOTAS
// Usa un closure para encapsular el estado y exponer solo la API pública.
// ----------------------------------------------------------------------------

/**
 * Crea y retorna un store de notas con estado privado.
 *
 * Todas las operaciones retornan un objeto `Result` con la forma:
 * - Éxito:  `{ success: true,  data: { ... } }`
 * - Fallo:  `{ success: false, message: string }`
 *
 * @returns {{
 *   addNote: Function,
 *   getNoteById: Function,
 *   updateNote: Function,
 *   deleteNote: Function,
 *   getAllNotes: Function,
 *   getNotesOrderedByDate: Function,
 *   getFavoriteNotes: Function,
 *   searchNotes: Function,
 *   getNotesCount: Function
 * }}
 */
function createPersistentNotesStore() {
  let notes = loadFromStorage();

  // --- Crear ---

  /**
   * Agrega una nueva nota al store.
   * @param {string} content - Contenido de la nota.
   * @param {string} [title] - Título opcional.
   * @returns {Result} `{ note }` con la nota creada.
   */
  function addNote(content, title) {
    if (!isValidString(content)) {
      return Result.fail("El contenido debe ser un texto, no vacío");
    }

    const newNote = createNote(content, title);

    if (!newNote) return Result.fail("Error al crear la nota");

    notes.push(newNote);
    saveToStorage(notes);

    return Result.ok({ note: { ...newNote } });
  }

  // --- Consultar ---

  /**
   * Busca una nota por su ID.
   * @param {number} id - ID numérico de la nota.
   * @returns {Result} `{ note }` con la nota encontrada.
   */
  function getNoteById(id) {
    if (!isValidNumber(id)) return Result.fail("ID inválido");

    const found = notes.find((note) => note.id === id);

    if (!found) return Result.fail("Nota no encontrada");

    return Result.ok({ note: { ...found } });
  }

  // --- Actualizar ---

  /**
   * Actualiza los campos de una nota existente.
   *
   * Comportamiento del título:
   * - Si el título fue derivado automáticamente y se actualiza el contenido,
   *   el título también se re-deriva automáticamente.
   * - Si se pasa un `title` explícito en `updates`, este tiene prioridad.
   *
   * @param {number} id - ID de la nota a actualizar.
   * @param {{
   * content?: string,
   * title?: string,
   * favorite?: boolean
   * }} updates - Campos a actualizar.
   * @returns {Result} `{ note }` con la nota actualizada.
   */
  function updateNote(id, updates) {
    if (!isValidNumber(id)) return Result.fail("ID inválido");

    const note = notes.find((note) => note.id === id);
    if (!note) return Result.fail("Nota no encontrada");

    if (updates.content !== undefined) {
      if (!isValidString(updates.content))
        return Result.fail("El contenido no puede estar vacío");

      const hasAutoTitle = note.title === deriveTitle(note.content);

      note.content = updates.content.trim();
      note.excerpt = deriveExcerpt(updates.content, 100);

      if (updates.title !== undefined) {
        note.title = updates.title.trim();
      } else if (hasAutoTitle) {
        note.title = deriveTitle(updates.content);
      }
    } else if (updates.title !== undefined) {
      note.title = updates.title.trim();
    }

    if (updates.favorite !== undefined) {
      note.favorite = !!updates.favorite;
    }

    note.updatedAt = Date.now();
    saveToStorage(notes);

    return Result.ok({ note: { ...note } });
  }

  // --- Eliminar ---

  /**
   * Elimina una nota del store por su ID.
   * @param {number} id - ID de la nota a eliminar.
   * @returns {Result} `{ message, deletedId }` si fue eliminada.
   */
  function deleteNote(id) {
    if (!isValidNumber(id)) return Result.fail("ID inválido");

    const prevLength = notes.length;
    notes = notes.filter((note) => note.id !== id);

    if (notes.length === prevLength) return Result.fail("Nota no encontrada");

    saveToStorage(notes);

    return Result.ok({ message: "Nota eliminada exitosamente", deletedId: id });
  }

  // --- Consultas ---

  /**
   * Retorna todas las notas del store.
   * @returns {Result} `{ notes }` con el arreglo completo de notas.
   */
  function getAllNotes() {
    return Result.ok({ notes: cloneNotes(notes) });
  }

  /**
   * Retorna todas las notas ordenadas por `updatedAt` de forma descendente
   * (la más reciente primero).
   * @returns {Result} `{ notes }` con las notas ordenadas.
   */
  function getNotesOrderedByDate() {
    const sorted = cloneNotes(notes).sort((a, b) => b.updatedAt - a.updatedAt);

    return Result.ok({ notes: sorted });
  }

  /**
   * Retorna solo las notas marcadas como favoritas.
   * @returns {Result} `{ notes }` con las notas favoritas.
   */
  function getFavoriteNotes() {
    const favorites = notes.filter((note) => note.favorite === true);

    return Result.ok({ notes: cloneNotes(favorites) });
  }

  /**
   * Busca notas que contengan el término en el título o en el contenido.
   * La búsqueda no es sensible a mayúsculas/minúsculas.
   * Si la consulta está vacía, retorna un arreglo vacío.
   * @param {string} query - Término de búsqueda.
   * @returns {Result} `{ notes }` con las notas que coinciden.
   */
  function searchNotes(query) {
    if (!query || query.trim() === "") {
      return Result.ok({ notes: [] });
    }

    const normalizedQuery = query.toLowerCase().trim();

    const filtered = notes.filter((note) => {
      const searchableText = `${note.title} ${note.content}`.toLowerCase();
      return searchableText.includes(normalizedQuery);
    });

    return Result.ok({ notes: cloneNotes(filtered) });
  }

  /**
   * Retorna la cantidad total de notas en el store.
   * @returns {number}
   */
  function getNotesCount() {
    return notes.length;
  }

  return {
    addNote,
    getNoteById,
    updateNote,
    deleteNote,
    getAllNotes,
    getNotesOrderedByDate,
    getFavoriteNotes,
    searchNotes,
    getNotesCount,
  };
}

// ----------------------------------------------------------------------------
// RENDERIZADO
// ----------------------------------------------------------------------------

/**
 * Renderiza la lista de notas en el DOM
 * @param {Array} notes - Array de notas a renderizar
 */
function renderNoteList(notes) {
  const noteListElement = document.querySelector("#note-list");

  if (!noteListElement) {
    console.error("No se encontró el elemento #note-list");
    return;
  }

  noteListElement.innerHTML = ""; //ver despues que hace

  if (!Array.isArray(notes) || notes.length === 0) {
    noteListElement.innerHTML =
      '<p class="empty-message">No hay notas aún. Crea una nota para empezar.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();

  notes.forEach((note) => {
    const noteItem = document.createElement("div");
    noteItem.className = `note-item ${currentNoteId === note.id ? "active" : ""}`;
    noteItem.dataset.id = note.id;

    const noteTitle = document.createElement("h3");
    noteTitle.textContent = note.title;

    const noteExcerpt = document.createElement("p");
    noteExcerpt.textContent = note.excerpt;
    noteExcerpt.className = "note-excerpt";

    const noteDate = document.createElement("small");
    const date = new Date(note.updatedAt);
    noteDate.textContent = date.toLocaleDateString();
    noteDate.className = "note-date";

    noteItem.append(noteTitle, noteExcerpt, noteDate);
    fragment.append(noteItem);
  });

  noteListElement.append(fragment);
}

/**
 * Alterna la visibilidad de los contenedores de editor y preview.
 * * @param {boolean} isVisible - Indica si se deben mostrar (true) u ocultar (false).
 * @returns {void} Esta función no retorna ningún valor.
 */
function toggleEditorAndPreview(isVisible) {
  const editorSection = document.querySelector("#editor-section");
  const previewSection = document.querySelector("#preview-section");

  editorSection?.classList.toggle("is-hidden", !isVisible);
  previewSection?.classList.toggle("is-hidden", !isVisible);
}

/**
 * Renderizar el editor con el contenido de una nota.
 * @param {Object|null} note - Nota a renderizar o null para el editor vacío.
 */
function renderEditor(note) {
  const editorTextArea = document.querySelector("#editor-textarea");

  if (!editorTextArea) {
    console.error("No se encontró el elemento #editor-textarea");
    return;
  }

  toggleEditorAndPreview(true);

  editorTextArea.value = note?.content || "";
  currentNoteId = note?.id || "";

  renderPreview(editorTextArea.value);
}

/**
 * Convierte texto Markdown a HTML.
 * @param {string} content - El texto en formato Markdown.
 * @returns {string} El HTML generado o una cadena vacía si falla.
 */
function renderMarkdown(content) {
  if (typeof window.markdownit === "undefined") {
    console.error("Markdown-it no está cargado.");
    return "";
  }

  const md = window.markdownit();

  md.use(window.markdownitTaskLists);

  return md.render(content);
}

/**
 * Renderiza el contenido Markdown en el contenedor de preview.
 * @param {string} content - Contenido markdown a renderizar.
 */
function renderPreview(content) {
  const previewSection = document.querySelector("#preview-container");

  if (!previewSection) {
    console.error("No se encontró el contenedor #preview-container");
    return;
  }

  if (!content || content.trim() === "") {
    previewSection.innerHTML =
      '<p class="preview-empty">El preview aparecerá aquí...</p>';
    return;
  }

  previewSection.innerHTML = renderMarkdown(content);
}

/**
 * Muestra un mensaje de error o éxito
 * @param {string} message - Mensaje a mostrar
 * @param {boolean} isError - true si es error, false si es éxito
 */
function showMessage(message, isError) {
  const messageContainer = document.querySelector("#message-container");

  if (!messageContainer) {
    console.error("No se encontró el contenedor #message-container");
    return;
  }

  if (messageTimer) clearTimeout(messageTimer);

  messageContainer.textContent = message;

  messageContainer.classList.remove("error", "success");
  messageContainer.classList.add(isError ? "error" : "success");

  messageTimer = setTimeout(() => {
    messageContainer.textContent = "";
    messageContainer.classList.remove("error", "success");
  }, 3000);
}

// ----------------------------------------------------------------------------
// EVENTOS
// ----------------------------------------------------------------------------

/**
 * Inicitaliza todos los events listeners de la aplicación
 * @param {Object} store - Store de notas
 */

function initializeEventListeners(store) {
  // Helper para refrescar la lista
  const refreshNoteList = () => {
    const {
      data: { notes },
    } = store.getNotesOrderedByDate();

    renderNoteList(notes);
  };

  //Nota Nueva
  const newNoteButton = document.querySelector("#new-note-button");

  newNoteButton?.addEventListener("click", () => {
    currentNoteId = null;
    refreshNoteList();
    renderEditor(null);
  });

  //Guardar Nota
  const saveNoteButton = document.querySelector("#save-note-button");

  saveNoteButton?.addEventListener("click", () => {
    const editorTextArea = document.querySelector("#editor-textarea");
    const content = editorTextArea?.value || "";

    if (content.trim() === "") {
      return showMessage("El contenido no puede estar vacio", true);
    }

    const result = currentNoteId
      ? store.updateNote(currentNoteId, { content })
      : store.addNote(content);

    if (result.success) {
      showMessage(
        currentNoteId ? "Actualizada exitosamente" : "Creada exitosamente",
      );

      currentNoteId = result.data?.note?.id || currentNoteId;

      refreshNoteList();
    } else {
      showMessage(result.message, true);
    }
  });

  //Eliminar nota
  const deleteNoteButton = document.querySelector("#delete-note-button");

  deleteNoteButton?.addEventListener("click", () => {
    if (!currentNoteId) {
      return showMessage("No hay una nota seleccionada", true);
    }

    if (confirm("Estas seguro?")) {
      const result = store.deleteNote(currentNoteId);

      if (result.success) {
        showMessage("Nota eliminada", false);

        toggleEditorAndPreview(false);

        currentNoteId = null;

        refreshNoteList();
      } else {
        showMessage(result.message, true);
      }
    }
  });

  //Editar nota

  const noteListContainer = document.querySelector("#note-list");

  noteListContainer?.addEventListener("click", (event) => {
    const noteItem = event.target.closest(".note-item");

    if (!noteItem) return;

    const noteId = Number(noteItem.dataset.id);

    const result = store.getNoteById(noteId);

    if (result.success) {
      renderEditor(result.data.note);

      refreshNoteList();
    } else {
      showMessage(result.message, true);
    }
  });

  //Renderizar el textArea al preview de markdown
  const editorTextArea = document.querySelector("#editor-textarea");

  editorTextArea?.addEventListener("input", () => {
    const content = editorTextArea.value;
    renderPreview(content);
  });
}

// ----------------------------------------------------------------------------
// INICIALIZACION
// ----------------------------------------------------------------------------

/**
 * Función principal que inicializa la aplicación
 */
function initialzeApp() {
  const store = createPersistentNotesStore();

  const result = store.getNotesOrderedByDate();

  renderNoteList(result.data.notes);

  toggleEditorAndPreview(false);

  initializeEventListeners(store);

  console.log("Aplicación inicializada correctamente");
  console.log("Total de notas cargadas:", store.getNotesCount());
}

document.addEventListener("DOMContentLoaded", () => {
  initialzeApp();
});
