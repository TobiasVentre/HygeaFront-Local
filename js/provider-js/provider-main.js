import { FrontGateway } from "../api.js";
import {
  formatArgentinaDate,
  formatArgentinaDateTime,
  formatArgentinaTime
} from "../utils/argentina-time.js";
import {
  clearAppFeedback,
  setActiveNavItems,
  showAppFeedback,
  syncMenuExpandedState
} from "../utils/app-shell-ui.js";
import { ensureAuthorizedPage, isAuthRedirectError } from "../utils/session-guard.js";

const ORDER_STATUS_LABELS = {
  Created: "Creada",
  Approved: "Aprobada",
  Confirmed: "Confirmada",
  InProgress: "En ejecucion",
  Finalized: "Finalizada",
  Exception: "Excepcion",
  Closed: "Cerrada",
  1: "Creada",
  2: "Confirmada",
  3: "En ejecucion",
  4: "Finalizada",
  5: "Excepcion",
  6: "Cerrada",
  7: "Aprobada"
};

const ORDER_STATUS_VALUES = {
  Created: 1,
  Confirmed: 2,
  InProgress: 3,
  Finalized: 4,
  Exception: 5,
  Closed: 6,
  Approved: 7
};

const EVIDENCE_KIND_LABELS = {
  Photo: "Foto",
  DigitalCheck: "Check digital",
  1: "Foto",
  2: "Check digital"
};

const CANCELLATION_REASON_LABELS = {
  LackOfSupplies: "Falta de insumos",
  AdverseWeather: "Condiciones climaticas adversas",
  1: "Falta de insumos",
  2: "Condiciones climaticas adversas"
};

const REQUEST_STATUS_LABELS = {
  Pending: "Pendiente",
  Approved: "Aprobada",
  Rejected: "Rechazada",
  1: "Pendiente",
  2: "Aprobada",
  3: "Rechazada"
};

const ACTIVE_TECHNICIAN_STATUS_VALUES = new Set([1, "1", "active", "Active"]);
const TECHNICIAN_STATUS_VALUES = {
  Active: 1,
  Restricted: 2,
  Inactive: 3
};

const TECHNICIAN_STATUS_LABELS = {
  Active: "Activo",
  Restricted: "Restringido",
  Inactive: "Inactivo",
  1: "Activo",
  2: "Restringido",
  3: "Inactivo"
};

const state = {
  user: null,
  providerAdminProfile: null,
  providerEntity: null,
  orders: [],
  technicians: [],
  techniciansById: new Map(),
  clientProfilesById: new Map(),
  pendingCancellationRequests: [],
  pendingProviderChangeRequests: [],
  currentOrderDetail: null,
  currentOrderHistory: [],
  currentOrderEvidence: [],
  currentOrderCancellationRequests: [],
  currentOrderEvidencePreviewUrls: new Map()
};
let isProviderBootstrapComplete = false;

function isGuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function getClaim(payload, keys) {
  for (const key of keys) {
    const value = payload?.[key];
    if (Array.isArray(value) && value.length > 0) return value[0];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
}

function getAuthUserIdFromToken() {
  const token = localStorage.getItem("token");
  if (!token) return null;

  const payload = parseJwt(token);
  const claim = getClaim(payload, [
    "sub",
    "userId",
    "UserId",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"
  ]);

  return isGuid(claim) ? claim : null;
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

function getUserDisplayName() {
  const user = state.user || getStoredUser();
  const fullName = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
  return fullName || user?.email || "Panel proveedor";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0
  }).format(Number(amount || 0));
}

