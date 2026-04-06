const FEEDBACK_HOST_ID = "appShellFeedbackHost";
const FEEDBACK_ID = "appShellFeedback";
const DIALOG_BACKDROP_ID = "appShellDialogBackdrop";

function getDashboardContainer() {
  return document.querySelector(".dashboard-content") || document.body;
}

function ensureFeedbackHost() {
  let host = document.getElementById(FEEDBACK_HOST_ID);
  if (host) return host;

  host = document.createElement("div");
  host.id = FEEDBACK_HOST_ID;
  host.className = "app-shell-feedback-host";

  const feedback = document.createElement("div");
  feedback.id = FEEDBACK_ID;
  feedback.className = "app-shell-feedback";
  feedback.setAttribute("role", "status");
  feedback.setAttribute("aria-live", "polite");
  feedback.setAttribute("aria-atomic", "true");
  feedback.hidden = true;

  host.appendChild(feedback);

  const container = getDashboardContainer();
  container.insertBefore(host, container.firstChild || null);
  return host;
}

let feedbackTimerId = null;

export function clearAppFeedback() {
  const feedback = document.getElementById(FEEDBACK_ID);
  if (!feedback) return;

  if (feedbackTimerId) {
    window.clearTimeout(feedbackTimerId);
    feedbackTimerId = null;
  }

  feedback.hidden = true;
  feedback.className = "app-shell-feedback";
  feedback.innerHTML = "";
}

export function showAppFeedback(message, {
  type = "info",
  title = "",
  timeout = type === "error" ? 8000 : 5000
} = {}) {
  if (!message) {
    clearAppFeedback();
    return;
  }

  ensureFeedbackHost();
  const feedback = document.getElementById(FEEDBACK_ID);
  if (!feedback) return;

  if (feedbackTimerId) {
    window.clearTimeout(feedbackTimerId);
    feedbackTimerId = null;
  }

  const safeTitle = title ? `<strong>${escapeHtml(title)}</strong>` : "";
  const safeMessage = `<span>${escapeHtml(message)}</span>`;
  feedback.className = `app-shell-feedback is-visible is-${type}`;
  feedback.setAttribute("role", type === "error" ? "alert" : "status");
  feedback.setAttribute("aria-live", type === "error" ? "assertive" : "polite");
  feedback.innerHTML = `
    <div class="app-shell-feedback__content">
      ${safeTitle}
      ${safeMessage}
    </div>
    <button type="button" class="app-shell-feedback__dismiss" aria-label="Cerrar mensaje">
      <span aria-hidden="true">&times;</span>
    </button>
  `;
  feedback.hidden = false;

  feedback.querySelector(".app-shell-feedback__dismiss")?.addEventListener("click", clearAppFeedback, { once: true });

  if (timeout > 0) {
    feedbackTimerId = window.setTimeout(() => {
      clearAppFeedback();
    }, timeout);
  }
}

function ensureDialogBackdrop() {
  let backdrop = document.getElementById(DIALOG_BACKDROP_ID);
  if (backdrop) return backdrop;

  backdrop = document.createElement("div");
  backdrop.id = DIALOG_BACKDROP_ID;
  backdrop.className = "app-shell-dialog-backdrop";
  backdrop.hidden = true;
  backdrop.innerHTML = `
    <div class="app-shell-dialog" role="dialog" aria-modal="true" aria-labelledby="appShellDialogTitle" aria-describedby="appShellDialogDescription" tabindex="-1">
      <div class="app-shell-dialog__header">
        <h3 id="appShellDialogTitle" class="app-shell-dialog__title"></h3>
      </div>
      <p id="appShellDialogDescription" class="app-shell-dialog__description"></p>
      <div class="app-shell-dialog__actions">
        <button type="button" class="btn btn-secondary" data-dialog-action="cancel"></button>
        <button type="button" class="btn btn-primary" data-dialog-action="confirm"></button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
  return backdrop;
}

export function confirmAppAction({
  title,
  message,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  tone = "danger"
}) {
  const backdrop = ensureDialogBackdrop();
  const dialog = backdrop.querySelector(".app-shell-dialog");
  const titleElement = backdrop.querySelector("#appShellDialogTitle");
  const descriptionElement = backdrop.querySelector("#appShellDialogDescription");
  const cancelButton = backdrop.querySelector('[data-dialog-action="cancel"]');
  const confirmButton = backdrop.querySelector('[data-dialog-action="confirm"]');
  const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  titleElement.textContent = title || "Confirmar accion";
  descriptionElement.textContent = message || "";
  cancelButton.textContent = cancelLabel;
  confirmButton.textContent = confirmLabel;
  confirmButton.classList.toggle("is-danger", tone === "danger");
  backdrop.hidden = false;
  document.body.classList.add("app-shell-dialog-open");

  return new Promise((resolve) => {
    const close = (result) => {
      backdrop.hidden = true;
      document.body.classList.remove("app-shell-dialog-open");
      backdrop.removeEventListener("click", handleBackdropClick);
      document.removeEventListener("keydown", handleKeyDown);
      cancelButton.removeEventListener("click", handleCancel);
      confirmButton.removeEventListener("click", handleConfirm);
      previouslyFocused?.focus?.();
      resolve(result);
    };

    const handleBackdropClick = (event) => {
      if (event.target === backdrop) close(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
      }
    };

    const handleCancel = () => close(false);
    const handleConfirm = () => close(true);

    backdrop.addEventListener("click", handleBackdropClick);
    document.addEventListener("keydown", handleKeyDown);
    cancelButton.addEventListener("click", handleCancel);
    confirmButton.addEventListener("click", handleConfirm);

    window.requestAnimationFrame(() => {
      confirmButton.focus();
      dialog.scrollTop = 0;
    });
  });
}

export function setActiveNavItems(navItems, activeSection) {
  navItems.forEach((item) => {
    const isActive = item.dataset.section === activeSection;
    item.classList.toggle("active", isActive);
    if (isActive) {
      item.setAttribute("aria-current", "page");
    } else {
      item.removeAttribute("aria-current");
    }
  });
}

export function syncMenuExpandedState(button, expanded) {
  if (!button) return;
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", expanded ? "true" : "false");
}

export function decorateDialog(dialogElement, {
  titleId,
  descriptionId
} = {}) {
  if (!(dialogElement instanceof HTMLElement)) return;
  dialogElement.setAttribute("role", "dialog");
  dialogElement.setAttribute("aria-modal", "true");
  if (titleId) dialogElement.setAttribute("aria-labelledby", titleId);
  if (descriptionId) dialogElement.setAttribute("aria-describedby", descriptionId);
  dialogElement.setAttribute("aria-hidden", dialogElement.classList.contains("hidden") ? "true" : "false");
}

export function syncDialogVisibility(dialogElement, hiddenClass = "hidden") {
  if (!(dialogElement instanceof HTMLElement)) return;
  dialogElement.setAttribute("aria-hidden", dialogElement.classList.contains(hiddenClass) ? "true" : "false");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
