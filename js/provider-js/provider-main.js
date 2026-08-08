import { FrontGateway } from "../api.js";
import {
  formatArgentinaDate,
  formatArgentinaDateTime,
  formatArgentinaTime,
  getArgentinaDateInputValue
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

const ORDER_STATUS_TONES = {
  Created: "created",
  Approved: "approved",
  Confirmed: "confirmed",
  InProgress: "progress",
  Finalized: "finalized",
  Exception: "exception",
  Closed: "closed",
  1: "created",
  2: "confirmed",
  3: "progress",
  4: "finalized",
  5: "exception",
  6: "closed",
  7: "approved"
};

const ORDER_STATUS_ICONS = {
  created: "fa-file-circle-plus",
  approved: "fa-circle-check",
  confirmed: "fa-calendar-check",
  progress: "fa-spray-can",
  finalized: "fa-flag-checkered",
  exception: "fa-triangle-exclamation",
  closed: "fa-lock"
};

const ORDER_PROGRESS_STEPS = [
  { tone: "created", label: "Creada" },
  { tone: "approved", label: "Aprobada" },
  { tone: "confirmed", label: "Confirmada" },
  { tone: "progress", label: "En ejecucion" },
  { tone: "finalized", label: "Finalizada" }
];

const ORDER_PROGRESS_RANKS = {
  created: 0,
  approved: 1,
  confirmed: 2,
  progress: 3,
  finalized: 4,
  closed: 5,
  exception: -1
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

const filters = {
  ordersStatus: "",
  ordersSearch: "",
  techniciansStatus: "",
  techniciansSearch: ""
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
  // 24h como el resto del panel: `timeStyle: short` en es-AR da "12:00 p. m.".
  return formatArgentinaDateTime(value, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
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

function getOrderStatusTone(status) {
  return ORDER_STATUS_TONES[status] || "created";
}

function getOrderStatusIcon(status) {
  return ORDER_STATUS_ICONS[getOrderStatusTone(status)] || "fa-circle-info";
}

function getOrderProgressRank(status) {
  const rank = ORDER_PROGRESS_RANKS[getOrderStatusTone(status)];
  return Number.isInteger(rank) ? rank : 0;
}

function formatCompactDuration(totalMinutes) {
  const normalizedMinutes = Math.max(0, Math.round(Number(totalMinutes || 0)));
  if (normalizedMinutes <= 0) return "Sin duracion";

  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;

  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

function getOrderDurationMinutes(order) {
  const start = new Date(order?.scheduledStartAtUtc);
  const end = new Date(order?.scheduledEndAtUtc);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}

function getDayOffsetFromToday(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const [targetYear, targetMonth, targetDay] = getArgentinaDateInputValue(date).split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = getArgentinaDateInputValue().split("-").map(Number);

  return Math.round((Date.UTC(targetYear, targetMonth - 1, targetDay) - Date.UTC(todayYear, todayMonth - 1, todayDay)) / 86400000);
}

function getOrderTimingBadge(order) {
  const dayOffset = getDayOffsetFromToday(order?.scheduledStartAtUtc);
  if (dayOffset === null) return null;

  const tone = getOrderStatusTone(order?.status);

  if (tone === "finalized" || tone === "closed" || tone === "exception") {
    if (dayOffset === 0) return { tone: "neutral", icon: "fa-clock-rotate-left", label: "Visita de hoy" };
    if (dayOffset < 0) return { tone: "neutral", icon: "fa-clock-rotate-left", label: `Hace ${Math.abs(dayOffset)} dias` };
    return { tone: "neutral", icon: "fa-calendar-day", label: `En ${dayOffset} dias` };
  }

  if (dayOffset < 0) {
    return {
      tone: "late",
      icon: "fa-triangle-exclamation",
      label: dayOffset === -1 ? "Vencida ayer" : `Vencida hace ${Math.abs(dayOffset)} dias`
    };
  }

  if (dayOffset === 0) {
    return { tone: "today", icon: "fa-bolt", label: `Hoy ${formatArgentinaTime(order.scheduledStartAtUtc, { hourCycle: "h23" })}` };
  }

  if (dayOffset === 1) {
    return { tone: "soon", icon: "fa-hourglass-half", label: `El ${formatArgentinaDate(order.scheduledStartAtUtc, { weekday: "long", day: undefined, month: undefined })}` };
  }

  return { tone: dayOffset <= 7 ? "soon" : "neutral", icon: "fa-calendar-day", label: `En ${dayOffset} dias` };
}

function getInitials(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getOrderTitle(order) {
  const items = order?.items || [];
  if (!items.length) return "Orden sin items";

  const [firstItem, ...restItems] = items;
  if (!restItems.length) return firstItem.serviceName || "Servicio sin nombre";
  return `${firstItem.serviceName} +${restItems.length} mas`;
}

function getStatusValue(status) {
  if (typeof status === "number") return status;
  return ORDER_STATUS_VALUES[status] || null;
}

function requiresProviderDecision(statusValue) {
  return statusValue === ORDER_STATUS_VALUES.Created;
}

// Una orden aprobada tampoco avanza sola: espera la confirmacion de la
// entidad. Para el panel las dos cuentan como decision pendiente.
function needsProviderAction(statusValue) {
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
    address: rawOrder.address ?? rawOrder.Address ?? null,
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
  const pendingOrders = state.orders.filter((order) => needsProviderAction(getStatusValue(order.status))).length;
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

function renderOrderProgressTrack(order) {
  const tone = getOrderStatusTone(order.status);
  if (tone === "exception") return "";

  const currentRank = getOrderProgressRank(order.status);
  const isClosed = tone === "closed";
  const lastStepIndex = ORDER_PROGRESS_STEPS.length - 1;

  const steps = ORDER_PROGRESS_STEPS.map((step, index) => {
    const isDone = isClosed || index < currentRank;
    const isCurrent = !isClosed && index === currentRank;
    const label = isClosed && index === lastStepIndex ? "Cerrada" : step.label;

    return `
      <li class="provider-order-progress__step ${isDone ? "is-done" : isCurrent ? "is-current" : ""}">
        <span class="provider-order-progress__dot" aria-hidden="true"></span>
        <span class="provider-order-progress__label">${escapeHtml(label)}</span>
      </li>
    `;
  }).join("");

  const completedRatio = isClosed ? 1 : Math.min(1, Math.max(0, currentRank / lastStepIndex));
  const currentStepNumber = Math.min(ORDER_PROGRESS_STEPS.length, currentRank + 1);

  return `
    <div class="provider-order-progress" style="--provider-order-progress: ${completedRatio.toFixed(2)}">
      <ol class="provider-order-progress__steps" aria-label="Progreso de la orden">
        ${steps}
      </ol>
      <p class="provider-order-progress__caption">
        Paso ${currentStepNumber} de ${ORDER_PROGRESS_STEPS.length} &middot; <strong>${escapeHtml(getStatusLabel(order.status))}</strong>
      </p>
    </div>
  `;
}

function renderProviderOrderCard(order) {
  const tone = getOrderStatusTone(order.status);
  const statusValue = getStatusValue(order.status);
  const technician = getTechnicianInfo(order.technicianId);
  const technicianName = technician?.publicProfile?.fullName
    || technician?.publicProfile?.FullName
    || `Tecnico ${String(order.technicianId || "").slice(0, 8)}`;
  const technicianSpecialty = technician?.specialty || "Sin especialidad";
  const clientName = getClientDisplayName(order.clientId);
  const timingBadge = getOrderTimingBadge(order);
  const durationMinutes = getOrderDurationMinutes(order);
  const servicesCount = (order.items || []).length;
  const hasSchedule = Boolean(order.scheduledStartAtUtc) && !Number.isNaN(new Date(order.scheduledStartAtUtc).getTime());
  const canApprove = statusValue === ORDER_STATUS_VALUES.Created;
  const canConfirm = statusValue === ORDER_STATUS_VALUES.Approved;

  const exceptionBlock = order.exceptionReason
    ? `<div class="provider-order-card__exception">
        <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
        <div>
          <strong>Motivo de la excepcion</strong>
          <p>${escapeHtml(order.exceptionReason)}</p>
        </div>
      </div>`
    : "";

  return `
    <article class="provider-order-card is-${escapeHtml(tone)}" data-order-id="${escapeHtml(order.id)}">
      <div class="provider-order-card__header">
        <div class="provider-order-card__identity">
          <h4 class="provider-order-card__title">${escapeHtml(getOrderTitle(order))}</h4>
          <p class="provider-order-card__meta">
            <span class="provider-order-card__ref">#${escapeHtml(String(order.id).slice(0, 8))}</span>
            <span>${escapeHtml(`${servicesCount} servicio${servicesCount === 1 ? "" : "s"}`)}</span>
            ${order.createdAtUtc ? `<span>Creada el ${escapeHtml(formatArgentinaDate(order.createdAtUtc, { weekday: undefined, day: "2-digit", month: "2-digit", year: "2-digit" }))}</span>` : ""}
          </p>
        </div>
        <div class="provider-order-card__badges">
          <span class="provider-order-card__status">
            <i class="fas ${escapeHtml(getOrderStatusIcon(order.status))}" aria-hidden="true"></i>
            ${escapeHtml(getStatusLabel(order.status))}
          </span>
          ${timingBadge ? `
            <span class="provider-order-card__timing is-${escapeHtml(timingBadge.tone)}">
              <i class="fas ${escapeHtml(timingBadge.icon)}" aria-hidden="true"></i>
              ${escapeHtml(timingBadge.label)}
            </span>` : ""}
        </div>
      </div>

      <div class="provider-order-card__grid">
        <div class="provider-order-card__item is-primary">
          <span class="provider-order-card__label"><i class="fas fa-calendar-day" aria-hidden="true"></i> Visita programada</span>
          ${hasSchedule ? `
            <strong>${escapeHtml(formatArgentinaDate(order.scheduledStartAtUtc, { weekday: "long", day: "2-digit", month: "long" }))}</strong>
            <span class="provider-order-card__value-sub">
              ${escapeHtml(formatArgentinaTime(order.scheduledStartAtUtc, { hourCycle: "h23" }))} a ${escapeHtml(formatArgentinaTime(order.scheduledEndAtUtc, { hourCycle: "h23" }))}
              ${durationMinutes ? ` &middot; ${escapeHtml(formatCompactDuration(durationMinutes))}` : ""}
            </span>` : `
            <strong>Sin fecha asignada</strong>`}
        </div>

        <div class="provider-order-card__item">
          <span class="provider-order-card__label"><i class="fas fa-user" aria-hidden="true"></i> Cliente</span>
          <strong>${escapeHtml(clientName)}</strong>
          ${order.address ? `<span class="provider-order-card__value-sub">${escapeHtml(order.address)}</span>` : '<span class="provider-order-card__value-sub">Sin direccion registrada</span>'}
        </div>

        <div class="provider-order-card__item">
          <span class="provider-order-card__label"><i class="fas fa-user-gear" aria-hidden="true"></i> Tecnico asignado</span>
          <div class="provider-order-card__technician">
            <span class="provider-order-card__avatar" aria-hidden="true">${escapeHtml(getInitials(technicianName))}</span>
            <span>
              <strong>${escapeHtml(technicianName)}</strong>
              <span class="provider-order-card__value-sub">${escapeHtml(technicianSpecialty)}</span>
            </span>
          </div>
        </div>

        <div class="provider-order-card__item is-amount">
          <span class="provider-order-card__label"><i class="fas fa-receipt" aria-hidden="true"></i> Total</span>
          <strong>${escapeHtml(formatCurrency(order.totalAmount))}</strong>
          <span class="provider-order-card__value-sub">${escapeHtml(order.items.map((item) => `${item.serviceName} x${item.quantity}`).join(", ") || "Sin items")}</span>
        </div>
      </div>

      ${renderOrderProgressTrack(order)}
      ${exceptionBlock}

      <div class="provider-order-card__actions">
        ${canApprove ? `
          <button type="button" class="btn btn-primary provider-inline-approve" data-order-id="${escapeHtml(order.id)}">
            <i class="fas fa-thumbs-up" aria-hidden="true"></i>
            Aprobar
          </button>` : ""}
        ${canConfirm ? `
          <button type="button" class="btn btn-primary provider-inline-confirm" data-order-id="${escapeHtml(order.id)}">
            <i class="fas fa-check" aria-hidden="true"></i>
            Confirmar
          </button>` : ""}
        <button type="button" class="btn btn-secondary provider-open-order" data-order-id="${escapeHtml(order.id)}">
          <i class="fas fa-eye" aria-hidden="true"></i>
          Ver detalle
        </button>
      </div>
    </article>
  `;
}

function bindProviderOrderCardEvents(container) {
  container.querySelectorAll(".provider-open-order").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openOrderDetail(button.dataset.orderId).catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudo abrir el detalle de la orden."), {
          type: "error",
          title: "No pudimos abrir la orden"
        });
      });
    });
  });

  container.querySelectorAll(".provider-inline-approve").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      approveOrder(button.dataset.orderId).catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudo aprobar la orden."), {
          type: "error",
          title: "Aprobacion no completada"
        });
      });
    });
  });

  container.querySelectorAll(".provider-inline-confirm").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      confirmOrder(button.dataset.orderId).catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudo confirmar la orden."), {
          type: "error",
          title: "Confirmacion no completada"
        });
      });
    });
  });

  container.querySelectorAll(".provider-order-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("button, a, select")) return;
      openOrderDetail(card.dataset.orderId).catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudo abrir el detalle de la orden."), {
          type: "error",
          title: "No pudimos abrir la orden"
        });
      });
    });
  });
}

