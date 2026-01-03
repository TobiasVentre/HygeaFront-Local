/**
 * Módulo de utilidades DOM reutilizables
 * --------------------------------------
 * Estas funciones ayudan a manejar el DOM sin repetir código.
 * Podés importarlas en cualquier vista o componente.
 */

/**
 * Vacía el contenido de un elemento del DOM.
 * @param {HTMLElement|string} element - Elemento o ID del elemento.
 */
export function clearElement(element) {
  const el = typeof element === "string" ? document.getElementById(element) : element;
  if (el) el.innerHTML = "";
}

/**
 * Crea un elemento con atributos y contenido opcional.
 * @param {string} tag - Etiqueta del elemento (ej: 'div', 'button').
 * @param {object} [options] - Atributos o propiedades (ej: { id, className, textContent }).
 * @param {HTMLElement[]} [children] - Elementos hijos.
 * @returns {HTMLElement}
 */
export function createElement(tag, options = {}, children = []) {
  const el = document.createElement(tag);
  Object.entries(options).forEach(([key, value]) => {
    if (key in el) el[key] = value;
    else el.setAttribute(key, value);
  });
  children.forEach(child => el.appendChild(child));
  return el;
}

/**
 * Inserta contenido HTML dentro de un contenedor.
 * @param {HTMLElement|string} container - Elemento o ID del contenedor.
 * @param {string} html - HTML a insertar.
 * @param {boolean} [append=false] - Si es true, agrega al final en lugar de reemplazar.
 */
export function renderHTML(container, html, append = false) {
  const el = typeof container === "string" ? document.getElementById(container) : container;
  if (!el) return;
  el.innerHTML = append ? el.innerHTML + html : html;
}

/**
 * Crea y muestra un mensaje temporal (alerta visual).
 * @param {string} message - Texto del mensaje.
 * @param {('success'|'error'|'info')} [type='info'] - Tipo de mensaje.
 * @param {number} [duration=3000] - Duración en milisegundos.
 */
export function showMessage(message, type = "info", duration = 3000) {
  const msg = document.createElement("div");
  msg.className = `alert alert-${type}`;
  msg.textContent = message;
  Object.assign(msg.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    padding: "10px 20px",
    borderRadius: "8px",
    backgroundColor:
      type === "success" ? "#4caf50" :
      type === "error" ? "#f44336" : "#2196f3",
    color: "white",
    zIndex: 1000,
  });
  document.body.appendChild(msg);
  setTimeout(() => msg.remove(), duration);
}

/**
 * Muestra u oculta un elemento.
 * @param {HTMLElement|string} element - Elemento o ID del elemento.
 * @param {boolean} visible - true para mostrar, false para ocultar.
 */
export function toggleVisibility(element, visible) {
  const el = typeof element === "string" ? document.getElementById(element) : element;
  if (!el) return;
  el.style.display = visible ? "" : "none";
}

/**
 * Reemplaza el contenido de un elemento con una lista (por ejemplo, <ul> o <tbody>).
 * @param {HTMLElement|string} container - Elemento o ID del contenedor.
 * @param {Array} items - Elementos de la lista (strings o nodos HTML).
 * @param {Function} renderItem - Función que recibe cada item y devuelve un string o nodo.
 */
export function renderList(container, items, renderItem) {
  const el = typeof container === "string" ? document.getElementById(container) : container;
  if (!el) return;
  clearElement(el);
  items.forEach(item => {
    const rendered = renderItem(item);
    el.appendChild(typeof rendered === "string" ? htmlToElement(rendered) : rendered);
  });
}

/**
 * Convierte un string HTML en un nodo DOM real.
 * @param {string} html - Código HTML.
 * @returns {HTMLElement}
 */
export function htmlToElement(html) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstChild;
}