function formatDateTime(value) {
  return formatArgentinaDateTime(value, {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function formatFileSize(bytes) {
  const size = Number(bytes ?? 0);
  if (!Number.isFinite(size) || size <= 0) return "Sin archivo";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimeRange(startAtUtc, endAtUtc) {
  return `${formatArgentinaTime(startAtUtc)} a ${formatArgentinaTime(endAtUtc)}`;
}

function getStatusLabel(status) {
  return ORDER_STATUS_LABELS[status] || String(status || "Sin estado");
}

function getStatusValue(status) {
  if (typeof status === "number") return status;
  return ORDER_STATUS_VALUES[status] || null;
}

function requiresProviderDecision(statusValue) {
  return statusValue === ORDER_STATUS_VALUES.Created || statusValue === ORDER_STATUS_VALUES.Approved;
}

function isActiveOrderStatus(statusValue) {
  return statusValue === ORDER_STATUS_VALUES.Created
    || statusValue === ORDER_STATUS_VALUES.Approved
    || statusValue === ORDER_STATUS_VALUES.Confirmed
    || statusValue === ORDER_STATUS_VALUES.InProgress;
}

function canDownloadReceiptForStatus(statusValue) {
  return statusValue === ORDER_STATUS_VALUES.Finalized || statusValue === ORDER_STATUS_VALUES.Closed;
}

function getTechnicianStatusValue(status) {
  if (typeof status === "number") return status;
  return TECHNICIAN_STATUS_VALUES[status] || null;
}

function getTechnicianStatusLabel(status) {
  return TECHNICIAN_STATUS_LABELS[status] || String(status || "Sin estado");
}

function getTechnicianStatusBadgeClass(status) {
  const value = getTechnicianStatusValue(status);
  if (value === TECHNICIAN_STATUS_VALUES.Active) return "is-active";
  if (value === TECHNICIAN_STATUS_VALUES.Restricted) return "is-restricted";
  return "is-inactive";
}

function getCancellationReasonLabel(reason) {
  return CANCELLATION_REASON_LABELS[reason] || String(reason || "Sin motivo");
}

function getRequestStatusLabel(status) {
  return REQUEST_STATUS_LABELS[status] || String(status || "Sin estado");
}

function normalizeOrder(rawOrder) {
  const items = rawOrder.items ?? rawOrder.Items ?? [];

  return {
    id: rawOrder.id ?? rawOrder.Id,
    reservationId: rawOrder.reservationId ?? rawOrder.ReservationId ?? null,
    clientId: rawOrder.clientId ?? rawOrder.ClientId,
    providerEntityId: rawOrder.providerEntityId ?? rawOrder.ProviderEntityId,
    technicianId: rawOrder.technicianId ?? rawOrder.TechnicianId,
    scheduledStartAtUtc: rawOrder.scheduledStartAtUtc ?? rawOrder.ScheduledStartAtUtc,
    scheduledEndAtUtc: rawOrder.scheduledEndAtUtc ?? rawOrder.ScheduledEndAtUtc,
    totalAmount: rawOrder.totalAmount ?? rawOrder.TotalAmount ?? 0,
    status: rawOrder.status ?? rawOrder.Status,
    exceptionReason: rawOrder.exceptionReason ?? rawOrder.ExceptionReason ?? null,
    createdAtUtc: rawOrder.createdAtUtc ?? rawOrder.CreatedAtUtc,
    items: Array.isArray(items)
      ? items.map((item) => ({
          id: item.id ?? item.Id,
          serviceId: item.serviceId ?? item.ServiceId,
          serviceName: item.serviceName ?? item.ServiceName,
          unitPrice: item.unitPrice ?? item.UnitPrice ?? 0,
          quantity: item.quantity ?? item.Quantity ?? 0,
          totalPrice: item.totalPrice ?? item.TotalPrice ?? 0
        }))
      : []
  };
}

function normalizeHistoryEntry(entry) {
  return {
    id: entry.id ?? entry.Id,
    previousStatus: entry.previousStatus ?? entry.PreviousStatus,
    newStatus: entry.newStatus ?? entry.NewStatus,
    changedAtUtc: entry.changedAtUtc ?? entry.ChangedAtUtc,
    changedByUserId: entry.changedByUserId ?? entry.ChangedByUserId ?? null,
    note: entry.note ?? entry.Note ?? null
  };
}

function normalizeEvidenceEntry(entry) {
  return {
    id: entry.id ?? entry.Id,
    serviceOrderId: entry.serviceOrderId ?? entry.ServiceOrderId,
    kind: entry.kind ?? entry.Kind,
    fileName: entry.fileName ?? entry.FileName ?? null,
    contentType: entry.contentType ?? entry.ContentType ?? null,
    fileSizeBytes: entry.fileSizeBytes ?? entry.FileSizeBytes ?? null,
    note: entry.note ?? entry.Note ?? null,
    recordedByUserId: entry.recordedByUserId ?? entry.RecordedByUserId ?? null,
    recordedAtUtc: entry.recordedAtUtc ?? entry.RecordedAtUtc,
    hasBinaryContent: entry.hasBinaryContent ?? entry.HasBinaryContent ?? false
  };
}

function normalizeCancellationRequest(entry) {
  return {
    id: entry.id ?? entry.Id,
    serviceOrderId: entry.serviceOrderId ?? entry.ServiceOrderId,
    technicianId: entry.technicianId ?? entry.TechnicianId,
    reason: entry.reason ?? entry.Reason,
    note: entry.note ?? entry.Note ?? null,
    status: entry.status ?? entry.Status,
    requestedByUserId: entry.requestedByUserId ?? entry.RequestedByUserId ?? null,
    requestedAtUtc: entry.requestedAtUtc ?? entry.RequestedAtUtc,
    reviewedByUserId: entry.reviewedByUserId ?? entry.ReviewedByUserId ?? null,
    resolutionNote: entry.resolutionNote ?? entry.ResolutionNote ?? null,
    reviewedAtUtc: entry.reviewedAtUtc ?? entry.ReviewedAtUtc ?? null
  };
}

function normalizeProviderChangeRequest(entry) {
  return {
    id: entry.id ?? entry.Id,
    technicianProfileId: entry.technicianProfileId ?? entry.TechnicianProfileId,
    currentProviderEntityId: entry.currentProviderEntityId ?? entry.CurrentProviderEntityId,
    requestedProviderEntityId: entry.requestedProviderEntityId ?? entry.RequestedProviderEntityId,
    status: entry.status ?? entry.Status,
    requestedByAuthUserId: entry.requestedByAuthUserId ?? entry.RequestedByAuthUserId ?? null,
    note: entry.note ?? entry.Note ?? null,
    requestedAtUtc: entry.requestedAtUtc ?? entry.RequestedAtUtc,
    reviewedByUserId: entry.reviewedByUserId ?? entry.ReviewedByUserId ?? null,
    resolutionNote: entry.resolutionNote ?? entry.ResolutionNote ?? null,
    reviewedAtUtc: entry.reviewedAtUtc ?? entry.ReviewedAtUtc ?? null
  };
}

function normalizeTechnicianProfile(profile) {
  return {
    id: profile.id ?? profile.Id,
    authUserId: profile.authUserId ?? profile.AuthUserId,
    providerEntityId: profile.providerEntityId ?? profile.ProviderEntityId,
    specialty: profile.specialty ?? profile.Specialty ?? "Sin especialidad",
    status: profile.status ?? profile.Status,
    createdAtUtc: profile.createdAtUtc ?? profile.CreatedAtUtc,
    updatedAtUtc: profile.updatedAtUtc ?? profile.UpdatedAtUtc
  };
}

function normalizeClientProfile(profile) {
  return {
    id: profile.id ?? profile.Id,
    authUserId: profile.authUserId ?? profile.AuthUserId,
    providerEntityId: profile.providerEntityId ?? profile.ProviderEntityId,
    fullName: profile.fullName ?? profile.FullName ?? "Cliente sin nombre",
    createdAtUtc: profile.createdAtUtc ?? profile.CreatedAtUtc,
    updatedAtUtc: profile.updatedAtUtc ?? profile.UpdatedAtUtc
  };
}

function getTechnicianInfo(technicianId) {
  return state.techniciansById.get(technicianId) || null;
}

function getClientInfo(clientId) {
  return state.clientProfilesById.get(clientId) || null;
}

function getClientDisplayName(clientId) {
  return getClientInfo(clientId)?.fullName || `Cliente ${String(clientId || "").slice(0, 8)}`;
}

function getEvidenceKindLabel(kind) {
  return EVIDENCE_KIND_LABELS[kind] || String(kind || "Evidencia");
}

function isImageEvidence(evidence) {
  return Boolean(evidence?.hasBinaryContent && /^image\//i.test(String(evidence?.contentType || "")));
}

function downloadBlob(blob, fileName) {
  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName || `evidencia-${Date.now()}`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(objectUrl);
}

function clearEvidencePreviewUrls() {
  state.currentOrderEvidencePreviewUrls.forEach((previewUrl) => {
    try {
      window.URL.revokeObjectURL(previewUrl);
    } catch {
    }
  });
  state.currentOrderEvidencePreviewUrls.clear();
}

function updateEvidencePreviewElements() {
  document.querySelectorAll("[data-provider-evidence-preview-id]").forEach((element) => {
    const evidenceId = element.dataset.providerEvidencePreviewId;
    const previewUrl = state.currentOrderEvidencePreviewUrls.get(evidenceId);
    if (!previewUrl) return;

    element.classList.remove("is-loading");
    element.innerHTML = `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(element.dataset.providerEvidencePreviewAlt || "Vista previa de evidencia")}">`;
  });
}

async function ensureEvidencePreviews(orderId) {
  const previewableItems = state.currentOrderEvidence.filter((entry) => isImageEvidence(entry) && !state.currentOrderEvidencePreviewUrls.has(entry.id));
  if (!previewableItems.length) return;

  const results = await Promise.allSettled(
    previewableItems.map(async (entry) => {
      const fileResult = await FrontGateway.order.downloadEvidenceFile(orderId, entry.id);
      return {
        evidenceId: entry.id,
        previewUrl: window.URL.createObjectURL(fileResult.blob)
      };
    })
  );

  if (state.currentOrderDetail?.id !== orderId) {
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        try {
          window.URL.revokeObjectURL(result.value.previewUrl);
        } catch {
        }
      }
    });
    return;
  }

  let updated = false;
  results.forEach((result) => {
    if (result.status !== "fulfilled") return;
    state.currentOrderEvidencePreviewUrls.set(result.value.evidenceId, result.value.previewUrl);
    updated = true;
  });

  if (updated) {
    updateEvidencePreviewElements();
  }
}

function parseProviderRoute() {
  const rawHash = window.location.hash.replace(/^#/, "").trim();
  if (!rawHash) {
    return { section: "inicio", orderId: null };
  }

  const [section, maybeOrderId] = rawHash.split("/");
  if (section === "ordenes" && isGuid(maybeOrderId)) {
    return { section: "ordenes", orderId: maybeOrderId };
  }

  return {
    section: ["inicio", "ordenes", "tecnicos", "perfil"].includes(section) ? section : "inicio",
    orderId: null
  };
}

function buildProviderRouteHash(route) {
  if (route.section === "ordenes" && isGuid(route.orderId)) {
    return `#ordenes/${route.orderId}`;
  }

  return `#${route.section || "inicio"}`;
}

function updateProviderRoute(route, { replace = false } = {}) {
  const hash = buildProviderRouteHash(route);
  if (window.location.hash === hash) return;

  if (replace) {
    window.history.replaceState(null, "", hash);
    return;
  }

  window.location.hash = hash;
}

function getErrorMessage(error, fallbackMessage) {
  if (!error) return fallbackMessage;
  if (typeof error.message === "string" && error.message.trim() !== "") return error.message;
  if (typeof error.body === "string" && error.body.trim() !== "") return error.body;
  return fallbackMessage;
}

function showListError(containerId, message) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div class="request-empty-text">
      ${escapeHtml(message)}
    </div>
  `;
}

function setTechnicianFeedback(message, type = "") {
  const feedback = document.getElementById("providerTechnicianFeedback");
  if (!feedback) return;

  feedback.textContent = message;
  feedback.classList.remove("is-success", "is-error");

  if (type === "success") feedback.classList.add("is-success");
  if (type === "error") feedback.classList.add("is-error");
}

function resetTechnicianForm() {
  document.getElementById("providerTechnicianForm")?.reset();
}

function getAssignableTechnicians(order) {
  return state.technicians.filter((technician) => {
    return getTechnicianStatusValue(technician.status) === TECHNICIAN_STATUS_VALUES.Active
      && technician.id !== order.technicianId;
  });
}

function setActiveSidebar(section) {
  setActiveNavItems(Array.from(document.querySelectorAll(".sidebar-nav .nav-item")), section);
}

function setSection(section) {
  document.getElementById("providerDashboardSection")?.classList.toggle("hidden", section !== "inicio");
  document.getElementById("providerOrdersSection")?.classList.toggle("hidden", section !== "ordenes");
  document.getElementById("providerTechniciansSection")?.classList.toggle("hidden", section !== "tecnicos");
  document.getElementById("providerProfileSection")?.classList.toggle("hidden", section !== "perfil");

  if (section === "ordenes") {
    const route = parseProviderRoute();
    setProviderOrdersMode(isGuid(route.orderId) ? "detail" : "list");
  }

  setActiveSidebar(section);
}

function setProviderOrdersMode(mode = "list") {
  document.getElementById("providerOrdersOverview")?.classList.toggle("hidden", mode !== "list");
  document.getElementById("providerOrderDetailView")?.classList.toggle("hidden", mode !== "detail");
}

async function handleProviderRouteChange() {
  if (!isProviderBootstrapComplete) return;

  const route = parseProviderRoute();
  if (route.section === "ordenes" && isGuid(route.orderId)) {
    if (!state.currentOrderDetail || state.currentOrderDetail.id !== route.orderId) {
      try {
        await openOrderDetail(route.orderId, { updateRoute: false });
      } catch (error) {
        console.error("No se pudo navegar al detalle de la orden del proveedor.", error);
        updateProviderRoute({ section: "ordenes" }, { replace: true });
        setSection("ordenes");
      }
      return;
    }

    setProviderOrdersMode("detail");
    setSection("ordenes");
    return;
  }

  setSection(route.section);
}

function setWelcomeMessage() {
  const welcomeName = document.getElementById("welcome-name");
  const welcomeMessage = document.getElementById("welcome-message");
  const providerName = state.providerEntity?.name ?? state.providerEntity?.Name ?? "tu entidad";

  if (welcomeName) welcomeName.textContent = "Operacion diaria de la entidad";
  if (welcomeMessage) welcomeMessage.textContent = `${providerName}: aprueba, confirma y reasigna ordenes sin salir del flujo operativo.`;
}

function setupUserMenu() {
  const userBtn = document.getElementById("userBtn");
  const userDropdown = document.getElementById("userDropdown");
  const userMenu = document.getElementById("userMenu");
  const userMenuName = document.getElementById("userMenuName");
  const logoutBtn = document.getElementById("logoutBtn");

  if (userMenuName) userMenuName.textContent = getUserDisplayName();

  if (userBtn && userDropdown && userMenu) {
    syncMenuExpandedState(userBtn, false);
    userBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = userDropdown.style.display === "block";
      userDropdown.style.display = isOpen ? "none" : "block";
      userMenu.classList.toggle("active", !isOpen);
      syncMenuExpandedState(userBtn, !isOpen);
    });

    document.addEventListener("click", (event) => {
      if (!userMenu.contains(event.target)) {
        userDropdown.style.display = "none";
        userMenu.classList.remove("active");
        syncMenuExpandedState(userBtn, false);
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", (event) => {
      event.preventDefault();
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
      window.location.href = "login.html";
    });
  }
}

function renderSummaryCards() {
  const pendingOrders = state.orders.filter((order) => requiresProviderDecision(getStatusValue(order.status))).length;
  const activeOrders = state.orders.filter((order) => {
    return isActiveOrderStatus(getStatusValue(order.status));
  }).length;
  const activeTechnicians = state.technicians.filter((technician) => getTechnicianStatusValue(technician.status) === TECHNICIAN_STATUS_VALUES.Active).length;
  const todayKey = formatArgentinaDate(new Date(), { year: "numeric", month: "2-digit", day: "2-digit" });
  const todayOrders = state.orders.filter((order) => formatArgentinaDate(order.scheduledStartAtUtc, { year: "numeric", month: "2-digit", day: "2-digit" }) === todayKey).length;

  const setNumber = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
  };

  setNumber("providerPendingOrders", pendingOrders);
  setNumber("providerActiveOrders", activeOrders);
  setNumber("providerActiveTechnicians", activeTechnicians);
  setNumber("providerTodayOrders", todayOrders);
}

function renderOrdersInto(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!state.orders.length) {
    container.innerHTML = '<p class="request-empty-text">Todavia no hay ordenes registradas para esta entidad.</p>';
    return;
  }

  container.innerHTML = state.orders.map((order) => {
    const technician = getTechnicianInfo(order.technicianId);
    const clientName = getClientDisplayName(order.clientId);
    const technicianName = technician?.publicProfile?.fullName
      || technician?.publicProfile?.FullName
      || technician?.specialty
      || "Tecnico asignado";
    const itemSummary = order.items.map((item) => `${escapeHtml(item.serviceName)} x${item.quantity}`).join(", ");

    return `
      <article class="appointment-item">
        <div class="appointment-item__header">
          <div>
            <h4>Orden ${escapeHtml(order.id.slice(0, 8))}</h4>
            <p>${escapeHtml(formatArgentinaDate(order.scheduledStartAtUtc, { weekday: "long", day: "2-digit", month: "long" }))} - ${escapeHtml(formatTimeRange(order.scheduledStartAtUtc, order.scheduledEndAtUtc))}</p>
          </div>
          <span class="provider-status-badge">${escapeHtml(getStatusLabel(order.status))}</span>
        </div>
        <div class="provider-detail-grid">
          <div class="provider-inline-note"><strong>Tecnico:</strong> ${escapeHtml(technicianName)}</div>
          <div class="provider-inline-note"><strong>Cliente:</strong> ${escapeHtml(clientName)}</div>
          <div class="provider-inline-note"><strong>Servicios:</strong> ${itemSummary || "Sin items"}</div>
          <div class="provider-inline-note"><strong>Total:</strong> ${escapeHtml(formatCurrency(order.totalAmount))}</div>
        </div>
        <div class="appointment-actions">
          <button class="btn btn-secondary provider-open-order" data-order-id="${escapeHtml(order.id)}">
            <i class="fas fa-eye"></i>
            Ver detalle
          </button>
        </div>
      </article>
    `;
  }).join("");

  container.querySelectorAll(".provider-open-order").forEach((button) => {
    button.addEventListener("click", () => {
      openOrderDetail(button.dataset.orderId).catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudo abrir el detalle de la orden."), {
          type: "error",
          title: "No pudimos abrir la orden"
        });
      });
    });
  });
}

function renderTechnicians() {
  const container = document.getElementById("providerTechniciansList");
  if (!container) return;

  if (!state.technicians.length) {
    container.innerHTML = '<p class="request-empty-text">No hay tecnicos registrados para esta entidad.</p>';
    return;
  }

  container.innerHTML = state.technicians.map((technician) => {
    const publicProfile = technician.publicProfile;
    const fullName = publicProfile?.fullName || publicProfile?.FullName || `Tecnico ${technician.id.slice(0, 8)}`;
    const statusValue = getTechnicianStatusValue(technician.status);
    const canActivate = statusValue !== TECHNICIAN_STATUS_VALUES.Active;
    const canRestrict = statusValue === TECHNICIAN_STATUS_VALUES.Active;
    const canInactivate = statusValue !== TECHNICIAN_STATUS_VALUES.Inactive;
    return `
      <article class="request-panel-card provider-technician-card">
        <div class="request-panel-head">
          <div>
            <h4>${escapeHtml(fullName)}</h4>
            <p>${escapeHtml(technician.specialty)}</p>
          </div>
          <span class="provider-status-badge ${getTechnicianStatusBadgeClass(technician.status)}">${escapeHtml(getTechnicianStatusLabel(technician.status))}</span>
        </div>
        <div class="provider-meta-list">
          <div class="provider-meta-item">
            <strong>Especialidad</strong>
            <span>${escapeHtml(technician.specialty)}</span>
          </div>
          <div class="provider-meta-item">
            <strong>Alta en la entidad</strong>
            <span>${escapeHtml(technician.createdAtUtc ? formatDateTime(technician.createdAtUtc) : "-")}</span>
          </div>
          <div class="provider-meta-item">
            <strong>Ultima actualizacion</strong>
            <span>${escapeHtml(technician.updatedAtUtc ? formatDateTime(technician.updatedAtUtc) : "-")}</span>
          </div>
        </div>
        <div class="provider-technician-actions">
          ${canActivate ? `
            <button class="btn btn-secondary provider-technician-status-btn" data-technician-id="${escapeHtml(technician.id)}" data-status="${TECHNICIAN_STATUS_VALUES.Active}">
              <i class="fas fa-check-circle"></i>
              Activar
            </button>` : ""}
          ${canRestrict ? `
            <button class="btn btn-secondary provider-technician-status-btn" data-technician-id="${escapeHtml(technician.id)}" data-status="${TECHNICIAN_STATUS_VALUES.Restricted}">
              <i class="fas fa-user-lock"></i>
              Restringir
            </button>` : ""}
          ${canInactivate ? `
            <button class="btn btn-secondary provider-technician-status-btn" data-technician-id="${escapeHtml(technician.id)}" data-status="${TECHNICIAN_STATUS_VALUES.Inactive}">
              <i class="fas fa-user-slash"></i>
              Inactivar
            </button>` : ""}
        </div>
      </article>
    `;
  }).join("");

  container.querySelectorAll(".provider-technician-status-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const technicianId = button.dataset.technicianId ?? "";
      const status = Number(button.dataset.status);

      if (!isGuid(technicianId) || !status) {
        setTechnicianFeedback("No se pudo resolver el tecnico o el estado solicitado.", "error");
        return;
      }

      updateTechnicianStatus(technicianId, status).catch((error) => {
        setTechnicianFeedback(getErrorMessage(error, "No se pudo actualizar el estado del tecnico."), "error");
      });
    });
  });
}

function renderProviderChangeRequests() {
  const container = document.getElementById("providerTechnicianChangeRequests");
  if (!container) return;

  if (!state.pendingProviderChangeRequests.length) {
    container.innerHTML = '<p class="request-empty-text">No hay solicitudes de cambio de entidad para revisar.</p>';
    return;
  }

  container.innerHTML = state.pendingProviderChangeRequests.map((request) => {
    const technician = state.techniciansById.get(request.technicianProfileId);
    const publicProfile = technician?.publicProfile;
    const fullName = publicProfile?.fullName || publicProfile?.FullName || `Tecnico ${request.technicianProfileId.slice(0, 8)}`;

    return `
      <article class="request-panel-card provider-request-card">
        <div class="request-panel-head">
          <div>
            <h4>${escapeHtml(fullName)}</h4>
            <p>${escapeHtml(technician?.specialty || "Sin especialidad")} · Solicitada ${escapeHtml(formatDateTime(request.requestedAtUtc))}</p>
          </div>
          <span class="provider-status-badge">${escapeHtml(getRequestStatusLabel(request.status))}</span>
        </div>
        <div class="provider-meta-list">
          <div class="provider-meta-item">
            <strong>Entidad actual</strong>
            <span>${escapeHtml(String(request.currentProviderEntityId).slice(0, 8))}</span>
          </div>
          <div class="provider-meta-item">
            <strong>Nota</strong>
            <span>${escapeHtml(request.note || "-")}</span>
          </div>
        </div>
        <div class="provider-order-actions">
          <span class="provider-inline-note">Seguimiento solamente. La resolucion final la realiza Administracion Global desde su panel.</span>
        </div>
      </article>
    `;
  }).join("");
}

function renderPendingCancellationRequests() {
  const container = document.getElementById("providerPendingCancellationRequests");
  if (!container) return;

  if (!state.pendingCancellationRequests.length) {
    container.innerHTML = '<p class="request-empty-text">No hay cancelaciones justificadas pendientes.</p>';
    return;
  }

  container.innerHTML = state.pendingCancellationRequests.map((request) => {
    const order = state.orders.find((entry) => entry.id === request.serviceOrderId);
    const technician = order ? getTechnicianInfo(order.technicianId) : null;
    const technicianName = technician?.publicProfile?.fullName || technician?.publicProfile?.FullName || "Tecnico asignado";

    return `
      <article class="appointment-item">
        <div class="appointment-item__header">
          <div>
            <h4>Orden ${escapeHtml(request.serviceOrderId.slice(0, 8))}</h4>
            <p>${escapeHtml(technicianName)} · ${escapeHtml(getCancellationReasonLabel(request.reason))}</p>
          </div>
          <span class="provider-status-badge">${escapeHtml(getRequestStatusLabel(request.status))}</span>
        </div>
        <div class="provider-detail-grid">
          <div class="provider-inline-note"><strong>Solicitada:</strong> ${escapeHtml(formatDateTime(request.requestedAtUtc))}</div>
          <div class="provider-inline-note"><strong>Nota:</strong> ${escapeHtml(request.note || "-")}</div>
        </div>
        <div class="appointment-actions">
          <button class="btn btn-secondary provider-open-order" data-order-id="${escapeHtml(request.serviceOrderId)}">
            <i class="fas fa-eye"></i>
            Revisar orden
          </button>
        </div>
      </article>
    `;
  }).join("");

  container.querySelectorAll(".provider-open-order").forEach((button) => {
    button.addEventListener("click", () => {
      openOrderDetail(button.dataset.orderId).catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudo abrir el detalle de la orden."), {
          type: "error",
          title: "No pudimos abrir la orden"
        });
      });
    });
  });
}

function renderProfile() {
  const providerCard = document.getElementById("providerProfileCard");
  const adminCard = document.getElementById("providerAdminCard");
  const providerIsEnabled = state.providerEntity?.isEnabled ?? state.providerEntity?.IsEnabled ?? false;

  if (providerCard) {
    providerCard.innerHTML = `
      <div class="provider-meta-list">
        <div class="provider-meta-item">
          <strong>Nombre</strong>
          <span>${escapeHtml(state.providerEntity?.name ?? state.providerEntity?.Name ?? "Sin nombre")}</span>
        </div>
        <div class="provider-meta-item">
          <strong>Estado</strong>
          <span>${providerIsEnabled ? "Habilitado" : "Deshabilitado"}</span>
        </div>
        <div class="provider-meta-item">
          <strong>Staff tecnico</strong>
          <span>${escapeHtml(String(state.technicians.length))} tecnico(s)</span>
        </div>
        <div class="provider-meta-item">
          <strong>Ordenes activas</strong>
          <span>${escapeHtml(String(state.orders.filter((order) => {
            return isActiveOrderStatus(getStatusValue(order.status));
          }).length))}</span>
        </div>
      </div>
    `;
  }

  if (adminCard) {
    adminCard.innerHTML = `
      <div class="provider-meta-list">
        <div class="provider-meta-item">
          <strong>Nombre</strong>
          <span>${escapeHtml(state.providerAdminProfile?.fullName ?? getUserDisplayName())}</span>
        </div>
        <div class="provider-meta-item">
          <strong>Email</strong>
          <span>${escapeHtml(state.user?.email ?? "-")}</span>
        </div>
        <div class="provider-meta-item">
          <strong>Alta en el panel</strong>
          <span>${escapeHtml(state.providerAdminProfile?.createdAtUtc ? formatDateTime(state.providerAdminProfile.createdAtUtc) : "-")}</span>
        </div>
      </div>
    `;
  }
}

function renderOrderDetail() {
  const hero = document.getElementById("providerOrderDetailHero");
  const itemsContainer = document.getElementById("providerOrderDetailItems");
  const historyContainer = document.getElementById("providerOrderDetailHistory");
  const evidenceContainer = document.getElementById("providerOrderDetailEvidence");
  const cancellationContainer = document.getElementById("providerOrderCancellationRequests");
  const order = state.currentOrderDetail;

  if (!hero || !itemsContainer || !historyContainer || !evidenceContainer || !cancellationContainer) return;

  if (!order) {
    hero.innerHTML = `
      <div class="loading-spinner">
        <i class="fas fa-clipboard-list"></i>
        <p>Selecciona una orden para ver el detalle.</p>
      </div>
    `;
    itemsContainer.innerHTML = '<p class="request-empty-text">Todavia no hay items para mostrar.</p>';
    historyContainer.innerHTML = '<p class="request-empty-text">Todavia no hay historial para mostrar.</p>';
    evidenceContainer.innerHTML = '<p class="request-empty-text">Todavia no hay evidencia para mostrar.</p>';
    cancellationContainer.innerHTML = '<p class="request-empty-text">Todavia no hay solicitudes de cancelacion para mostrar.</p>';
    return;
  }

  const technician = getTechnicianInfo(order.technicianId);
  const technicianName = technician?.publicProfile?.fullName || technician?.publicProfile?.FullName || "Tecnico asignado";
  const clientName = getClientDisplayName(order.clientId);
  const orderStatusValue = getStatusValue(order.status);
  const canApprove = orderStatusValue === ORDER_STATUS_VALUES.Created;
  const canConfirm = orderStatusValue === ORDER_STATUS_VALUES.Approved;
  const canDownloadReceipt = canDownloadReceiptForStatus(orderStatusValue);
  const canReassign = [ORDER_STATUS_VALUES.Created, ORDER_STATUS_VALUES.Approved, ORDER_STATUS_VALUES.Confirmed].includes(orderStatusValue)
    && !!order.reservationId;
  const assignableTechnicians = getAssignableTechnicians(order);
  const reassignNote = !order.reservationId
    ? "Esta orden no tiene reserva vinculada. Solo las nuevas ordenes podran reasignarse desde este panel."
    : ![ORDER_STATUS_VALUES.Created, ORDER_STATUS_VALUES.Approved, ORDER_STATUS_VALUES.Confirmed].includes(orderStatusValue)
      ? "La reasignacion solo esta disponible antes de iniciar la ejecucion."
    : assignableTechnicians.length === 0
      ? "No hay otros tecnicos activos de esta entidad para reasignar la orden."
      : "La reasignacion impacta sobre la reserva y la orden en conjunto.";

  hero.innerHTML = `
    <div class="request-panel-head">
      <div>
        <h4>Orden ${escapeHtml(order.id)}</h4>
        <p>Creada ${escapeHtml(formatDateTime(order.createdAtUtc))}</p>
      </div>
      <span class="provider-status-badge">${escapeHtml(getStatusLabel(order.status))}</span>
    </div>
    <div class="provider-detail-grid">
      <div class="provider-meta-item">
        <strong>Horario</strong>
        <span>${escapeHtml(formatDateTime(order.scheduledStartAtUtc))} - ${escapeHtml(formatArgentinaTime(order.scheduledEndAtUtc))}</span>
      </div>
      <div class="provider-meta-item">
        <strong>Cliente</strong>
        <span>${escapeHtml(clientName)}</span>
      </div>
      <div class="provider-meta-item">
        <strong>Tecnico</strong>
        <span>${escapeHtml(technicianName)}</span>
      </div>
      <div class="provider-meta-item">
        <strong>Especialidad</strong>
        <span>${escapeHtml(technician?.specialty || "Sin especialidad")}</span>
      </div>
      <div class="provider-meta-item">
        <strong>Total</strong>
        <span>${escapeHtml(formatCurrency(order.totalAmount))}</span>
      </div>
      <div class="provider-meta-item">
        <strong>Excepcion</strong>
        <span>${escapeHtml(order.exceptionReason || "-")}</span>
      </div>
    </div>
    <div class="provider-order-actions">
      ${canApprove ? `
        <button class="btn btn-primary" id="providerApproveOrderBtn">
          <i class="fas fa-thumbs-up"></i>
          Aprobar orden
        </button>` : ""}
      ${canConfirm ? `
        <button class="btn btn-primary" id="providerConfirmOrderBtn">
          <i class="fas fa-check"></i>
          Confirmar orden
        </button>` : ""}
      ${canDownloadReceipt ? `
        <button class="btn btn-secondary" id="providerDownloadReceiptBtn">
          <i class="fas fa-file-pdf"></i>
          Descargar comprobante
        </button>` : ""}
      ${canReassign ? `
        <select id="providerReassignTechnicianSelect" class="provider-technician-select">
          <option value="">${assignableTechnicians.length ? "Seleccionar tecnico" : "No hay tecnicos alternativos"}</option>
          ${assignableTechnicians.map((assignableTechnician) => {
            const publicProfile = assignableTechnician.publicProfile;
            const fullName = publicProfile?.fullName || publicProfile?.FullName || `Tecnico ${assignableTechnician.id.slice(0, 8)}`;
            return `<option value="${escapeHtml(assignableTechnician.id)}">${escapeHtml(fullName)} - ${escapeHtml(assignableTechnician.specialty)}</option>`;
          }).join("")}
        </select>
        <button class="btn btn-secondary" id="providerReassignOrderBtn" ${assignableTechnicians.length ? "" : "disabled"}>
          <i class="fas fa-random"></i>
          Reasignar tecnico
        </button>` : ""}
      <span class="provider-inline-note">${reassignNote}</span>
    </div>
  `;

  if (canApprove) {
    document.getElementById("providerApproveOrderBtn")?.addEventListener("click", () => {
      approveOrder(order.id).catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudo aprobar la orden."), {
          type: "error",
          title: "Aprobacion no completada"
        });
      });
    });
  }

  if (canConfirm) {
    document.getElementById("providerConfirmOrderBtn")?.addEventListener("click", () => {
      confirmOrder(order.id).catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudo confirmar la orden."), {
          type: "error",
          title: "Confirmacion no completada"
        });
      });
    });
  }

  if (canDownloadReceipt) {
    document.getElementById("providerDownloadReceiptBtn")?.addEventListener("click", () => {
      downloadReceipt(order.id).catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudo descargar el comprobante."), {
          type: "error",
          title: "Comprobante no disponible"
        });
      });
    });
  }

  if (canReassign) {
    document.getElementById("providerReassignOrderBtn")?.addEventListener("click", () => {
      const selectedTechnicianId = document.getElementById("providerReassignTechnicianSelect")?.value ?? "";
      if (!isGuid(selectedTechnicianId)) {
        showAppFeedback("Selecciona un tecnico valido antes de reasignar la orden.", {
          type: "error",
          title: "Falta seleccionar tecnico"
        });
        return;
      }

      reassignOrder(order.id, selectedTechnicianId).catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudo reasignar la orden."), {
          type: "error",
          title: "Reasignacion no completada"
        });
      });
    });
  }

  itemsContainer.innerHTML = order.items.length
    ? order.items.map((item) => `
        <div class="order-detail-item">
          <div>
            <strong>${escapeHtml(item.serviceName)}</strong>
            <p>Cantidad: ${item.quantity}</p>
          </div>
          <div>
            <strong>${escapeHtml(formatCurrency(item.totalPrice))}</strong>
            <p>${escapeHtml(formatCurrency(item.unitPrice))} por unidad</p>
          </div>
        </div>
      `).join("")
    : '<p class="request-empty-text">Todavia no hay items para mostrar.</p>';

  historyContainer.innerHTML = state.currentOrderHistory.length
    ? state.currentOrderHistory.map((entry) => `
        <div class="history-entry">
          <div class="history-entry__header">
            <strong>${escapeHtml(getStatusLabel(entry.newStatus))}</strong>
            <span>${escapeHtml(formatDateTime(entry.changedAtUtc))}</span>
          </div>
          <p>${escapeHtml(entry.note || "Sin observaciones.")}</p>
        </div>
      `).join("")
    : '<p class="request-empty-text">Todavia no hay historial para mostrar.</p>';

  cancellationContainer.innerHTML = state.currentOrderCancellationRequests.length
    ? state.currentOrderCancellationRequests
        .slice()
        .sort((left, right) => new Date(right.requestedAtUtc) - new Date(left.requestedAtUtc))
        .map((entry) => `
          <article class="history-entry">
            <div class="history-entry__header">
              <strong>${escapeHtml(getCancellationReasonLabel(entry.reason))}</strong>
              <span>${escapeHtml(formatDateTime(entry.requestedAtUtc))}</span>
            </div>
            <p><strong>Estado:</strong> ${escapeHtml(getRequestStatusLabel(entry.status))}</p>
            <p>${escapeHtml(entry.note || "Sin observaciones del tecnico.")}</p>
            ${entry.reviewedAtUtc ? `<p><strong>Resolucion:</strong> ${escapeHtml(formatDateTime(entry.reviewedAtUtc))}</p>` : ""}
            ${entry.resolutionNote ? `<p>${escapeHtml(entry.resolutionNote)}</p>` : ""}
            ${String(entry.status) === "1" || entry.status === "Pending"
              ? `<div class="provider-order-actions">
                  <button type="button" class="btn btn-primary provider-approve-cancellation" data-request-id="${escapeHtml(entry.id)}">Aprobar cancelacion</button>
                  <button type="button" class="btn btn-secondary provider-reject-cancellation" data-request-id="${escapeHtml(entry.id)}">Rechazar</button>
                  ${assignableTechnicians.length ? `
                    <select class="provider-technician-select" data-cancellation-reassign-select="${escapeHtml(entry.id)}">
                      <option value="">Seleccionar tecnico para reasignar</option>
                      ${assignableTechnicians.map((assignableTechnician) => {
                        const publicProfile = assignableTechnician.publicProfile;
                        const fullName = publicProfile?.fullName || publicProfile?.FullName || `Tecnico ${assignableTechnician.id.slice(0, 8)}`;
                        return `<option value="${escapeHtml(assignableTechnician.id)}">${escapeHtml(fullName)} - ${escapeHtml(assignableTechnician.specialty)}</option>`;
                      }).join("")}
                    </select>
                    <button type="button" class="btn btn-secondary provider-reject-reassign-cancellation" data-request-id="${escapeHtml(entry.id)}">Rechazar y reasignar</button>`
                    : `<span class="provider-inline-note">No hay tecnicos alternativos activos para rechazar y reasignar.</span>`}
                </div>`
              : ""}
          </article>
        `).join("")
    : '<p class="request-empty-text">Todavia no hay solicitudes de cancelacion para esta orden.</p>';

  evidenceContainer.innerHTML = state.currentOrderEvidence.length
    ? state.currentOrderEvidence
        .slice()
        .sort((left, right) => new Date(right.recordedAtUtc) - new Date(left.recordedAtUtc))
        .map((entry) => `
          <article class="order-evidence-item">
            ${isImageEvidence(entry) ? `
              <div class="order-evidence-preview ${state.currentOrderEvidencePreviewUrls.get(entry.id) ? "" : "is-loading"}" data-provider-evidence-preview-id="${escapeHtml(entry.id)}" data-provider-evidence-preview-alt="${escapeHtml(`Vista previa de ${entry.fileName || "evidencia"}`)}">
                ${state.currentOrderEvidencePreviewUrls.get(entry.id)
                  ? `<img src="${escapeHtml(state.currentOrderEvidencePreviewUrls.get(entry.id))}" alt="Vista previa de ${escapeHtml(entry.fileName || "evidencia")}">`
                  : '<span>Cargando vista previa...</span>'}
              </div>` : ""}
            <div class="order-evidence-head">
              <div>
                <strong>${escapeHtml(getEvidenceKindLabel(entry.kind))}</strong>
                <span>${escapeHtml(formatDateTime(entry.recordedAtUtc))}</span>
              </div>
              <span class="order-evidence-tag">${escapeHtml(entry.hasBinaryContent ? "Archivo" : "Registro")}</span>
            </div>
            <div class="order-evidence-meta">
              ${entry.fileName ? `<span>${escapeHtml(entry.fileName)}</span>` : ""}
              ${entry.contentType ? `<span>${escapeHtml(entry.contentType)}</span>` : ""}
              ${entry.fileSizeBytes ? `<span>${escapeHtml(formatFileSize(entry.fileSizeBytes))}</span>` : ""}
            </div>
            ${entry.note ? `<p class="order-evidence-note">${escapeHtml(entry.note)}</p>` : ""}
            ${entry.hasBinaryContent ? `
              <div class="order-evidence-actions">
                <button type="button" class="btn btn-secondary provider-download-evidence" data-order-id="${escapeHtml(order.id)}" data-evidence-id="${escapeHtml(entry.id)}" data-file-name="${escapeHtml(entry.fileName || "evidencia.bin")}">
                  <i class="fas fa-download"></i>
                  Descargar archivo
                </button>
              </div>` : ""}
          </article>
        `).join("")
    : '<p class="request-empty-text">Todavia no hay evidencia para mostrar.</p>';

  evidenceContainer.querySelectorAll(".provider-download-evidence").forEach((button) => {
    button.addEventListener("click", () => {
      downloadEvidenceFile(button.dataset.orderId, button.dataset.evidenceId, button.dataset.fileName).catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudo descargar la evidencia."), {
          type: "error",
          title: "Descarga no disponible"
        });
      });
    });
  });

  cancellationContainer.querySelectorAll(".provider-approve-cancellation").forEach((button) => {
    button.addEventListener("click", () => {
      resolveCancellationRequest(button.dataset.requestId, 2).catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudo aprobar la cancelacion."), {
          type: "error",
          title: "Cancelacion no resuelta"
        });
      });
    });
  });

  cancellationContainer.querySelectorAll(".provider-reject-cancellation").forEach((button) => {
    button.addEventListener("click", () => {
      resolveCancellationRequest(button.dataset.requestId, 3).catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudo rechazar la cancelacion."), {
          type: "error",
          title: "Cancelacion no resuelta"
        });
      });
    });
  });

  cancellationContainer.querySelectorAll(".provider-reject-reassign-cancellation").forEach((button) => {
    button.addEventListener("click", () => {
      const select = cancellationContainer.querySelector(`[data-cancellation-reassign-select="${button.dataset.requestId}"]`);
      const technicianId = select?.value || "";

      rejectCancellationRequestWithReassignment(button.dataset.requestId, technicianId).catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudo rechazar y reasignar la orden."), {
          type: "error",
          title: "Reasignacion no completada"
        });
      });
    });
  });
}

function findMatchingReservation(order, reservations) {
  return reservations.find((reservation) => {
    const reservationClientId = reservation.clientId ?? reservation.ClientId;
    const reservationProviderEntityId = reservation.providerEntityId ?? reservation.ProviderEntityId;
    const reservationTechnicianId = reservation.technicianId ?? reservation.TechnicianId;
    const reservationStartAtUtc = reservation.startAtUtc ?? reservation.StartAtUtc;
    const reservationEndAtUtc = reservation.endAtUtc ?? reservation.EndAtUtc;

    return reservationClientId === order.clientId
      && reservationProviderEntityId === order.providerEntityId
      && reservationTechnicianId === order.technicianId
      && reservationStartAtUtc === order.scheduledStartAtUtc
      && reservationEndAtUtc === order.scheduledEndAtUtc;
  }) || null;
}

async function transitionReservationForOrder(order, status, note) {
  const reservationId = order.reservationId;
  if (isGuid(reservationId)) {
    if (status === ORDER_STATUS_VALUES.Approved) {
      await FrontGateway.scheduling.approveReservation(reservationId, {
        reviewedByUserId: state.user?.userId ?? null,
        note
      });
    } else if (status === ORDER_STATUS_VALUES.Confirmed) {
      await FrontGateway.scheduling.confirmReservation(reservationId, {
        reviewedByUserId: state.user?.userId ?? null,
        note
      });
    } else {
      await FrontGateway.scheduling.updateReservationStatus(reservationId, {
        status,
        changedByUserId: state.user?.userId ?? null,
        note
      });
    }
    return;
  }

  const reservations = await FrontGateway.scheduling.getReservationsByTechnician(order.technicianId);
  const reservation = findMatchingReservation(order, reservations);
  if (!reservation) return;

  const resolvedReservationId = reservation.id ?? reservation.Id;
  if (!isGuid(resolvedReservationId)) return;

  if (status === ORDER_STATUS_VALUES.Approved) {
    await FrontGateway.scheduling.approveReservation(resolvedReservationId, {
      reviewedByUserId: state.user?.userId ?? null,
      note
    });
    return;
  }

  if (status === ORDER_STATUS_VALUES.Confirmed) {
    await FrontGateway.scheduling.confirmReservation(resolvedReservationId, {
      reviewedByUserId: state.user?.userId ?? null,
      note
    });
    return;
  }

  await FrontGateway.scheduling.updateReservationStatus(resolvedReservationId, {
    status,
    changedByUserId: state.user?.userId ?? null,
    note
  });
}

async function loadOrders() {
  const [orders, pendingCancellationRequests] = await Promise.all([
    FrontGateway.order.getOrdersByProvider(state.providerAdminProfile.providerEntityId),
    FrontGateway.order.getPendingCancellationRequestsByProvider(state.providerAdminProfile.providerEntityId)
  ]);
  state.orders = orders
    .map(normalizeOrder)
    .sort((left, right) => new Date(right.createdAtUtc) - new Date(left.createdAtUtc));
  state.pendingCancellationRequests = pendingCancellationRequests.map(normalizeCancellationRequest);

  renderSummaryCards();
  renderOrdersInto("providerOrdersList");
  renderOrdersInto("providerOrdersTray");
  renderPendingCancellationRequests();
  renderProfile();
}

async function openOrderDetail(orderId, { updateRoute = true } = {}) {
  clearEvidencePreviewUrls();
  const detail = await FrontGateway.order.getOrderDetail(orderId);

  state.currentOrderDetail = normalizeOrder(detail.order ?? detail.Order);
  state.currentOrderHistory = (detail.history ?? detail.History ?? []).map(normalizeHistoryEntry);
  state.currentOrderEvidence = (detail.evidence ?? detail.Evidence ?? []).map(normalizeEvidenceEntry);
  state.currentOrderCancellationRequests = (detail.cancellationRequests ?? detail.CancellationRequests ?? []).map(normalizeCancellationRequest);
  renderOrderDetail();
  updateEvidencePreviewElements();
  if (updateRoute) {
    updateProviderRoute({ section: "ordenes", orderId });
  }
  setProviderOrdersMode("detail");
  setSection("ordenes");
  ensureEvidencePreviews(orderId).catch((error) => {
    console.warn("No se pudieron cargar las vistas previas de evidencia.", error);
  });
}

async function downloadEvidenceFile(orderId, evidenceId, fallbackFileName = "evidencia.bin") {
  const result = await FrontGateway.order.downloadEvidenceFile(orderId, evidenceId);
  downloadBlob(result.blob, result.fileName || fallbackFileName);
}

async function downloadReceipt(orderId, fallbackFileName = "comprobante.pdf") {
  const result = await FrontGateway.order.downloadReceipt(orderId);
  downloadBlob(result.blob, result.fileName || fallbackFileName);
}

async function approveOrder(orderId) {
  if (!state.currentOrderDetail || state.currentOrderDetail.id !== orderId) {
    await openOrderDetail(orderId);
  }

  const note = "Approved by provider panel.";
  await FrontGateway.order.approveOrder(orderId, {
    reviewedByUserId: state.user?.userId ?? null,
    note
  });

  try {
    await transitionReservationForOrder(state.currentOrderDetail, ORDER_STATUS_VALUES.Approved, note);
  } catch (error) {
    console.warn("No se pudo aprobar la reserva asociada desde el panel proveedor.", error);
  }

  await loadOrders();
  await openOrderDetail(orderId);
  showAppFeedback("La orden quedo aprobada. Todavia falta la confirmacion operativa final.", {
    type: "success",
    title: "Orden aprobada"
  });
}

async function confirmOrder(orderId) {
  if (!state.currentOrderDetail || state.currentOrderDetail.id !== orderId) {
    await openOrderDetail(orderId);
  }

  const note = "Confirmed by provider panel.";
  await FrontGateway.order.confirmOrder(orderId, {
    reviewedByUserId: state.user?.userId ?? null,
    note
  });

  try {
    await transitionReservationForOrder(state.currentOrderDetail, ORDER_STATUS_VALUES.Confirmed, note);
  } catch (error) {
    console.warn("No se pudo confirmar la reserva asociada desde el panel proveedor.", error);
  }

  await loadOrders();
  await openOrderDetail(orderId);
  showAppFeedback("La orden quedo confirmada y ya puede avanzar en la operatoria.", {
    type: "success",
    title: "Orden confirmada"
  });
}

async function resolveCancellationRequest(requestId, status, options = {}) {
  if (!isGuid(requestId)) throw new Error("Solicitud invalida para resolver.");
  if (!state.currentOrderDetail) throw new Error("No hay una orden seleccionada para resolver la cancelacion.");

  const replacementTechnicianId = options.replacementTechnicianId;
  const isRejectWithReassign = status === 3 && isGuid(replacementTechnicianId);

  const note = status === 2
    ? "Cancelacion aprobada por la entidad proveedora."
    : isRejectWithReassign
      ? "Cancelacion rechazada por la entidad proveedora con reasignacion operativa."
      : "Cancelacion rechazada por la entidad proveedora.";

  await FrontGateway.order.resolveCancellationRequest(requestId, {
    status,
    reviewedByUserId: state.user?.userId ?? null,
    note,
    replacementTechnicianId: isRejectWithReassign ? replacementTechnicianId : null,
    requestedByUserId: isRejectWithReassign ? state.user?.userId ?? null : null,
    overrideByAdmin: false
  });

  if (status === 2) {
    try {
      await transitionReservationForOrder(state.currentOrderDetail, ORDER_STATUS_VALUES.Exception, note);
    } catch (error) {
      console.warn("No se pudo pasar la reserva a excepcion al aprobar la cancelacion.", error);
    }
  }

  await loadOrders();
  await openOrderDetail(state.currentOrderDetail.id);
  showAppFeedback(
    status === 2
      ? "La cancelacion justificada fue aprobada y la orden paso a excepcion."
      : isRejectWithReassign
        ? "La cancelacion fue rechazada y la orden quedo reasignada a otro tecnico de la entidad."
        : "La cancelacion justificada fue rechazada. La orden sigue disponible para gestion operativa.",
    {
      type: "success",
      title: status === 2 ? "Cancelacion aprobada" : isRejectWithReassign ? "Cancelacion rechazada y reasignada" : "Cancelacion rechazada"
    }
  );
}

async function rejectCancellationRequestWithReassignment(requestId, technicianId) {
  if (!isGuid(technicianId)) {
    throw new Error("Selecciona un tecnico alternativo antes de rechazar y reasignar.");
  }

  if (!state.currentOrderDetail || !isGuid(state.currentOrderDetail.reservationId)) {
    throw new Error("La orden no tiene una reserva vinculada para realizar la reasignacion guiada.");
  }

  const previousTechnicianId = state.currentOrderDetail.technicianId;
  const note = "Cancellation rejected with provider-side reassignment.";

  await FrontGateway.scheduling.reassignReservation(state.currentOrderDetail.reservationId, {
    technicianId,
    requestedByUserId: state.user?.userId ?? null,
    reason: note,
    overrideByAdmin: false
  });

  try {
    await resolveCancellationRequest(requestId, 3, {
      replacementTechnicianId: technicianId
    });
  } catch (error) {
    await FrontGateway.scheduling.reassignReservation(state.currentOrderDetail.reservationId, {
      technicianId: previousTechnicianId,
      requestedByUserId: state.user?.userId ?? null,
      reason: "Rollback after cancellation rejection reassign failed.",
      overrideByAdmin: false
    });
    throw error;
  }
}

async function reassignOrder(orderId, technicianId) {
  if (!state.currentOrderDetail || state.currentOrderDetail.id !== orderId) {
    await openOrderDetail(orderId);
  }

  const order = state.currentOrderDetail;
  if (!isGuid(order?.reservationId)) {
    throw new Error("La orden no tiene una reserva vinculada para reasignar.");
  }

  const previousTechnicianId = order.technicianId;
  const note = "Reassigned by provider panel.";

  await FrontGateway.scheduling.reassignReservation(order.reservationId, {
    technicianId,
    requestedByUserId: state.user?.userId ?? null,
    reason: note,
    overrideByAdmin: false
  });

  try {
    await FrontGateway.order.reassignTechnician(order.id, {
      technicianId,
      requestedByUserId: state.user?.userId ?? null,
      reason: note
    });
  } catch (error) {
    try {
      await FrontGateway.scheduling.reassignReservation(order.reservationId, {
        technicianId: previousTechnicianId,
        requestedByUserId: state.user?.userId ?? null,
        reason: "Compensation after OrderMS reassign failed.",
        overrideByAdmin: false
      });
    } catch (compensationError) {
      console.error("No se pudo compensar la reasignacion de la reserva.", compensationError);
    }

    throw error;
  }

  await loadOrders();
  await openOrderDetail(orderId);
  showAppFeedback("La orden se reasigno correctamente al tecnico seleccionado.", {
    type: "success",
    title: "Tecnico reasignado"
  });
}

async function createTechnicianForProvider(event) {
  event.preventDefault();

  const submitButton = document.getElementById("providerTechnicianSubmitBtn");
  const payload = {
    firstName: document.getElementById("providerTechnicianFirstName")?.value?.trim() ?? "",
    lastName: document.getElementById("providerTechnicianLastName")?.value?.trim() ?? "",
    email: document.getElementById("providerTechnicianEmail")?.value?.trim() ?? "",
    dni: document.getElementById("providerTechnicianDni")?.value?.trim() ?? "",
    password: document.getElementById("providerTechnicianPassword")?.value ?? "",
    phone: document.getElementById("providerTechnicianPhone")?.value?.trim() ?? "",
    specialty: document.getElementById("providerTechnicianSpecialty")?.value?.trim() ?? ""
  };

  submitButton?.setAttribute("disabled", "disabled");
  setTechnicianFeedback("Creando tecnico y asociandolo a la entidad...", "");

  try {
    await FrontGateway.auth.createTechnicianForProvider(payload);
    resetTechnicianForm();
    setTechnicianFeedback("Tecnico creado. Si el SMTP sigue deshabilitado, el codigo de verificacion quedo logueado en la consola de AuthMS.", "success");
    await loadTechnicians();
  } catch (error) {
    setTechnicianFeedback(getErrorMessage(error, "No se pudo crear el tecnico."), "error");
    throw error;
  } finally {
    submitButton?.removeAttribute("disabled");
  }
}

async function updateTechnicianStatus(technicianId, status) {
  await FrontGateway.directory.changeTechnicianStatus(technicianId, status);
  setTechnicianFeedback("Estado del tecnico actualizado correctamente.", "success");
  await loadTechnicians();
}

async function loadProviderChangeRequests() {
  const requests = await FrontGateway.directory.getTechnicianProviderChangeRequestsByProvider(state.providerAdminProfile.providerEntityId);
  state.pendingProviderChangeRequests = requests
    .map(normalizeProviderChangeRequest)
    .filter((request) => request.status === 1 || request.status === "Pending");
  renderProviderChangeRequests();
}

async function loadTechnicians() {
  const rawTechnicians = await FrontGateway.directory.getTechniciansByProvider(state.providerAdminProfile.providerEntityId);
  const technicians = rawTechnicians.map(normalizeTechnicianProfile);

  const techniciansWithNames = await Promise.all(technicians.map(async (technician) => {
    try {
      const publicProfile = await FrontGateway.auth.getTechnicianPublicProfile(technician.authUserId);
      return { ...technician, publicProfile };
    } catch (error) {
      console.warn("No se pudo resolver el perfil publico del tecnico.", technician.authUserId, error);
      return technician;
    }
  }));

  state.technicians = techniciansWithNames;
  state.techniciansById = new Map(techniciansWithNames.map((technician) => [technician.id, technician]));

  renderTechnicians();
  renderProviderChangeRequests();
  renderSummaryCards();
  renderProfile();
}

async function loadClientProfiles() {
  const rawProfiles = await FrontGateway.directory.getClientProfilesByProvider(state.providerAdminProfile.providerEntityId);
  const profiles = rawProfiles.map(normalizeClientProfile);
  state.clientProfilesById = new Map(profiles.map((profile) => [profile.id, profile]));

  renderOrdersInto("providerOrdersList");
  renderOrdersInto("providerOrdersTray");
  renderOrderDetail();
}

async function loadContext() {
  if (!state.user) {
    state.user = getStoredUser();
  }

  const authUserId = getAuthUserIdFromToken();
  if (!authUserId) {
    throw new Error("No se encontro un identificador de usuario valido en la sesion.");
  }

  const providerAdminProfile = await FrontGateway.directory.getProviderAdminProfileByAuthUserId(authUserId);
  state.providerAdminProfile = {
    id: providerAdminProfile.id ?? providerAdminProfile.Id,
    authUserId: providerAdminProfile.authUserId ?? providerAdminProfile.AuthUserId,
    providerEntityId: providerAdminProfile.providerEntityId ?? providerAdminProfile.ProviderEntityId,
    fullName: providerAdminProfile.fullName ?? providerAdminProfile.FullName,
    createdAtUtc: providerAdminProfile.createdAtUtc ?? providerAdminProfile.CreatedAtUtc,
    updatedAtUtc: providerAdminProfile.updatedAtUtc ?? providerAdminProfile.UpdatedAtUtc
  };

  state.providerEntity = await FrontGateway.directory.getProviderById(state.providerAdminProfile.providerEntityId);
}

function setupNavigation() {
  document.querySelectorAll(".sidebar-nav .nav-item").forEach((item) => {
    item.addEventListener("click", (event) => {
      event.preventDefault();
      updateProviderRoute({ section: item.dataset.section || "inicio" });
    });
  });

  document.getElementById("providerBackToOrders")?.addEventListener("click", () => {
    updateProviderRoute({ section: "ordenes" });
    setProviderOrdersMode("list");
  });

  document.getElementById("refreshProviderOrders")?.addEventListener("click", () => {
    clearAppFeedback();
    loadOrders().catch((error) => {
      showAppFeedback(getErrorMessage(error, "No se pudo actualizar la bandeja de ordenes."), {
        type: "error",
        title: "Actualizacion incompleta"
      });
    });
  });

  document.getElementById("providerTechnicianForm")?.addEventListener("submit", (event) => {
    createTechnicianForProvider(event).catch((error) => {
      setTechnicianFeedback(getErrorMessage(error, "No se pudo crear el tecnico."), "error");
    });
  });

  window.addEventListener("hashchange", () => {
    handleProviderRouteChange().catch((error) => {
      console.error("No se pudo resolver la navegacion del proveedor.", error);
    });
  });
}

async function bootstrap() {
  state.user = await ensureAuthorizedPage(["ProviderAdmin"]);
  await loadContext();
  setWelcomeMessage();
  setupUserMenu();
  setupNavigation();
  renderProfile();

  const results = await Promise.allSettled([
    loadTechnicians(),
    loadOrders(),
    loadClientProfiles(),
    loadProviderChangeRequests()
  ]);

  if (results[0]?.status === "rejected") {
    console.error("No se pudieron cargar los tecnicos del proveedor.", results[0].reason);
    showListError("providerTechniciansList", `No se pudieron cargar los tecnicos: ${getErrorMessage(results[0].reason, "Error desconocido.")}`);
  }

  if (results[1]?.status === "rejected") {
    console.error("No se pudieron cargar las ordenes del proveedor.", results[1].reason);
    const errorMessage = getErrorMessage(results[1].reason, "Error desconocido.");
    showListError("providerOrdersList", `No se pudieron cargar las ordenes: ${errorMessage}`);
    showListError("providerOrdersTray", `No se pudieron cargar las ordenes: ${errorMessage}`);
  }

  if (results[2]?.status === "rejected") {
    console.error("No se pudieron cargar los clientes del proveedor.", results[2].reason);
  }

  if (results[3]?.status === "rejected") {
    console.error("No se pudieron cargar las solicitudes de cambio de entidad.", results[3].reason);
    showListError("providerTechnicianChangeRequests", `No se pudieron cargar las solicitudes: ${getErrorMessage(results[3].reason, "Error desconocido.")}`);
  }

  isProviderBootstrapComplete = true;
  if (!window.location.hash) {
    updateProviderRoute({ section: "inicio" }, { replace: true });
  }
  await handleProviderRouteChange();
}

bootstrap().catch((error) => {
  if (isAuthRedirectError(error)) return;
  console.error(error);
  showAppFeedback(getErrorMessage(error, "Verifica AuthMS, DirectoryMS y OrderMS."), {
    type: "error",
    title: "No pudimos iniciar el panel proveedor",
    timeout: 0
  });
});