function sortOrdersBySchedule(orders, direction = "asc") {
  const factor = direction === "asc" ? 1 : -1;

  return orders.slice().sort((left, right) => {
    const leftTime = new Date(left.scheduledStartAtUtc || left.createdAtUtc).getTime();
    const rightTime = new Date(right.scheduledStartAtUtc || right.createdAtUtc).getTime();
    return ((Number.isNaN(leftTime) ? 0 : leftTime) - (Number.isNaN(rightTime) ? 0 : rightTime)) * factor;
  });
}

function matchesOrderSearch(order, searchTerm) {
  if (!searchTerm) return true;

  const technician = getTechnicianInfo(order.technicianId);
  const technicianName = technician?.publicProfile?.fullName || technician?.publicProfile?.FullName || "";
  const haystack = [
    order.id,
    getClientDisplayName(order.clientId),
    technicianName,
    order.address || "",
    ...order.items.map((item) => item.serviceName)
  ].join(" ").toLowerCase();

  return haystack.includes(searchTerm.toLowerCase());
}

function getFilteredOrders() {
  return state.orders.filter((order) => {
    const matchesStatus = !filters.ordersStatus || String(getStatusValue(order.status)) === String(filters.ordersStatus);
    return matchesStatus && matchesOrderSearch(order, filters.ordersSearch);
  });
}

