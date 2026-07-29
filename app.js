// =============================================================================
// SISTEMA DE NOTAS - Módulo Core
// =============================================================================

const STORAGE_KEY = "markdown-notes";
const EXCERPT_MAX_LEN = 100;
const PREVIEW_DEBOUNCE_MS = 200;
const SEARCH_DEBOUNCE_MS = 200;

let currentNoteId = null;
let messageTimer;
let previewDebounceTimer;
let searchDebounceTimer;
let lastLoadedContent = "";
let searchQuery = "";
let showFavoritesOnly = false;
let selectionMode = false;
let selectedNoteIds = new Set();

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

/**
 * Valida que el valor sea un ID de nota válido (string no vacío).
 * @param {string} id - ID a validar.
 * @returns {boolean} `true` si es un ID válido, `false` en caso contrario.
 */
function isValidId(id) {
  return typeof id === "string" && id.length > 0;
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
 * @param {number} [maxLen] - Límite de caracteres del resumen. Por defecto: EXCERPT_MAX_LEN.
 * @returns {string} Resumen del contenido, truncado con "..." si supera el límite.
 */
function deriveExcerpt(content, maxLen) {
  if (!isValidString(content)) return "";

  const limit = isValidNumber(maxLen) ? maxLen : EXCERPT_MAX_LEN;
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

/**
 * Exporta un arreglo de notas como archivo .json descargable.
 * Usa la API del navegador (Blob + <a download>), no requiere backend.
 * @param {Array} notes - Notas a exportar.
 */
function exportNotesAsJSON(notes) {
  const blob = new Blob([JSON.stringify(notes, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `notas-markdown-${new Date().toISOString().slice(0, 10)}.json`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

// --------------------------------------------
// GENERACIÓN DE ID ÚNICO
// --------------------------------------------

/**
 * Genera un ID único (UUID v4) para una nota.
 * Usa `crypto.randomUUID()` cuando está disponible; si no (navegadores muy
 * viejos o contextos no seguros), recurre a un fallback basado en timestamp
 * + número aleatorio para evitar colisiones.
 * @returns {string} ID único.
 */
function generateId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
    excerpt: deriveExcerpt(content, EXCERPT_MAX_LEN),
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
    return false;
  }

  try {
    const notesJSON = JSON.stringify(notes);
    localStorage.setItem(STORAGE_KEY, notesJSON);
    return true;
  } catch (error) {
    console.error("Error al guardar notas en localStorage:", error);
    return false;
  }
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
 *   queryNotes: Function,
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

    if (!saveToStorage(notes)) {
      notes.pop(); // revertir: no dejar el store en memoria desincronizado del storage
      return Result.fail(
        "No se pudo guardar la nota (almacenamiento lleno o no disponible)",
      );
    }

    return Result.ok({ note: { ...newNote } });
  }

  // --- Consultar ---

  /**
   * Busca una nota por su ID.
   * @param {string} id - ID (UUID) de la nota.
   * @returns {Result} `{ note }` con la nota encontrada.
   */
  function getNoteById(id) {
    if (!isValidId(id)) return Result.fail("ID inválido");

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
   * @param {string} id - ID (UUID) de la nota a actualizar.
   * @param {{
   * content?: string,
   * title?: string,
   * favorite?: boolean
   * }} updates - Campos a actualizar.
   * @returns {Result} `{ note }` con la nota actualizada.
   */
  function updateNote(id, updates) {
    if (!isValidId(id)) return Result.fail("ID inválido");

    const note = notes.find((note) => note.id === id);
    if (!note) return Result.fail("Nota no encontrada");

    // Snapshot para poder revertir si falla el guardado en storage.
    const previousState = { ...note };

    if (updates.content !== undefined) {
      if (!isValidString(updates.content))
        return Result.fail("El contenido no puede estar vacío");

      const hasAutoTitle = note.title === deriveTitle(note.content);

      note.content = updates.content.trim();
      note.excerpt = deriveExcerpt(updates.content, EXCERPT_MAX_LEN);

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

    if (!saveToStorage(notes)) {
      Object.assign(note, previousState); // revertir cambios en memoria
      return Result.fail(
        "No se pudo guardar los cambios (almacenamiento lleno o no disponible)",
      );
    }

    return Result.ok({ note: { ...note } });
  }

  // --- Eliminar ---

  /**
   * Elimina una nota del store por su ID.
   * @param {string} id - ID (UUID) de la nota a eliminar.
   * @returns {Result} `{ message, deletedId }` si fue eliminada.
   */
  function deleteNote(id) {
    if (!isValidId(id)) return Result.fail("ID inválido");

    const previousNotes = notes;
    const filteredNotes = notes.filter((note) => note.id !== id);

    if (filteredNotes.length === previousNotes.length)
      return Result.fail("Nota no encontrada");

    notes = filteredNotes;

    if (!saveToStorage(notes)) {
      notes = previousNotes; // revertir: mantener la nota si no se pudo persistir el borrado
      return Result.fail(
        "No se pudo eliminar la nota (almacenamiento no disponible)",
      );
    }

    return Result.ok({ message: "Nota eliminada exitosamente", deletedId: id });
  }

  /**
   * Elimina varias notas del store de una sola vez.
   * @param {string[]} ids - IDs de las notas a eliminar.
   * @returns {Result} `{ message, deletedCount }` si al menos una fue eliminada.
   */
  function deleteNotes(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
      return Result.fail("No hay notas seleccionadas");
    }

    const previousNotes = notes;
    const idSet = new Set(ids);
    const filteredNotes = notes.filter((note) => !idSet.has(note.id));
    const deletedCount = previousNotes.length - filteredNotes.length;

    if (deletedCount === 0) return Result.fail("Notas no encontradas");

    notes = filteredNotes;

    if (!saveToStorage(notes)) {
      notes = previousNotes; // revertir: mantener las notas si no se pudo persistir el borrado
      return Result.fail(
        "No se pudieron eliminar las notas (almacenamiento no disponible)",
      );
    }

    return Result.ok({
      message:
        deletedCount === 1
          ? "1 nota eliminada exitosamente"
          : `${deletedCount} notas eliminadas exitosamente`,
      deletedCount,
    });
  }

  /**
   * Marca o desmarca como favoritas varias notas de una sola vez.
   * @param {string[]} ids - IDs de las notas a actualizar.
   * @param {boolean} favorite - `true` para marcarlas, `false` para desmarcarlas.
   * @returns {Result} `{ updatedCount }` con la cantidad de notas afectadas.
   */
  function setFavoriteForNotes(ids, favorite) {
    if (!Array.isArray(ids) || ids.length === 0) {
      return Result.fail("No hay notas seleccionadas");
    }

    const idSet = new Set(ids);
    const affected = notes.filter((note) => idSet.has(note.id));

    if (affected.length === 0) return Result.fail("Notas no encontradas");

    const previousStates = affected.map((note) => ({ ...note }));
    const now = Date.now();

    affected.forEach((note) => {
      note.favorite = !!favorite;
      note.updatedAt = now;
    });

    if (!saveToStorage(notes)) {
      // revertir: restaurar el estado previo de cada nota afectada
      previousStates.forEach((previous) => {
        const note = notes.find((note) => note.id === previous.id);
        if (note) Object.assign(note, previous);
      });
      return Result.fail(
        "No se pudo guardar los cambios (almacenamiento lleno o no disponible)",
      );
    }

    return Result.ok({ updatedCount: affected.length });
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
   * Filtra y ordena las notas en un solo paso, combinando los criterios
   * de favoritas y búsqueda por texto.
   * @param {{ favoritesOnly?: boolean, searchQuery?: string }} [filters]
   * @returns {Result} `{ notes }` con las notas filtradas, ordenadas de
   * más reciente a más antigua según `updatedAt`.
   */
  function queryNotes({ favoritesOnly = false, searchQuery = "" } = {}) {
    let result = notes;

    if (favoritesOnly) {
      result = result.filter((note) => note.favorite === true);
    }

    const normalizedQuery = searchQuery.trim().toLowerCase();

    if (normalizedQuery !== "") {
      result = result.filter((note) =>
        `${note.title} ${note.content}`.toLowerCase().includes(normalizedQuery),
      );
    }

    const sorted = cloneNotes(result).sort((a, b) => b.updatedAt - a.updatedAt);

    return Result.ok({ notes: sorted });
  }

  /**
   * Retorna la cantidad total de notas en el store.
   * @returns {number}
   */
  function getNotesCount() {
    return notes.length;
  }

  /**
   * Retorna las notas cuyo ID esté incluido en `ids`, en el mismo orden
   * en que existen en el store. Útil para exportar una selección puntual.
   * @param {string[]} ids - IDs de las notas a recuperar.
   * @returns {Result} `{ notes }` con las notas encontradas.
   */
  function getNotesByIds(ids) {
    if (!Array.isArray(ids)) return Result.fail("IDs inválidos");

    const idSet = new Set(ids);
    const found = notes.filter((note) => idSet.has(note.id));

    return Result.ok({ notes: cloneNotes(found) });
  }

  return {
    addNote,
    getNoteById,
    updateNote,
    deleteNote,
    deleteNotes,
    setFavoriteForNotes,
    getAllNotes,
    getNotesByIds,
    queryNotes,
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

  noteListElement.innerHTML = "";

  if (!Array.isArray(notes) || notes.length === 0) {
    const emptyText =
      searchQuery.trim() !== "" || showFavoritesOnly
        ? "No hay notas que coincidan con el filtro actual."
        : "No hay notas aún. Crea una nota para empezar.";

    noteListElement.innerHTML = `<p class="empty-message">${emptyText}</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  notes.forEach((note) => {
    const isSelected = selectedNoteIds.has(note.id);

    const noteItem = document.createElement("div");
    noteItem.className = [
      "note-item",
      currentNoteId === note.id ? "active" : "",
      selectionMode ? "selection-mode" : "",
      isSelected ? "is-selected" : "",
    ]
      .filter(Boolean)
      .join(" ");
    noteItem.dataset.id = note.id;

    if (selectionMode) {
      const checkboxLabel = document.createElement("label");
      checkboxLabel.className = "note-select-checkbox";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.id = note.id;
      checkbox.checked = isSelected;
      checkbox.setAttribute("aria-label", `Seleccionar nota: ${note.title}`);

      checkboxLabel.append(checkbox);
      noteItem.append(checkboxLabel);
    }

    const noteHeader = document.createElement("div");
    noteHeader.className = "note-item-header";

    const noteTitle = document.createElement("h3");
    noteTitle.textContent = note.title;

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = `favorite-toggle ${note.favorite ? "is-favorite" : ""}`;
    favoriteButton.dataset.id = note.id;
    favoriteButton.textContent = note.favorite ? "★" : "☆";
    favoriteButton.setAttribute("aria-pressed", String(!!note.favorite));
    favoriteButton.setAttribute(
      "aria-label",
      note.favorite ? "Quitar de favoritas" : "Marcar como favorita",
    );

    noteHeader.append(noteTitle, favoriteButton);

    const noteExcerpt = document.createElement("p");
    noteExcerpt.textContent = note.excerpt;
    noteExcerpt.className = "note-excerpt";

    const noteDate = document.createElement("small");
    const date = new Date(note.updatedAt);
    noteDate.textContent = date.toLocaleDateString();
    noteDate.className = "note-date";

    noteItem.append(noteHeader, noteExcerpt, noteDate);
    fragment.append(noteItem);
  });

  noteListElement.append(fragment);
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
 * Muestra el botón de eliminar solo cuando hay una nota activa seleccionada.
 */
function updateDeleteButtonState() {
  const deleteNoteButton = document.querySelector("#delete-note-button");
  if (!deleteNoteButton) return;

  deleteNoteButton.classList.toggle("is-hidden", !currentNoteId);
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
  currentNoteId = note?.id ?? null;
  lastLoadedContent = editorTextArea.value;

  updateDeleteButtonState();
  renderPreview(editorTextArea.value);
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

/**
 * Si hay cambios sin guardar, pide confirmación al usuario antes de
 * descartarlos (por ejemplo, al cambiar de nota o crear una nueva).
 * @returns {boolean} `true` si es seguro continuar (no hay cambios o el usuario confirmó descartarlos).
 */
function confirmDiscardChangesIfNeeded() {
  const editorTextArea = document.querySelector("#editor-textarea");
  if (!editorTextArea) return true;

  if (editorTextArea.value === lastLoadedContent) return true;
  return confirm("Tenés cambios sin guardar. ¿Querés descartarlos?");
}

/**
 * Calcula qué notas mostrar en la lista según los filtros activos
 * (`searchQuery` y `showFavoritesOnly`). Delega el filtrado y el
 * ordenamiento por completo al store, que lo resuelve en un único paso.
 * @param {Object} store - Store de notas.
 * @returns {Array} Notas visibles, ordenadas de más reciente a más antigua.
 */
function getVisibleNotes(store) {
  return store.queryNotes({
    favoritesOnly: showFavoritesOnly,
    searchQuery,
  }).data.notes;
}

/**
 * Si hay cambios apunto de guardar, reinicia el scroll vertical de las notas
 */
function resetScrollListNotes() {
  const noteListElement = document.querySelector("#note-list");
  if (!noteListElement) {
    console.error("No se encontró el elemento #note-list");
    return;
  }

  noteListElement.scrollTo({ top: 0, behavior: "smooth" });
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
    renderNoteList(getVisibleNotes(store));
  };

  //Nota Nueva
  const newNoteButton = document.querySelector("#new-note-button");

  newNoteButton?.addEventListener("click", () => {
    if (!confirmDiscardChangesIfNeeded()) return;

    currentNoteId = null;
    refreshNoteList();
    resetScrollListNotes();
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
      lastLoadedContent = content;

      updateDeleteButtonState();
      refreshNoteList();
      resetScrollListNotes();
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

        const editorTextArea = document.querySelector("#editor-textarea");
        if (editorTextArea) editorTextArea.value = "";

        toggleEditorAndPreview(false);

        currentNoteId = null;
        lastLoadedContent = "";

        updateDeleteButtonState();
        refreshNoteList();
        resetScrollListNotes();
      } else {
        showMessage(result.message, true);
      }
    }
  });

  //Editar nota y Marcar/desmarcar favorita
  const noteListContainer = document.querySelector("#note-list");

  const handleToggleFavorite = (favoriteButton) => {
    const noteId = favoriteButton.dataset.id;
    const currentNote = store.getNoteById(noteId);

    if (!currentNote.success) {
      return showMessage(currentNote.message, true);
    }

    const result = store.updateNote(noteId, {
      favorite: !currentNote.data.note.favorite,
    });

    if (result.success) {
      refreshNoteList();
    } else {
      showMessage(result.message, true);
    }
  };

  const handleOpenNote = (noteItem) => {
    if (!confirmDiscardChangesIfNeeded()) return;

    const noteId = noteItem.dataset.id;

    const result = store.getNoteById(noteId);

    if (result.success) {
      renderEditor(result.data.note);

      refreshNoteList();
    } else {
      showMessage(result.message, true);
    }
  };

  const toggleNoteSelection = (noteId, isNowSelected) => {
    if (isNowSelected) {
      selectedNoteIds.add(noteId);
    } else {
      selectedNoteIds.delete(noteId);
    }

    document
      .querySelector(`.note-item[data-id="${noteId}"]`)
      ?.classList.toggle("is-selected", isNowSelected);

    updateBulkActionsUI();
  };

  noteListContainer?.addEventListener("click", (event) => {
    // En modo selección, un click en cualquier parte de la ficha (que no
    // sea el checkbox, que ya maneja su propio "change") alterna la
    // selección en vez de abrir la nota en el editor.
    if (selectionMode) {
      if (event.target.closest(".note-select-checkbox")) return;

      const noteItem = event.target.closest(".note-item");
      const checkbox = noteItem?.querySelector(".note-select-checkbox input");

      if (checkbox) checkbox.click();
      return;
    }

    const favoriteButton = event.target.closest(".favorite-toggle");

    if (favoriteButton) {
      event.stopPropagation();
      return handleToggleFavorite(favoriteButton);
    }

    const noteItem = event.target.closest(".note-item");

    if (noteItem) return handleOpenNote(noteItem);
  });

  noteListContainer?.addEventListener("change", (event) => {
    if (!event.target.matches(".note-select-checkbox input[type='checkbox']"))
      return;

    toggleNoteSelection(event.target.dataset.id, event.target.checked);
  });

  const editorTextArea = document.querySelector("#editor-textarea");

  editorTextArea?.addEventListener("input", () => {
    clearTimeout(previewDebounceTimer);
    previewDebounceTimer = setTimeout(
      () => renderPreview(editorTextArea.value),
      PREVIEW_DEBOUNCE_MS,
    );
  });

  //Menú de opciones (3 puntos): Seleccionar notas / Exportar todas
  const notesMenuButton = document.querySelector("#notes-menu-button");
  const notesMenuDropdown = document.querySelector("#notes-menu-dropdown");
  const menuSelectNotesItem = document.querySelector("#menu-select-notes");
  const menuExportAllItem = document.querySelector("#menu-export-all");

  const closeNotesMenu = () => {
    notesMenuDropdown?.classList.add("is-hidden");
    notesMenuButton?.setAttribute("aria-expanded", "false");
  };

  const openNotesMenu = () => {
    notesMenuDropdown?.classList.remove("is-hidden");
    notesMenuButton?.setAttribute("aria-expanded", "true");
  };

  notesMenuButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = notesMenuDropdown?.classList.contains("is-hidden") === false;
    isOpen ? closeNotesMenu() : openNotesMenu();
  });

  // Cerrar el menú al hacer click afuera o al presionar Escape
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".notes-menu")) closeNotesMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeNotesMenu();
  });

  menuSelectNotesItem?.addEventListener("click", () => {
    closeNotesMenu();
    enterSelectionMode();
  });

  menuExportAllItem?.addEventListener("click", () => {
    closeNotesMenu();

    const {
      data: { notes },
    } = store.getAllNotes();

    if (notes.length === 0) {
      return showMessage("No hay notas para exportar", true);
    }

    exportNotesAsJSON(notes);
    showMessage("Notas exportadas", false);
  });

  //Buscar notas
  const searchInput = document.querySelector("#search-input");

  searchInput?.addEventListener("input", () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      searchQuery = searchInput.value;
      refreshNoteList();
    }, SEARCH_DEBOUNCE_MS);
  });

  //Filtrar solo favoritas
  const favoritesToggleButton = document.querySelector(
    "#favorites-toggle-button",
  );

  favoritesToggleButton?.addEventListener("click", () => {
    showFavoritesOnly = !showFavoritesOnly;

    favoritesToggleButton.classList.toggle("active", showFavoritesOnly);
    favoritesToggleButton.setAttribute(
      "aria-pressed",
      String(showFavoritesOnly),
    );
    favoritesToggleButton.textContent = showFavoritesOnly
      ? "★ Solo favoritas"
      : "☆ Solo favoritas";

    refreshNoteList();
  });

  // ----------------------------------------------------------------------
  // SELECCIÓN MÚLTIPLE (eliminar, favoritos y exportar a discreción)
  // ----------------------------------------------------------------------

  const bulkActionsBar = document.querySelector("#bulk-actions-bar");
  const cancelSelectionButton = document.querySelector(
    "#cancel-selection-button",
  );
  const selectAllCheckbox = document.querySelector("#select-all-checkbox");
  const selectionCountLabel = document.querySelector("#selection-count-label");
  const bulkFavoriteButton = document.querySelector("#bulk-favorite-button");
  const bulkUnfavoriteButton = document.querySelector(
    "#bulk-unfavorite-button",
  );
  const bulkExportButton = document.querySelector("#bulk-export-button");
  const bulkDeleteButton = document.querySelector("#bulk-delete-button");

  // Refleja en la UI cuántas notas hay seleccionadas, habilita/deshabilita
  // los botones en lote, y sincroniza el estado del checkbox "todas".
  const updateBulkActionsUI = () => {
    const count = selectedNoteIds.size;

    if (selectionCountLabel) {
      selectionCountLabel.textContent =
        count === 1 ? "1 nota seleccionada" : `${count} notas seleccionadas`;
    }

    [
      bulkFavoriteButton,
      bulkUnfavoriteButton,
      bulkExportButton,
      bulkDeleteButton,
    ].forEach((button) => {
      if (button) button.disabled = count === 0;
    });

    if (selectAllCheckbox) {
      const visibleNotes = getVisibleNotes(store);
      const visibleSelectedCount = visibleNotes.filter((note) =>
        selectedNoteIds.has(note.id),
      ).length;

      selectAllCheckbox.checked =
        visibleNotes.length > 0 && visibleSelectedCount === visibleNotes.length;
      selectAllCheckbox.indeterminate =
        visibleSelectedCount > 0 && visibleSelectedCount < visibleNotes.length;
    }
  };

  // Entrar al modo selección (se activa desde el menú de 3 puntos)
  const enterSelectionMode = () => {
    if (selectionMode) return;

    selectionMode = true;
    bulkActionsBar?.classList.remove("is-hidden");

    refreshNoteList();
    updateBulkActionsUI();
  };

  // Salir del modo selección (botón ✕ de la barra de acciones)
  const exitSelectionMode = () => {
    if (!selectionMode) return;

    selectionMode = false;
    selectedNoteIds.clear();
    bulkActionsBar?.classList.add("is-hidden");

    refreshNoteList();
    updateBulkActionsUI();
  };

  cancelSelectionButton?.addEventListener("click", exitSelectionMode);

  // Seleccionar/deseleccionar todas las notas visibles (respeta filtros)
  selectAllCheckbox?.addEventListener("change", () => {
    const visibleNotes = getVisibleNotes(store);

    visibleNotes.forEach((note) => {
      if (selectAllCheckbox.checked) {
        selectedNoteIds.add(note.id);
      } else {
        selectedNoteIds.delete(note.id);
      }
    });

    refreshNoteList();
    updateBulkActionsUI();
  });

  // Marcar selección como favorita
  bulkFavoriteButton?.addEventListener("click", () => {
    const ids = Array.from(selectedNoteIds);
    if (ids.length === 0) return;

    const result = store.setFavoriteForNotes(ids, true);

    if (!result.success) return showMessage(result.message, true);

    showMessage(
      result.data.updatedCount === 1
        ? "1 nota marcada como favorita"
        : `${result.data.updatedCount} notas marcadas como favoritas`,
      false,
    );
    exitSelectionMode();
  });

  // Quitar de favoritas la selección
  bulkUnfavoriteButton?.addEventListener("click", () => {
    const ids = Array.from(selectedNoteIds);
    if (ids.length === 0) return;

    const result = store.setFavoriteForNotes(ids, false);

    if (!result.success) return showMessage(result.message, true);

    showMessage(
      result.data.updatedCount === 1
        ? "1 nota quitada de favoritas"
        : `${result.data.updatedCount} notas quitadas de favoritas`,
      false,
    );
    exitSelectionMode();
  });

  // Exportar solo las notas seleccionadas (una, varias o todas si se
  // seleccionaron todas mediante el checkbox "todas")
  bulkExportButton?.addEventListener("click", () => {
    const ids = Array.from(selectedNoteIds);
    if (ids.length === 0) return;

    const result = store.getNotesByIds(ids);

    if (!result.success) return showMessage(result.message, true);

    exportNotesAsJSON(result.data.notes);
    showMessage(
      result.data.notes.length === 1 ? "Nota exportada" : "Notas exportadas",
      false,
    );
    exitSelectionMode();
  });

  // Eliminar todas las notas seleccionadas de una vez
  bulkDeleteButton?.addEventListener("click", () => {
    const ids = Array.from(selectedNoteIds);
    if (ids.length === 0) return;

    const confirmMessage =
      ids.length === 1
        ? "¿Eliminar la nota seleccionada?"
        : `¿Eliminar las ${ids.length} notas seleccionadas?`;

    if (!confirm(confirmMessage)) return;

    const result = store.deleteNotes(ids);

    if (!result.success) return showMessage(result.message, true);

    // Si la nota abierta en el editor estaba entre las eliminadas, cerramos
    // el editor para no dejarlo mostrando una nota que ya no existe.
    if (currentNoteId && ids.includes(currentNoteId)) {
      const editorTextArea = document.querySelector("#editor-textarea");
      if (editorTextArea) editorTextArea.value = "";

      toggleEditorAndPreview(false);

      currentNoteId = null;
      lastLoadedContent = "";
      updateDeleteButtonState();
    }

    showMessage(result.data.message, false);

    exitSelectionMode();
  });
}

// ----------------------------------------------------------------------------
// INICIALIZACION
// ----------------------------------------------------------------------------

/**
 * Función principal que inicializa la aplicación
 */
function initializeApp() {
  const store = createPersistentNotesStore();

  renderNoteList(getVisibleNotes(store));

  toggleEditorAndPreview(false);
  updateDeleteButtonState();

  initializeEventListeners(store);

  console.log("Aplicación inicializada correctamente");
  console.log("Total de notas cargadas:", store.getNotesCount());
}

document.addEventListener("DOMContentLoaded", () => {
  initializeApp();
});