function isOrdersFilterActive() {
  return Boolean(filters.ordersStatus) || Boolean(filters.ordersSearch.trim());
}

function renderOrdersInto(containerId, { limit = 0, decisionFirst = false, focusMode = false, excludePending = false } = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let orders;

  if (decisionFirst) {
    orders = sortOrdersBySchedule(state.orders.filter((order) => needsProviderAction(getStatusValue(order.status))), "asc");
  } else if (focusMode) {
    // Inicio muestra lo accionable, no lo mas viejo: primero lo que espera
    // decision y despues las visitas mas proximas.
    orders = sortOrdersBySchedule(
      state.orders.filter((order) => isActiveOrderStatus(getStatusValue(order.status))),
      "asc"
    ).sort((left, right) => {
      const leftPending = needsProviderAction(getStatusValue(left.status)) ? 0 : 1;
      const rightPending = needsProviderAction(getStatusValue(right.status)) ? 0 : 1;
      return leftPending - rightPending;
    });
  } else {
    // Las que ya estan en "Esperan tu decision" no se repiten en la bandeja,
    // salvo que haya una busqueda o un filtro activos: ahi el usuario espera
    // ver todos los resultados juntos.
    orders = sortOrdersBySchedule(
      excludePending
        ? getFilteredOrders().filter((order) => !needsProviderAction(getStatusValue(order.status)))
        : getFilteredOrders(),
      "asc"
    );
  }

  const visibleOrders = limit > 0 ? orders.slice(0, limit) : orders;

  if (!visibleOrders.length) {
    container.innerHTML = renderProviderEmptyState(
      state.orders.length
        ? {
            icon: "fa-filter-circle-xmark",
            title: decisionFirst ? "No hay ordenes esperando decision" : excludePending ? "No hay mas ordenes" : "Sin resultados",
            message: decisionFirst
              ? "Todas las ordenes de la entidad ya fueron aprobadas o confirmadas."
              : excludePending
                ? "Todas las ordenes de la entidad estan en el grupo de arriba, esperando tu decision."
                : "Proba con otro estado o limpia la busqueda para ver el resto de las ordenes."
          }
        : {
            icon: "fa-clipboard-list",
            title: "Todavia no hay ordenes",
            message: "Cuando un cliente solicite un servicio a esta entidad, la orden aparece aca para aprobar y confirmar."
          }
    );
    return;
  }

  container.innerHTML = visibleOrders.map(renderProviderOrderCard).join("");
  bindProviderOrderCardEvents(container);
}

function renderProviderEmptyState({ icon = "fa-clipboard-list", title = "", message = "" }) {
  return `
    <div class="provider-empty">
      <span class="provider-empty__icon"><i class="fas ${escapeHtml(icon)}" aria-hidden="true"></i></span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function renderProviderOrdersStats() {
  const container = document.getElementById("providerOrdersStats");
  if (!container) return;

  const pending = state.orders.filter((order) => needsProviderAction(getStatusValue(order.status))).length;
  const active = state.orders.filter((order) => isActiveOrderStatus(getStatusValue(order.status))).length;
  const lateOrders = state.orders.filter((order) => {
    const statusValue = getStatusValue(order.status);
    return isActiveOrderStatus(statusValue) && (getDayOffsetFromToday(order.scheduledStartAtUtc) ?? 0) < 0;
  }).length;
  const upcoming = sortOrdersBySchedule(
    state.orders.filter((order) => isActiveOrderStatus(getStatusValue(order.status)) && (getDayOffsetFromToday(order.scheduledStartAtUtc) ?? -1) >= 0),
    "asc"
  )[0];

  const stats = [
    { icon: "fa-hourglass-half", label: "Esperan decision", value: String(pending), tone: pending > 0 ? "attention" : "" },
    { icon: "fa-clipboard-check", label: "Ordenes activas", value: String(active) },
    {
      icon: "fa-calendar-day",
      label: "Proxima visita",
      value: upcoming
        ? `${formatArgentinaDate(upcoming.scheduledStartAtUtc, { weekday: "short", day: "2-digit", month: "short" })} &middot; ${formatArgentinaTime(upcoming.scheduledStartAtUtc, { hourCycle: "h23" })}`
        : "Sin visitas agendadas",
      raw: true
    },
    { icon: "fa-user-shield", label: "Tecnicos activos", value: String(state.technicians.filter((technician) => getTechnicianStatusValue(technician.status) === TECHNICIAN_STATUS_VALUES.Active).length) }
  ];

  if (lateOrders > 0) {
    stats.push({ icon: "fa-triangle-exclamation", label: lateOrders === 1 ? "Visita vencida" : "Visitas vencidas", value: String(lateOrders), tone: "late" });
  }

  container.innerHTML = stats.map((stat) => `
    <div class="provider-stat ${stat.tone ? `is-${escapeHtml(stat.tone)}` : ""}">
      <i class="fas ${escapeHtml(stat.icon)}" aria-hidden="true"></i>
      <span>
        <strong>${stat.raw ? stat.value : escapeHtml(stat.value)}</strong>
        <small>${escapeHtml(stat.label)}</small>
      </span>
    </div>
  `).join("");
}

function renderProviderOrdersSection() {
  renderProviderOrdersStats();

  const decisionGroup = document.getElementById("providerDecisionGroup");
  const decisionCount = state.orders.filter((order) => needsProviderAction(getStatusValue(order.status))).length;
  // Buscar o filtrar arma una lista plana: el grupo de decision es una ayuda
  // de la vista por defecto, no un tercer resultado que compita con la busqueda.
  const showsDecisionGroup = decisionCount > 0 && !isOrdersFilterActive();

  if (decisionGroup) {
    decisionGroup.classList.toggle("hidden", !showsDecisionGroup);
    const counter = document.getElementById("providerDecisionCount");
    if (counter) counter.textContent = decisionCount === 1 ? "1 orden" : `${decisionCount} ordenes`;
  }

  if (showsDecisionGroup) {
    renderOrdersInto("providerDecisionList", { decisionFirst: true });
  }

  const trayCopy = document.getElementById("providerTrayCopy");
  if (trayCopy) {
    trayCopy.textContent = showsDecisionGroup
      ? "El resto de las ordenes de la entidad, de la visita mas proxima a la mas lejana."
      : "Todas las ordenes de la entidad, de la visita mas proxima a la mas lejana.";
  }

  renderOrdersInto("providerOrdersTray", { excludePending: showsDecisionGroup });
}

function renderTechniciansStats() {
  const container = document.getElementById("providerTechniciansStats");
  if (!container) return;

  const countByStatus = (statusValue) => state.technicians.filter((technician) => getTechnicianStatusValue(technician.status) === statusValue).length;

  const stats = [
    { icon: "fa-users", label: "Tecnicos", value: String(state.technicians.length) },
    { icon: "fa-user-check", label: "Activos", value: String(countByStatus(TECHNICIAN_STATUS_VALUES.Active)) },
    { icon: "fa-user-lock", label: "Restringidos", value: String(countByStatus(TECHNICIAN_STATUS_VALUES.Restricted)) },
    { icon: "fa-user-slash", label: "Inactivos", value: String(countByStatus(TECHNICIAN_STATUS_VALUES.Inactive)) }
  ];

  container.innerHTML = stats.map((stat) => `
    <div class="provider-stat">
      <i class="fas ${escapeHtml(stat.icon)}" aria-hidden="true"></i>
      <span>
        <strong>${escapeHtml(stat.value)}</strong>
        <small>${escapeHtml(stat.label)}</small>
      </span>
    </div>
  `).join("");
}

function renderTechnicians() {
  const container = document.getElementById("providerTechniciansList");
  if (!container) return;

  renderTechniciansStats();

  if (!state.technicians.length) {
    container.innerHTML = renderProviderEmptyState({
      icon: "fa-user-plus",
      title: "Todavia no hay tecnicos",
      message: "Da de alta al primer tecnico para poder recibir y asignar ordenes en esta entidad."
    });
    return;
  }

  const searchTerm = filters.techniciansSearch.trim().toLowerCase();
  const visibleTechnicians = state.technicians.filter((technician) => {
    const publicProfile = technician.publicProfile;
    const fullName = publicProfile?.fullName || publicProfile?.FullName || "";
    const matchesStatus = !filters.techniciansStatus
      || String(getTechnicianStatusValue(technician.status)) === String(filters.techniciansStatus);
    const matchesSearch = !searchTerm
      || `${fullName} ${technician.specialty || ""}`.toLowerCase().includes(searchTerm);
    return matchesStatus && matchesSearch;
  });

  if (!visibleTechnicians.length) {
    container.innerHTML = renderProviderEmptyState({
      icon: "fa-filter-circle-xmark",
      title: "Sin resultados",
      message: "Ningun tecnico coincide con el filtro o la busqueda actual."
    });
    return;
  }

  container.innerHTML = visibleTechnicians.map((technician) => {
    const publicProfile = technician.publicProfile;
    const fullName = publicProfile?.fullName || publicProfile?.FullName || `Tecnico ${technician.id.slice(0, 8)}`;
    const statusValue = getTechnicianStatusValue(technician.status);
    const canActivate = statusValue !== TECHNICIAN_STATUS_VALUES.Active;
    const canRestrict = statusValue === TECHNICIAN_STATUS_VALUES.Active;
    const canInactivate = statusValue !== TECHNICIAN_STATUS_VALUES.Inactive;
    const assignedActiveOrders = state.orders.filter((order) => {
      return order.technicianId === technician.id && isActiveOrderStatus(getStatusValue(order.status));
    }).length;

    return `
      <article class="provider-technician-card is-${escapeHtml(getTechnicianStatusBadgeClass(technician.status).replace("is-", ""))}">
        <div class="provider-technician-card__head">
          <span class="provider-technician-card__avatar" aria-hidden="true">${escapeHtml(getInitials(fullName))}</span>
          <div class="provider-technician-card__identity">
            <h4>${escapeHtml(fullName)}</h4>
            <p>${escapeHtml(technician.specialty || "Sin especialidad")}</p>
          </div>
          <span class="provider-status-badge ${getTechnicianStatusBadgeClass(technician.status)}">${escapeHtml(getTechnicianStatusLabel(technician.status))}</span>
        </div>

        <div class="provider-technician-card__stats">
          <div>
            <strong>${escapeHtml(String(assignedActiveOrders))}</strong>
            <small>Ordenes activas</small>
          </div>
          <div>
            <strong>${escapeHtml(technician.createdAtUtc ? formatArgentinaDate(technician.createdAtUtc, { weekday: undefined, day: "2-digit", month: "2-digit", year: "2-digit" }) : "-")}</strong>
            <small>Alta en la entidad</small>
          </div>
          <div>
            <strong>${escapeHtml(technician.updatedAtUtc ? formatArgentinaDate(technician.updatedAtUtc, { weekday: undefined, day: "2-digit", month: "2-digit", year: "2-digit" }) : "-")}</strong>
            <small>Ultimo cambio</small>
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

  const pendingCount = state.pendingCancellationRequests.length;
  const wrapper = document.getElementById("providerCancellationsCard");
  const counter = document.getElementById("providerCancellationsCount");

  // La tarjeta solo existe cuando hay algo que resolver: antes ocupaba el tope
  // de la bandeja incluso vacia.
  if (wrapper) wrapper.classList.toggle("hidden", pendingCount === 0);
  if (counter) counter.textContent = pendingCount === 1 ? "1 solicitud" : `${pendingCount} solicitudes`;

  if (!pendingCount) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = state.pendingCancellationRequests.map((request) => {
    const order = state.orders.find((entry) => entry.id === request.serviceOrderId);
    const technician = order ? getTechnicianInfo(order.technicianId) : null;
    const technicianName = technician?.publicProfile?.fullName || technician?.publicProfile?.FullName || "Tecnico asignado";
    const clientName = order ? getClientDisplayName(order.clientId) : "Cliente";

    return `
      <article class="provider-cancellation-card">
        <div class="provider-cancellation-card__head">
          <span class="provider-cancellation-card__avatar" aria-hidden="true">${escapeHtml(getInitials(technicianName))}</span>
          <div class="provider-cancellation-card__identity">
            <strong>${escapeHtml(technicianName)}</strong>
            <span>pidio cancelar la orden <span class="provider-order-card__ref">#${escapeHtml(request.serviceOrderId.slice(0, 8))}</span> de ${escapeHtml(clientName)}</span>
          </div>
          <span class="provider-cancellation-card__reason">${escapeHtml(getCancellationReasonLabel(request.reason))}</span>
        </div>
        ${request.note ? `<p class="provider-cancellation-card__note">${escapeHtml(request.note)}</p>` : ""}
        <div class="provider-cancellation-card__foot">
          <span class="provider-cancellation-card__time">
            <i class="fas fa-clock" aria-hidden="true"></i>
            Solicitada el ${escapeHtml(formatDateTime(request.requestedAtUtc))}
          </span>
          <button class="btn btn-primary provider-open-order" data-order-id="${escapeHtml(request.serviceOrderId)}">
            <i class="fas fa-gavel" aria-hidden="true"></i>
            Resolver
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
    const technicianCount = state.technicians.length;
    const activeOrders = state.orders.filter((order) => isActiveOrderStatus(getStatusValue(order.status))).length;

    providerCard.innerHTML = `
      <div class="provider-entity-head">
        <span class="provider-entity-avatar" aria-hidden="true">${escapeHtml(getInitials(state.providerEntity?.name ?? state.providerEntity?.Name ?? "Entidad"))}</span>
        <div>
          <strong>${escapeHtml(state.providerEntity?.name ?? state.providerEntity?.Name ?? "Sin nombre")}</strong>
          <span class="provider-status-badge ${providerIsEnabled ? "is-active" : "is-inactive"}">
            <i class="fas ${providerIsEnabled ? "fa-circle-check" : "fa-circle-pause"}" aria-hidden="true"></i>
            ${providerIsEnabled ? "Habilitada" : "Deshabilitada"}
          </span>
        </div>
      </div>
      <div class="provider-meta-list">
        <div class="provider-meta-item">
          <strong>Staff tecnico</strong>
          <span>${escapeHtml(String(technicianCount))} tecnico${technicianCount === 1 ? "" : "s"}</span>
        </div>
        <div class="provider-meta-item">
          <strong>Ordenes activas</strong>
          <span>${escapeHtml(String(activeOrders))}</span>
        </div>
        <div class="provider-meta-item">
          <strong>Ordenes historicas</strong>
          <span>${escapeHtml(String(state.orders.length))}</span>
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
    hero.innerHTML = renderProviderEmptyState({
      icon: "fa-clipboard-list",
      title: "Ninguna orden seleccionada",
      message: "Elegi una orden de la bandeja para ver su trazabilidad, evidencia y acciones."
    });
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

  const tone = getOrderStatusTone(order.status);
  const timingBadge = getOrderTimingBadge(order);
  const durationMinutes = getOrderDurationMinutes(order);
  const servicesCount = order.items.length;
  const hasSchedule = Boolean(order.scheduledStartAtUtc) && !Number.isNaN(new Date(order.scheduledStartAtUtc).getTime());
  const hasPrimaryAction = canApprove || canConfirm || canDownloadReceipt;

  hero.innerHTML = `
    <article class="provider-detail-hero is-${escapeHtml(tone)}">
      <header class="provider-detail-hero__head">
        <div class="provider-detail-hero__identity">
          <p class="provider-order-card__meta">
            <span class="provider-order-card__ref">#${escapeHtml(String(order.id).slice(0, 8))}</span>
            <span>${escapeHtml(`${servicesCount} servicio${servicesCount === 1 ? "" : "s"}`)}</span>
            ${order.createdAtUtc ? `<span>Creada el ${escapeHtml(formatDateTime(order.createdAtUtc))}</span>` : ""}
          </p>
          <h3>${escapeHtml(order.items.map((item) => item.serviceName).join(", ") || "Orden de servicio")}</h3>
        </div>
        <div class="provider-order-card__badges">
          <span class="provider-order-card__status">
            <i class="fas ${escapeHtml(getOrderStatusIcon(order.status))}" aria-hidden="true"></i>
            ${escapeHtml(getStatusLabel(order.status))}
          </span>
          ${timingBadge ? `
            <span class="provider-order-card__timing is-${escapeHtml(timingBadge.tone)}">
              <i class="fas ${escapeHtml(timingBadge.icon)}" aria-hidden="true"></i>
              ${escapeHtml(timingBadge.label)}
            </span>` : ""}
        </div>
      </header>

      <div class="provider-order-card__grid">
        <div class="provider-order-card__item is-primary">
          <span class="provider-order-card__label"><i class="fas fa-calendar-day" aria-hidden="true"></i> Visita programada</span>
          ${hasSchedule ? `
            <strong>${escapeHtml(formatArgentinaDate(order.scheduledStartAtUtc, { weekday: "long", day: "2-digit", month: "long" }))}</strong>
            <span class="provider-order-card__value-sub">
              ${escapeHtml(formatArgentinaTime(order.scheduledStartAtUtc, { hourCycle: "h23" }))} a ${escapeHtml(formatArgentinaTime(order.scheduledEndAtUtc, { hourCycle: "h23" }))}
              ${durationMinutes ? ` &middot; ${escapeHtml(formatCompactDuration(durationMinutes))}` : ""}
            </span>` : "<strong>Sin fecha asignada</strong>"}
        </div>
        <div class="provider-order-card__item">
          <span class="provider-order-card__label"><i class="fas fa-user" aria-hidden="true"></i> Cliente</span>
          <strong>${escapeHtml(clientName)}</strong>
          <span class="provider-order-card__value-sub">${escapeHtml(order.address || "Sin direccion registrada")}</span>
        </div>
        <div class="provider-order-card__item">
          <span class="provider-order-card__label"><i class="fas fa-user-gear" aria-hidden="true"></i> Tecnico asignado</span>
          <div class="provider-order-card__technician">
            <span class="provider-order-card__avatar" aria-hidden="true">${escapeHtml(getInitials(technicianName))}</span>
            <span>
              <strong>${escapeHtml(technicianName)}</strong>
              <span class="provider-order-card__value-sub">${escapeHtml(technician?.specialty || "Sin especialidad")}</span>
            </span>
          </div>
        </div>
        <div class="provider-order-card__item is-amount">
          <span class="provider-order-card__label"><i class="fas fa-receipt" aria-hidden="true"></i> Total</span>
          <strong>${escapeHtml(formatCurrency(order.totalAmount))}</strong>
        </div>
      </div>

      ${renderOrderProgressTrack(order)}

      ${order.exceptionReason ? `
        <div class="provider-order-card__exception">
          <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
          <div>
            <strong>Motivo de la excepcion</strong>
            <p>${escapeHtml(order.exceptionReason)}</p>
          </div>
        </div>` : ""}

      ${hasPrimaryAction ? `
        <div class="provider-detail-hero__actions">
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
        </div>` : ""}

      <div class="provider-reassign ${canReassign && assignableTechnicians.length ? "" : "is-disabled"}">
        <div class="provider-reassign__head">
          <i class="fas fa-right-left" aria-hidden="true"></i>
          <div>
            <strong>Reasignar tecnico</strong>
            <p>${escapeHtml(reassignNote)}</p>
          </div>
        </div>
        ${canReassign && assignableTechnicians.length ? `
          <div class="provider-reassign__controls">
            <select id="providerReassignTechnicianSelect" class="provider-technician-select" aria-label="Tecnico para reasignar">
              <option value="">Seleccionar tecnico</option>
              ${assignableTechnicians.map((assignableTechnician) => {
                const publicProfile = assignableTechnician.publicProfile;
                const fullName = publicProfile?.fullName || publicProfile?.FullName || `Tecnico ${assignableTechnician.id.slice(0, 8)}`;
                return `<option value="${escapeHtml(assignableTechnician.id)}">${escapeHtml(fullName)} - ${escapeHtml(assignableTechnician.specialty)}</option>`;
              }).join("")}
            </select>
            <button class="btn btn-secondary" id="providerReassignOrderBtn">
              <i class="fas fa-random"></i>
              Reasignar
            </button>
          </div>` : ""}
      </div>
    </article>
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
    ? `
      <ul class="provider-item-list">
        ${order.items.map((item) => `
          <li class="provider-item-row">
            <span class="provider-item-row__qty">${escapeHtml(String(item.quantity))}x</span>
            <span class="provider-item-row__name">
              <strong>${escapeHtml(item.serviceName)}</strong>
              <small>${escapeHtml(formatCurrency(item.unitPrice))} por unidad</small>
            </span>
            <span class="provider-item-row__amount">${escapeHtml(formatCurrency(item.totalPrice))}</span>
          </li>
        `).join("")}
      </ul>
      <div class="provider-item-total">
        <span>Total de la orden</span>
        <strong>${escapeHtml(formatCurrency(order.totalAmount))}</strong>
      </div>`
    : '<p class="request-empty-text">Todavia no hay items para mostrar.</p>';

  historyContainer.innerHTML = state.currentOrderHistory.length
    ? `<ol class="provider-timeline">
        ${state.currentOrderHistory
          .slice()
          .sort((left, right) => new Date(right.changedAtUtc) - new Date(left.changedAtUtc))
          .map((entry) => `
            <li class="provider-timeline__entry is-${escapeHtml(getOrderStatusTone(entry.newStatus))}">
              <span class="provider-timeline__dot" aria-hidden="true"></span>
              <div class="provider-timeline__body">
                <div class="provider-timeline__head">
                  <strong>${escapeHtml(getStatusLabel(entry.newStatus))}</strong>
                  <span>${escapeHtml(formatDateTime(entry.changedAtUtc))}</span>
                </div>
                ${entry.previousStatus ? `<span class="provider-timeline__transition">${escapeHtml(getStatusLabel(entry.previousStatus))} &rarr; ${escapeHtml(getStatusLabel(entry.newStatus))}</span>` : ""}
                ${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ""}
              </div>
            </li>
          `).join("")}
      </ol>`
    : '<p class="request-empty-text">Todavia no hay historial para mostrar.</p>';

  cancellationContainer.innerHTML = state.currentOrderCancellationRequests.length
    ? state.currentOrderCancellationRequests
        .slice()
        .sort((left, right) => new Date(right.requestedAtUtc) - new Date(left.requestedAtUtc))
        .map((entry) => {
          const isPending = String(entry.status) === "1" || entry.status === "Pending";

          return `
          <article class="provider-cancellation-card ${isPending ? "is-pending" : "is-resolved"}">
            <div class="provider-cancellation-card__head">
              <span class="provider-cancellation-card__avatar" aria-hidden="true">${escapeHtml(getInitials(technicianName))}</span>
              <div class="provider-cancellation-card__identity">
                <strong>${escapeHtml(technicianName)}</strong>
                <span>Solicitada el ${escapeHtml(formatDateTime(entry.requestedAtUtc))}</span>
              </div>
              <span class="provider-cancellation-card__reason">${escapeHtml(getCancellationReasonLabel(entry.reason))}</span>
            </div>

            <p class="provider-cancellation-card__note">${escapeHtml(entry.note || "Sin observaciones del tecnico.")}</p>

            ${isPending ? `
              <div class="provider-cancellation-card__resolution">
                <p class="provider-cancellation-card__prompt">Aprobar cancela la orden. Rechazar la mantiene viva, y podes reasignarla a otro tecnico en el mismo paso.</p>
                <div class="provider-cancellation-card__buttons">
                  <button type="button" class="btn btn-primary provider-approve-cancellation" data-request-id="${escapeHtml(entry.id)}">
                    <i class="fas fa-check" aria-hidden="true"></i>
                    Aprobar cancelacion
                  </button>
                  <button type="button" class="btn btn-secondary provider-reject-cancellation" data-request-id="${escapeHtml(entry.id)}">
                    <i class="fas fa-xmark" aria-hidden="true"></i>
                    Rechazar
                  </button>
                </div>
                ${assignableTechnicians.length ? `
                  <div class="provider-cancellation-card__reassign">
                    <select class="provider-technician-select" data-cancellation-reassign-select="${escapeHtml(entry.id)}" aria-label="Tecnico para reasignar">
                      <option value="">Seleccionar tecnico para reasignar</option>
                      ${assignableTechnicians.map((assignableTechnician) => {
                        const publicProfile = assignableTechnician.publicProfile;
                        const fullName = publicProfile?.fullName || publicProfile?.FullName || `Tecnico ${assignableTechnician.id.slice(0, 8)}`;
                        return `<option value="${escapeHtml(assignableTechnician.id)}">${escapeHtml(fullName)} - ${escapeHtml(assignableTechnician.specialty)}</option>`;
                      }).join("")}
                    </select>
                    <button type="button" class="btn btn-secondary provider-reject-reassign-cancellation" data-request-id="${escapeHtml(entry.id)}">
                      <i class="fas fa-random" aria-hidden="true"></i>
                      Rechazar y reasignar
                    </button>
                  </div>`
                  : '<p class="provider-inline-note">No hay tecnicos alternativos activos para rechazar y reasignar.</p>'}
              </div>`
              : `
              <div class="provider-cancellation-card__foot">
                <span class="provider-count-badge ${String(entry.status) === "2" || entry.status === "Approved" ? "is-danger" : ""}">${escapeHtml(getRequestStatusLabel(entry.status))}</span>
                ${entry.reviewedAtUtc ? `<span class="provider-cancellation-card__time"><i class="fas fa-gavel" aria-hidden="true"></i> Resuelta el ${escapeHtml(formatDateTime(entry.reviewedAtUtc))}</span>` : ""}
              </div>
              ${entry.resolutionNote ? `<p class="provider-cancellation-card__note">${escapeHtml(entry.resolutionNote)}</p>` : ""}`}
          </article>
        `;
        }).join("")
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
  renderOrdersInto("providerOrdersList", { limit: 4, focusMode: true });
  renderProviderOrdersSection();
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
    setTechnicianModalOpen(false);
    showAppFeedback("Tecnico creado y asociado a la entidad. Si el SMTP sigue deshabilitado, el codigo de verificacion quedo logueado en la consola de AuthMS.", {
      type: "success",
      title: "Tecnico creado"
    });
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
  // Las ordenes se pintan en paralelo con esta carga: sin este repintado
  // quedan con el nombre de tecnico de respaldo ("Tecnico aaaaaaaa").
  renderOrdersInto("providerOrdersList", { limit: 4, focusMode: true });
  renderProviderOrdersSection();
  renderPendingCancellationRequests();
  renderOrderDetail();
}

async function loadClientProfiles() {
  const rawProfiles = await FrontGateway.directory.getClientProfilesByProvider(state.providerAdminProfile.providerEntityId);
  const profiles = rawProfiles.map(normalizeClientProfile);
  state.clientProfilesById = new Map(profiles.map((profile) => [profile.id, profile]));

  renderOrdersInto("providerOrdersList", { limit: 4, focusMode: true });
  renderProviderOrdersSection();
  renderPendingCancellationRequests();
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

function setTechnicianModalOpen(isOpen) {
  const modal = document.getElementById("provider-technician-modal");
  if (!modal) return;

  modal.classList.toggle("hidden", !isOpen);
  modal.setAttribute("aria-hidden", isOpen ? "false" : "true");
  document.body.classList.toggle("provider-modal-open", isOpen);

  if (isOpen) {
    document.getElementById("providerTechnicianFirstName")?.focus();
    return;
  }

  resetTechnicianForm();
}

function setupTechnicianModal() {
  const modal = document.getElementById("provider-technician-modal");
  if (!modal) return;

  document.getElementById("providerOpenTechnicianModal")?.addEventListener("click", () => setTechnicianModalOpen(true));

  modal.querySelectorAll("[data-provider-modal-close]").forEach((button) => {
    button.addEventListener("click", () => setTechnicianModalOpen(false));
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) setTechnicianModalOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) {
      setTechnicianModalOpen(false);
    }
  });
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

  const ordersSearch = document.getElementById("providerOrdersSearch");
  const ordersStatusFilter = document.getElementById("providerOrdersStatusFilter");
  const techniciansSearch = document.getElementById("providerTechniciansSearch");
  const techniciansStatusFilter = document.getElementById("providerTechniciansStatusFilter");

  ordersSearch?.addEventListener("input", () => {
    filters.ordersSearch = ordersSearch.value;
    renderProviderOrdersSection();
  });

  ordersStatusFilter?.addEventListener("change", () => {
    filters.ordersStatus = ordersStatusFilter.value;
    renderProviderOrdersSection();
  });

  techniciansSearch?.addEventListener("input", () => {
    filters.techniciansSearch = techniciansSearch.value;
    renderTechnicians();
  });

  techniciansStatusFilter?.addEventListener("change", () => {
    filters.techniciansStatus = techniciansStatusFilter.value;
    renderTechnicians();
  });

  setupTechnicianModal();

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
