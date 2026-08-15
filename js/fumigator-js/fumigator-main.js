import { FrontGateway } from "../api.js";
import {
  ARGENTINA_TIME_ZONE,
  argentinaDateTimeToUtcIso,
  formatArgentinaDate,
  formatArgentinaDateTime,
  formatArgentinaTime,
  getArgentinaDateInputValue,
  getArgentinaRangeEndUtcIso,
  getArgentinaRangeStartUtcIso,
  getArgentinaTimeInputValue,
  shiftArgentinaDate
} from "../utils/argentina-time.js";
import {
  confirmAppAction,
  decorateDialog,
  setActiveNavItems,
  showAppFeedback,
  syncDialogVisibility,
  syncMenuExpandedState
} from "../utils/app-shell-ui.js";
import { ensureAuthorizedPage, isAuthRedirectError } from "../utils/session-guard.js";
import {
  ORDER_PROGRESS_STEPS,
  getInitials,
  getOrderProgressRank,
  getOrderStatusIcon,
  getOrderStatusTone as getOrderTone,
  getOrderTimingBadge as getSharedOrderTimingBadge
} from "../utils/order-presentation.js";

// El tecnico usa etiquetas cortas: el contexto de la tarjeta ya es una visita.
function getOrderTimingBadge(order) {
  return getSharedOrderTimingBadge(order, { compact: true });
}

const SECTION_IDS = {
  inicio: "mainDashboardSection",
  agenda: "technicianAgendaSection",
  ordenes: "technicianOrdersSection",
  ejecucion: "technicianExecutionSection",
  disponibilidad: "technicianAvailabilitySection",
  perfil: "fumigatorProfileSection"
};

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
  AdverseWeather: "Clima adverso",
  1: "Falta de insumos",
  2: "Clima adverso"
};

const REQUEST_STATUS_LABELS = {
  Pending: "Pendiente",
  Approved: "Aprobada",
  Rejected: "Rechazada",
  1: "Pendiente",
  2: "Aprobada",
  3: "Rechazada"
};

const state = {
  user: null,
  technicianProfile: null,
  currentProviderEntity: null,
  clientNamesById: new Map(),
  availableProviders: [],
  providerChangeRequests: [],
  availability: [],
  editingAvailabilityId: null,
  absences: [],
  editingAbsenceId: null,
  orders: [],
  currentOrderDetail: null,
  currentOrderHistory: [],
  currentOrderEvidence: [],
  currentOrderCancellationRequests: [],
  currentOrderEvidencePreviewUrls: new Map(),
  orderActionFeedback: null,
  availabilityView: "availability",
  agendaWeekStart: null,
  agendaDayDate: null,
  agendaDayOrigin: "agenda-week",
  agendaMonthStart: null,
  bulkWeekStart: null,
  bulkSelectedDates: new Set(),
  bulkLoadedUntil: null
};

function isGuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((char) => "%" + ("00" + char.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("No se pudo parsear el JWT del tecnico.", error);
    return null;
  }
}

function getClaimValue(payload, keys) {
  if (!payload) return null;
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value) && value.length > 0) return value[0];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
}

function getStoredUser() {
  try {
    const rawUser = localStorage.getItem("user");
    return rawUser ? JSON.parse(rawUser) : null;
  } catch (error) {
    console.warn("No se pudo leer el usuario almacenado.", error);
    return null;
  }
}

function getCurrentUserContext() {
  const token = localStorage.getItem("token");
  const storedUser = getStoredUser();
  const payload = token ? parseJwt(token) : null;

  const role = (storedUser?.role || storedUser?.Role || getClaimValue(payload, [
    "role",
    "Role",
    "roles",
    "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"
  ]) || "").toString();

  const userId = storedUser?.userId || storedUser?.UserId || getClaimValue(payload, [
    "sub",
    "userId",
    "UserId",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"
  ]);

  return {
    userId: typeof userId === "string" ? userId.trim() : null,
    role,
    firstName: storedUser?.firstName || storedUser?.FirstName || getClaimValue(payload, [
      "given_name",
      "firstName",
      "FirstName",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"
    ]) || "",
    lastName: storedUser?.lastName || storedUser?.LastName || getClaimValue(payload, [
      "family_name",
      "lastName",
      "LastName",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"
    ]) || "",
    email: storedUser?.email || storedUser?.Email || getClaimValue(payload, [
      "email",
      "Email",
      "userEmail",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
    ]) || ""
  };
}

function redirectToLogin() {
  window.location.href = "login.html";
}

function getPageRefs() {
  return {
    userBtn: document.getElementById("userBtn"),
    userDropdown: document.getElementById("userDropdown"),
    userMenu: document.getElementById("userMenu"),
    userMenuName: document.getElementById("userMenuName"),
    logoutBtn: document.getElementById("logoutBtn"),
    welcomeName: document.getElementById("welcome-name"),
    welcomeMessage: document.getElementById("welcome-message"),
    profileSection: document.getElementById("fumigatorProfileSection"),
    dashboardSection: document.getElementById("mainDashboardSection"),
    agendaSection: document.getElementById("technicianAgendaSection"),
    executionSection: document.getElementById("technicianExecutionSection"),
    ordersSection: document.getElementById("technicianOrdersSection"),
    availabilitySection: document.getElementById("technicianAvailabilitySection"),
    availabilitySubnav: document.getElementById("availabilitySubnav"),
    consultationsList: document.getElementById("consultations-list"),
    weeklySchedule: document.getElementById("weekly-schedule"),
    technicianAgendaList: document.getElementById("technicianAgendaList"),
    technicianExecutionList: document.getElementById("technicianExecutionList"),
    technicianOrdersOverview: document.getElementById("technicianOrdersOverview"),
    technicianOrdersList: document.getElementById("technicianOrdersList"),
    technicianOrderDetailView: document.getElementById("technicianOrderDetailView"),
    technicianOrderDetail: document.getElementById("technicianOrderDetail"),
    technicianBackToOrders: document.getElementById("technicianBackToOrders"),
    availabilityWeeklySummary: document.getElementById("availabilityWeeklySummary"),
    availabilityDaySummary: document.getElementById("availabilityDaySummary"),
    availabilityAgendaDate: document.getElementById("availabilityAgendaDate"),
    availabilityList: document.getElementById("availabilityList"),
    availabilityForm: document.getElementById("availabilityForm"),
    availabilityDate: document.getElementById("availabilityDate"),
    availabilityStartTime: document.getElementById("availabilityStartTime"),
    availabilityEndTime: document.getElementById("availabilityEndTime"),
    availabilitySubmitBtn: document.getElementById("availabilitySubmitBtn"),
    availabilityCancelEditBtn: document.getElementById("availabilityCancelEditBtn"),
    availabilityFeedback: document.getElementById("availabilityFeedback"),
    availabilityBulkPrevWeek: document.getElementById("availabilityBulkPrevWeek"),
    availabilityBulkNextWeek: document.getElementById("availabilityBulkNextWeek"),
    availabilityBulkWeekLabel: document.getElementById("availabilityBulkWeekLabel"),
    availabilityBulkStart: document.getElementById("availabilityBulkStart"),
    availabilityBulkEnd: document.getElementById("availabilityBulkEnd"),
    availabilityBulkDays: document.getElementById("availabilityBulkDays"),
    availabilityBulkSubmit: document.getElementById("availabilityBulkSubmit"),
    availabilityBulkSummary: document.getElementById("availabilityBulkSummary"),
    availabilityBulkResult: document.getElementById("availabilityBulkResult"),
    absenceForm: document.getElementById("absenceForm"),
    absenceDate: document.getElementById("absenceDate"),
    absenceStartTime: document.getElementById("absenceStartTime"),
    absenceEndTime: document.getElementById("absenceEndTime"),
    absenceReason: document.getElementById("absenceReason"),
    absenceSubmitBtn: document.getElementById("absenceSubmitBtn"),
    absenceCancelEditBtn: document.getElementById("absenceCancelEditBtn"),
    absenceFeedback: document.getElementById("absenceFeedback"),
    absenceList: document.getElementById("absenceList"),
    availabilityViewAvailability: document.getElementById("availabilityViewAvailability"),
    availabilityViewAbsences: document.getElementById("availabilityViewAbsences"),
    availabilityViewAgendaWeek: document.getElementById("availabilityViewAgendaWeek"),
    availabilityViewAgendaMonth: document.getElementById("availabilityViewAgendaMonth"),
    availabilityViewAgendaDay: document.getElementById("availabilityViewAgendaDay"),
    ordersToday: document.getElementById("orders-today"),
    activeOrders: document.getElementById("active-orders"),
    inProgressOrders: document.getElementById("in-progress-orders"),
    nextService: document.getElementById("next-service"),
    technicianCurrentProviderName: document.getElementById("technicianCurrentProviderName"),
    technicianProviderTargetSelect: document.getElementById("technicianProviderTargetSelect"),
    technicianProviderChangeNote: document.getElementById("technicianProviderChangeNote"),
    technicianProviderChangeForm: document.getElementById("technicianProviderChangeForm"),
    technicianProviderChangeSubmit: document.getElementById("technicianProviderChangeSubmit"),
    technicianProviderChangeFeedback: document.getElementById("technicianProviderChangeFeedback"),
    technicianProviderChangeRequests: document.getElementById("technicianProviderChangeRequests"),
    manageSchedule: document.getElementById("manageSchedule"),
    viewAgendaBtn: document.getElementById("viewAgendaBtn"),
    viewClients: document.getElementById("viewClients"),
    emitPrescription: document.getElementById("emitPrescription"),
    navItems: Array.from(document.querySelectorAll(".nav-item[data-section]"))
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getErrorMessage(error, fallbackMessage) {
  if (!error) return fallbackMessage;
  if (typeof error.message === "string" && error.message.trim() !== "") return error.message;
  if (typeof error.body === "string" && error.body.trim() !== "") return error.body;
  return fallbackMessage;
}

function formatDateTime(dateValue) {
  return formatArgentinaDateTime(dateValue, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDate(dateValue) {
  return formatArgentinaDate(dateValue);
}

function formatTime(dateValue) {
  // 24h en todo el panel, igual que cliente y proveedor (antes "03:00 p. m.").
  return formatArgentinaTime(dateValue, { hourCycle: "h23" });
}

function getArgentinaMinutesOfDay(dateValue) {
  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: ARGENTINA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(dateValue));

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return (hour * 60) + minute;
}

function formatMinutesOfDay(minutes) {
  const normalized = Math.max(0, Math.min(24 * 60, Number(minutes) || 0));
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function toDateInputValue(dateValue) {
  return getArgentinaDateInputValue(dateValue);
}

function toTimeInputValue(dateValue) {
  return getArgentinaTimeInputValue(dateValue);
}

function slotDurationLabel(startAtUtc, endAtUtc) {
  const minutes = Math.round((new Date(endAtUtc) - new Date(startAtUtc)) / 60000);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0 && remainingMinutes > 0) return `${hours} h ${remainingMinutes} min`;
  if (hours > 0) return `${hours} h`;
  return `${remainingMinutes} min`;
}

function formatDurationMinutes(totalMinutes) {
  const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0 && remainingMinutes > 0) return `${hours} h ${remainingMinutes} min`;
  if (hours > 0) return `${hours} h`;
  return `${remainingMinutes} min`;
}

function orderDurationLabel(order) {
  return slotDurationLabel(order.scheduledStartAtUtc, order.scheduledEndAtUtc);
}

function getProviderName(providerEntityId) {
  const provider = state.availableProviders.find((entry) => entry.id === providerEntityId)
    || (state.currentProviderEntity?.id === providerEntityId ? state.currentProviderEntity : null);
  return provider?.name || `Entidad ${shortenGuid(providerEntityId)}`;
}

function showProviderChangeFeedback(message = "", type = "info") {
  const refs = getPageRefs();
  const target = refs.technicianProviderChangeFeedback;
  if (!target) return;

  if (!message) {
    target.textContent = "";
    target.className = "profile-inline-feedback hidden";
    return;
  }

  target.textContent = message;
  target.className = `profile-inline-feedback is-${type}`;
}

function normalizeAvailabilitySlot(slot) {
  return {
    id: slot.id ?? slot.Id,
    technicianId: slot.technicianId ?? slot.TechnicianId,
    providerEntityId: slot.providerEntityId ?? slot.ProviderEntityId,
    startAtUtc: slot.startAtUtc ?? slot.StartAtUtc,
    endAtUtc: slot.endAtUtc ?? slot.EndAtUtc
  };
}

function normalizeAbsenceSlot(slot) {
  return {
    id: slot.id ?? slot.Id,
    technicianId: slot.technicianId ?? slot.TechnicianId,
    providerEntityId: slot.providerEntityId ?? slot.ProviderEntityId,
    startAtUtc: slot.startAtUtc ?? slot.StartAtUtc,
    endAtUtc: slot.endAtUtc ?? slot.EndAtUtc,
    reason: slot.reason ?? slot.Reason ?? ""
  };
}

function normalizeOrder(order) {
  return {
    id: order.id ?? order.Id,
    reservationId: order.reservationId ?? order.ReservationId ?? null,
    clientId: order.clientId ?? order.ClientId,
    providerEntityId: order.providerEntityId ?? order.ProviderEntityId,
    technicianId: order.technicianId ?? order.TechnicianId,
    scheduledStartAtUtc: order.scheduledStartAtUtc ?? order.ScheduledStartAtUtc,
    scheduledEndAtUtc: order.scheduledEndAtUtc ?? order.ScheduledEndAtUtc,
    totalAmount: order.totalAmount ?? order.TotalAmount ?? 0,
    status: order.status ?? order.Status,
    exceptionReason: order.exceptionReason ?? order.ExceptionReason ?? null,
    address: order.address ?? order.Address ?? null,
    createdAtUtc: order.createdAtUtc ?? order.CreatedAtUtc,
    items: Array.isArray(order.items ?? order.Items) ? (order.items ?? order.Items).map((item) => ({
      id: item.id ?? item.Id,
      serviceId: item.serviceId ?? item.ServiceId,
      serviceName: item.serviceName ?? item.ServiceName ?? "Servicio",
      unitPrice: item.unitPrice ?? item.UnitPrice ?? 0,
      quantity: item.quantity ?? item.Quantity ?? 1,
      totalPrice: item.totalPrice ?? item.TotalPrice ?? 0
    })) : []
  };
}

function normalizeOrderHistoryEntry(entry) {
  return {
    id: entry.id ?? entry.Id,
    previousStatus: entry.previousStatus ?? entry.PreviousStatus ?? null,
    newStatus: entry.newStatus ?? entry.NewStatus,
    changedAtUtc: entry.changedAtUtc ?? entry.ChangedAtUtc,
    changedByUserId: entry.changedByUserId ?? entry.ChangedByUserId ?? null,
    note: entry.note ?? entry.Note ?? null
  };
}

function normalizeOrderEvidence(evidence) {
  return {
    id: evidence.id ?? evidence.Id,
    serviceOrderId: evidence.serviceOrderId ?? evidence.ServiceOrderId,
    kind: evidence.kind ?? evidence.Kind,
    fileName: evidence.fileName ?? evidence.FileName ?? null,
    contentType: evidence.contentType ?? evidence.ContentType ?? null,
    fileSizeBytes: evidence.fileSizeBytes ?? evidence.FileSizeBytes ?? null,
    note: evidence.note ?? evidence.Note ?? null,
    recordedByUserId: evidence.recordedByUserId ?? evidence.RecordedByUserId ?? null,
    recordedAtUtc: evidence.recordedAtUtc ?? evidence.RecordedAtUtc,
    hasBinaryContent: evidence.hasBinaryContent ?? evidence.HasBinaryContent ?? false
  };
}

function normalizeProviderEntity(provider) {
  return {
    id: provider.id ?? provider.Id,
    name: provider.name ?? provider.Name ?? "Entidad",
    isEnabled: provider.isEnabled ?? provider.IsEnabled ?? false
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

function getOrderStatusLabel(status) {
  return ORDER_STATUS_LABELS[status] ?? String(status ?? "Sin estado");
}

function getOrderStatusValue(status) {
  if (typeof status === "number") return status;
  return ORDER_STATUS_VALUES[status] ?? null;
}

function getOrderStatusClass(status) {
  const label = getOrderStatusLabel(status)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
  return `status-${label}`;
}

function getEvidenceKindLabel(kind) {
  return EVIDENCE_KIND_LABELS[kind] ?? String(kind ?? "Evidencia");
}

function getCancellationReasonLabel(reason) {
  return CANCELLATION_REASON_LABELS[reason] ?? String(reason ?? "Motivo");
}

function getRequestStatusLabel(status) {
  return REQUEST_STATUS_LABELS[status] ?? String(status ?? "Estado");
}

function isImageEvidence(evidence) {
  return Boolean(evidence?.hasBinaryContent && /^image\//i.test(String(evidence?.contentType || "")));
}

function formatCurrency(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(Number(value ?? 0));
}

function formatFileSize(bytes) {
  const size = Number(bytes ?? 0);
  if (!Number.isFinite(size) || size <= 0) return "Sin archivo";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function shortenGuid(value) {
  if (!value) return "Sin dato";
  const text = String(value);
  return text.length > 8 ? text.slice(0, 8) : text;
}

function setOrderActionFeedback(message = "", type = "info") {
  state.orderActionFeedback = message ? { message, type } : null;
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
  document.querySelectorAll("[data-evidence-preview-id]").forEach((element) => {
    const evidenceId = element.dataset.evidencePreviewId;
    const previewUrl = state.currentOrderEvidencePreviewUrls.get(evidenceId);
    if (!previewUrl) return;

    element.classList.remove("is-loading");
    element.innerHTML = `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(element.dataset.evidencePreviewAlt || "Vista previa de evidencia")}">`;
  });
}

function groupOrdersByDate(orders) {
  return orders.reduce((accumulator, order) => {
    const key = toDateInputValue(order.scheduledStartAtUtc);
    if (!accumulator.has(key)) accumulator.set(key, []);
    accumulator.get(key).push(order);
    return accumulator;
  }, new Map());
}

function showAvailabilityFeedback(message, type = "info") {
  const refs = getPageRefs();
  if (!refs.availabilityFeedback) return;

  refs.availabilityFeedback.textContent = message || "";
  refs.availabilityFeedback.classList.toggle("hidden", !message);
  refs.availabilityFeedback.classList.remove("is-info", "is-success", "is-error");
  if (message) {
    refs.availabilityFeedback.classList.add(type === "error" ? "is-error" : type === "success" ? "is-success" : "is-info");
  }
}

function showAbsenceFeedback(message, type = "info") {
  const refs = getPageRefs();
  if (!refs.absenceFeedback) return;

  refs.absenceFeedback.textContent = message || "";
  refs.absenceFeedback.classList.toggle("hidden", !message);
  refs.absenceFeedback.classList.remove("is-info", "is-success", "is-error");
  if (message) {
    refs.absenceFeedback.classList.add(type === "error" ? "is-error" : type === "success" ? "is-success" : "is-info");
  }
}

function resetAvailabilityForm() {
  const refs = getPageRefs();
  state.editingAvailabilityId = null;

  refs.availabilityForm?.reset();
  if (refs.availabilityDate) refs.availabilityDate.value = getArgentinaDateInputValue();
  if (refs.availabilityStartTime) refs.availabilityStartTime.value = "08:00";
  if (refs.availabilityEndTime) refs.availabilityEndTime.value = "12:00";
  if (refs.availabilitySubmitBtn) {
    refs.availabilitySubmitBtn.textContent = "Guardar cambios";
  }
  refs.availabilityForm?.classList.add("hidden");
  showAvailabilityFeedback("");
}

function resetAbsenceForm() {
  const refs = getPageRefs();
  state.editingAbsenceId = null;

  refs.absenceForm?.reset();
  if (refs.absenceDate) refs.absenceDate.value = getArgentinaDateInputValue();
  if (refs.absenceStartTime) refs.absenceStartTime.value = "08:00";
  if (refs.absenceEndTime) refs.absenceEndTime.value = "12:00";
  if (refs.absenceSubmitBtn) {
    refs.absenceSubmitBtn.textContent = "Guardar ausencia";
  }
  refs.absenceCancelEditBtn?.classList.add("hidden");
  showAbsenceFeedback("");
}

function setSection(sectionKey) {
  const refs = getPageRefs();
  const targetId = SECTION_IDS[sectionKey] || SECTION_IDS.inicio;

  [refs.dashboardSection, refs.agendaSection, refs.executionSection, refs.ordersSection, refs.availabilitySection, refs.profileSection]
    .filter(Boolean)
    .forEach((section) => section.classList.add("hidden"));

  const targetSection = document.getElementById(targetId);
  targetSection?.classList.remove("hidden");

  if (sectionKey === "ordenes") {
    setTechnicianOrdersMode("list");
  }

  if (sectionKey === "disponibilidad") {
    setAvailabilityView(state.availabilityView);
  }

  setActiveNavItems(refs.navItems, sectionKey);
}

// El panel navegaba solo por click: los href="#seccion" cambiaban la URL pero
// nadie la leia, asi que refrescar o compartir un link siempre caia en Inicio.
function parseTechnicianSection() {
  const hash = window.location.hash.replace(/^#/, "").trim();
  return SECTION_IDS[hash] ? hash : "inicio";
}

function navigateToSection(sectionKey) {
  const target = SECTION_IDS[sectionKey] ? sectionKey : "inicio";

  if (window.location.hash === `#${target}`) {
    setSection(target);
    return;
  }

  window.location.hash = `#${target}`;
}

function setTechnicianOrdersMode(mode = "list") {
  const refs = getPageRefs();
  refs.technicianOrdersOverview?.classList.toggle("hidden", mode !== "list");
  refs.technicianOrderDetailView?.classList.toggle("hidden", mode !== "detail");
}

/* --- Agendas semanal y mensual --- */

/**
 * Todo lo que pasa un dia, en el mismo formato que usa la lista de bloques.
 * Tener una sola funcion evita que las tres vistas cuenten distinto.
 */
function getDayLoad(dateValue) {
  const bloques = state.availability.filter((slot) => toDateInputValue(slot.startAtUtc) === dateValue);
  const ausencias = state.absences.filter((absence) => toDateInputValue(absence.startAtUtc) === dateValue);
  const ordenes = state.orders.filter((order) =>
    order.scheduledStartAtUtc && toDateInputValue(order.scheduledStartAtUtc) === dateValue);

  const minutos = (items, desde, hasta) => items.reduce((total, item) =>
    total + (new Date(item[hasta]) - new Date(item[desde])) / 60000, 0);

  return {
    bloques,
    ausencias,
    ordenes,
    minutosLibres: minutos(bloques, "startAtUtc", "endAtUtc"),
    minutosOcupados: minutos(ordenes, "scheduledStartAtUtc", "scheduledEndAtUtc"),
    tramos: buildDayTimelineSegments(dateValue, bloques, ausencias, ordenes)
  };
}

function renderTimelineTrack(tramos) {
  return `
    <div class="avail-day__track">
      ${tramos.map((tramo) => `
        <span class="avail-day__seg is-${tramo.tipo}"
          style="left:${tramo.desde.toFixed(2)}%;width:${tramo.ancho.toFixed(2)}%"
          title="${escapeHtml(tramo.etiqueta)}"></span>
      `).join("")}
    </div>
  `;
}

function timelineLegend() {
  return `
    <p class="avail-days__legend">
      <span><i class="avail-days__key is-libre"></i> Disponible</span>
      <span><i class="avail-days__key is-ocupado"></i> Con orden asignada</span>
      <span><i class="avail-days__key is-ausencia"></i> Ausencia</span>
    </p>
  `;
}

/* --- Semana --- */

function renderAgendaWeek() {
  const contenedor = document.getElementById("availabilityWeeklySummary");
  const etiqueta = document.getElementById("agendaWeekLabel");
  if (!contenedor) return;

  const inicio = state.agendaWeekStart || getWeekStart(getArgentinaDateInputValue());
  const dias = Array.from({ length: 7 }, (_, i) => shiftArgentinaDate(inicio, i));

  if (etiqueta) {
    const fin = dias[6];
    const nombreMes = (fecha) => formatArgentinaDate(`${fecha}T12:00:00Z`, { weekday: undefined, day: undefined, month: "long" });
    const [, mesIni] = inicio.split("-");
    const [anioFin, mesFin, diaFin] = fin.split("-");
    etiqueta.textContent = mesIni === mesFin
      ? `${Number(inicio.split("-")[2])} al ${Number(diaFin)} de ${nombreMes(fin)} de ${anioFin}`
      : `${Number(inicio.split("-")[2])} de ${nombreMes(inicio)} al ${Number(diaFin)} de ${nombreMes(fin)}`;
  }

  const hoy = getArgentinaDateInputValue();

  contenedor.innerHTML = `
    <div class="agenda-week__rows">
      ${dias.map((dia) => {
        const carga = getDayLoad(dia);
        const esHoy = dia === hoy;
        const nombre = formatArgentinaDate(`${dia}T12:00:00Z`, { weekday: "short", day: "2-digit", month: undefined, year: undefined });

        return `
          <article class="agenda-week__row is-clickable${esHoy ? " is-today" : ""}${carga.bloques.length ? "" : " is-empty"}" data-day="${escapeHtml(dia)}" role="button" tabindex="0" aria-label="${escapeHtml(`Ver el detalle del ${formatDate(`${dia}T12:00:00Z`)}`)}">
            <div class="agenda-week__day">
              <strong>${escapeHtml(nombre)}</strong>
              ${esHoy ? '<span class="agenda-week__today">hoy</span>' : ""}
            </div>
            <div class="agenda-week__body">
              ${carga.tramos.length
                ? renderTimelineTrack(carga.tramos)
                : '<p class="agenda-week__none">Sin disponibilidad cargada</p>'}
            </div>
            <div class="agenda-week__stat">
              ${carga.bloques.length ? escapeHtml(formatDurationMinutes(carga.minutosLibres)) : "—"}
              ${carga.ordenes.length ? `<small>${escapeHtml(String(carga.ordenes.length))} ${carga.ordenes.length === 1 ? "orden" : "ordenes"}</small>` : ""}
            </div>
          </article>
        `;
      }).join("")}
    </div>
    <div class="agenda-week__row agenda-week__row--scale">
      <span></span>
      <div class="agenda-week__scale">
      ${[8, 12, 16, 20].map((hora) => {
        const izquierda = ((hora - TIMELINE_START_HOUR) / TIMELINE_HOURS) * 100;
        return `<span class="avail-day__tick" style="left:${izquierda}%">${String(hora).padStart(2, "0")}</span>`;
      }).join("")}
      </div>
      <span></span>
    </div>
    ${timelineLegend()}
  `;
}

/* --- Mes --- */

function renderAgendaMonth() {
  const contenedor = document.getElementById("availabilityMonthlySummary");
  const etiqueta = document.getElementById("agendaMonthLabel");
  if (!contenedor) return;

  const referencia = state.agendaMonthStart || `${getArgentinaDateInputValue().slice(0, 7)}-01`;
  const [anio, mes] = referencia.split("-").map(Number);

  if (etiqueta) {
    etiqueta.textContent = formatArgentinaDate(`${referencia}T12:00:00Z`, {
      weekday: undefined,
      day: undefined,
      month: "long",
      year: "numeric"
    });
  }

  const diasDelMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const primerDia = `${referencia.slice(0, 8)}01`;
  // La grilla arranca en lunes: se rellena con los huecos previos.
  const offsetInicial = (new Date(Date.UTC(anio, mes - 1, 1, 12)).getUTCDay() + 6) % 7;

  const celdas = [];
  for (let i = 0; i < offsetInicial; i++) celdas.push(null);
  for (let d = 1; d <= diasDelMes; d++) {
    celdas.push(`${referencia.slice(0, 8)}${String(d).padStart(2, "0")}`);
  }

  const hoy = getArgentinaDateInputValue();

  contenedor.innerHTML = `
    <div class="agenda-month__head">
      ${["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((dia) => `<span>${dia}</span>`).join("")}
    </div>
    <div class="agenda-month__grid">
      ${celdas.map((dia) => {
        if (!dia) return '<span class="agenda-month__cell is-blank"></span>';

        const carga = getDayLoad(dia);
        const horas = carga.minutosLibres / 60;
        // Cuatro intensidades bastan para leer la carga de un vistazo.
        const nivel = !carga.bloques.length ? 0 : horas <= 3 ? 1 : horas <= 6 ? 2 : 3;

        return `
          <span class="agenda-month__cell is-clickable is-level-${nivel}${dia === hoy ? " is-today" : ""}" data-day="${escapeHtml(dia)}" role="button" tabindex="0"
            title="${escapeHtml(`${formatDate(`${dia}T12:00:00Z`)}: ${carga.bloques.length ? formatDurationMinutes(carga.minutosLibres) : "sin disponibilidad"}${carga.ordenes.length ? ` · ${carga.ordenes.length} orden(es)` : ""}`)}">
            <b>${Number(dia.split("-")[2])}</b>
            ${carga.ordenes.length ? `<i class="agenda-month__dot" aria-hidden="true"></i>` : ""}
            ${carga.ausencias.length ? `<i class="agenda-month__abs" aria-hidden="true"></i>` : ""}
          </span>
        `;
      }).join("")}
    </div>
    <p class="avail-days__legend agenda-month__legend">
      <span><i class="avail-days__key is-level-1"></i> Hasta 3 h</span>
      <span><i class="avail-days__key is-level-2"></i> 3 a 6 h</span>
      <span><i class="avail-days__key is-level-3"></i> Mas de 6 h</span>
      <span><i class="avail-days__key is-ocupado"></i> Con ordenes</span>
      <span><i class="avail-days__key is-ausencia"></i> Con ausencia</span>
    </p>
  `;
}

function moveAgendaWeek(delta) {
  state.agendaWeekStart = shiftArgentinaDate(state.agendaWeekStart || getWeekStart(getArgentinaDateInputValue()), delta * 7);
  renderAgendaWeek();
}

function moveAgendaMonth(delta) {
  const actual = state.agendaMonthStart || `${getArgentinaDateInputValue().slice(0, 7)}-01`;
  const [anio, mes] = actual.split("-").map(Number);
  const nuevo = new Date(Date.UTC(anio, mes - 1 + delta, 1));
  state.agendaMonthStart = `${nuevo.getUTCFullYear()}-${String(nuevo.getUTCMonth() + 1).padStart(2, "0")}-01`;
  renderAgendaMonth();
}

function setupAgendas() {
  document.getElementById("agendaWeekPrev")?.addEventListener("click", () => moveAgendaWeek(-1));
  document.getElementById("agendaWeekNext")?.addEventListener("click", () => moveAgendaWeek(1));
  document.getElementById("agendaMonthPrev")?.addEventListener("click", () => moveAgendaMonth(-1));
  document.getElementById("agendaMonthNext")?.addEventListener("click", () => moveAgendaMonth(1));
}


/* --- Detalle de un dia, al que se llega tocando un dia en semana o mes --- */

function openAgendaDay(dateValue, origen = "agenda-week") {
  if (!dateValue) return;
  state.agendaDayDate = dateValue;
  // Se recuerda de donde vino para que "Volver" no adivine.
  state.agendaDayOrigin = ["agenda-week", "agenda-month"].includes(origen) ? origen : "agenda-week";
  renderAgendaDay();
  setAvailabilityView("agenda-day");
}

function renderAgendaDay() {
  const contenedor = document.getElementById("agendaDayDetail");
  const titulo = document.getElementById("agendaDayTitle");
  const subtitulo = document.getElementById("agendaDaySubtitle");
  if (!contenedor) return;

  const dia = state.agendaDayDate || getArgentinaDateInputValue();
  const carga = getDayLoad(dia);

  if (titulo) titulo.textContent = formatDate(`${dia}T12:00:00Z`);
  if (subtitulo) {
    const partes = [];
    partes.push(carga.bloques.length
      ? `${formatDurationMinutes(carga.minutosLibres)} de disponibilidad`
      : "Sin disponibilidad cargada");
    if (carga.ordenes.length) partes.push(`${carga.ordenes.length} ${carga.ordenes.length === 1 ? "orden" : "ordenes"}`);
    if (carga.ausencias.length) partes.push(`${carga.ausencias.length} ${carga.ausencias.length === 1 ? "ausencia" : "ausencias"}`);
    subtitulo.textContent = partes.join(" · ");
  }

  const escala = [8, 12, 16, 20]
    .map((hora) => {
      const izquierda = ((hora - TIMELINE_START_HOUR) / TIMELINE_HOURS) * 100;
      return `<span class="avail-day__tick" style="left:${izquierda}%">${String(hora).padStart(2, "0")}</span>`;
    })
    .join("");

  const lista = (items, vacio, pintar) => items.length
    ? `<ul class="agenda-day__list">${items.map(pintar).join("")}</ul>`
    : `<p class="agenda-day__empty">${escapeHtml(vacio)}</p>`;

  contenedor.innerHTML = `
    <div class="agenda-day__track-wrap">
      ${renderTimelineTrack(carga.tramos)}
      <div class="avail-day__scale">${escala}</div>
    </div>
    ${timelineLegend()}

    <div class="agenda-day__cols">
      <section>
        <h4>Disponibilidad</h4>
        ${lista(carga.bloques, "No cargaste disponibilidad este dia.", (slot) => `
          <li>
            <span class="agenda-day__hora">${escapeHtml(formatTime(slot.startAtUtc))} a ${escapeHtml(formatTime(slot.endAtUtc))}</span>
            <span class="agenda-day__nota">${escapeHtml(slotDurationLabel(slot.startAtUtc, slot.endAtUtc))}</span>
          </li>
        `)}
      </section>

      <section>
        <h4>Ordenes</h4>
        ${lista(
          carga.ordenes.slice().sort((a, b) => new Date(a.scheduledStartAtUtc) - new Date(b.scheduledStartAtUtc)),
          "No tenes ordenes agendadas este dia.",
          (order) => `
            <li>
              <span class="agenda-day__hora">${escapeHtml(formatTime(order.scheduledStartAtUtc))} a ${escapeHtml(formatTime(order.scheduledEndAtUtc))}</span>
              <span class="agenda-day__nota">${escapeHtml(getClientDisplayName(order.clientId))}</span>
              <a class="agenda-day__link" href="#ordenes/${escapeHtml(order.id)}">Ver orden</a>
            </li>
          `
        )}
      </section>

      <section>
        <h4>Ausencias</h4>
        ${lista(carga.ausencias, "Sin ausencias este dia.", (absence) => `
          <li>
            <span class="agenda-day__hora">${escapeHtml(formatTime(absence.startAtUtc))} a ${escapeHtml(formatTime(absence.endAtUtc))}</span>
            <span class="agenda-day__nota">${escapeHtml(absence.reason || "Sin motivo")}</span>
          </li>
        `)}
      </section>
    </div>
  `;
}

function setupAgendaDay() {
  document.getElementById("agendaDayBack")?.addEventListener("click", () => {
    setAvailabilityView(state.agendaDayOrigin || "agenda-week");
  });

  // Los dias se pintan con innerHTML, asi que el click se delega al contenedor.
  document.getElementById("availabilityWeeklySummary")?.addEventListener("click", (event) => {
    const fila = event.target.closest("[data-day]");
    if (fila) openAgendaDay(fila.dataset.day, "agenda-week");
  });

  document.getElementById("availabilityMonthlySummary")?.addEventListener("click", (event) => {
    const celda = event.target.closest("[data-day]");
    if (celda) openAgendaDay(celda.dataset.day, "agenda-month");
  });
}


function setAvailabilityView(view = "availability") {
  const refs = getPageRefs();
  const resolvedView = ["availability", "absences", "agenda-week", "agenda-month", "agenda-day"].includes(view) ? view : "availability";
  state.availabilityView = resolvedView;

  refs.availabilityViewAvailability?.classList.toggle("hidden", resolvedView !== "availability");
  refs.availabilityViewAbsences?.classList.toggle("hidden", resolvedView !== "absences");
  refs.availabilityViewAgendaWeek?.classList.toggle("hidden", resolvedView !== "agenda-week");
  refs.availabilityViewAgendaMonth?.classList.toggle("hidden", resolvedView !== "agenda-month");
  refs.availabilityViewAgendaDay?.classList.toggle("hidden", resolvedView !== "agenda-day");

  refs.availabilitySubnav?.querySelectorAll("[data-availability-view]").forEach((button) => {
    const vistaResaltada = resolvedView === "agenda-day" ? (state.agendaDayOrigin || "agenda-week") : resolvedView;
    const isActive = button.dataset.availabilityView === vistaResaltada;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });
}



function renderOrderWeekSummary(target, orders) {
  if (!target) return;

  if (!orders.length) {
    target.innerHTML = '<div class="agenda-loading">Todavia no tenes ordenes asignadas.</div>';
    return;
  }

  const grouped = groupOrdersByDate(orders);
  const markup = Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dayKey, dayOrders]) => {
      const ordered = dayOrders
        .slice()
        .sort((left, right) => new Date(left.scheduledStartAtUtc) - new Date(right.scheduledStartAtUtc));

      const firstOrder = ordered[0];
      const ranges = ordered
        .map((order) => `${formatTime(order.scheduledStartAtUtc)} · ${order.items.map((item) => item.serviceName).join(", ")}`)
        .join(" | ");

      return `
        <div class="schedule-item">
          <span class="schedule-day-badge">
            <span class="day-abbr">${escapeHtml(formatArgentinaDateTime(firstOrder.scheduledStartAtUtc, { weekday: "short", timeZone: ARGENTINA_TIME_ZONE }).replace(".", ""))}</span>
            <span class="day-num">${escapeHtml(dayKey.slice(-2))}</span>
          </span>
          <span>${escapeHtml(formatDate(firstOrder.scheduledStartAtUtc))}</span>
          <span>${escapeHtml(ranges)}</span>
          <span class="schedule-count-badge">${ordered.length} orden${ordered.length === 1 ? "" : "es"}</span>
        </div>
      `;
    })
    .join("");

  target.innerHTML = markup;
}

function renderAgendaList() {
  const refs = getPageRefs();
  if (!refs.technicianAgendaList) return;

  if (!state.orders.length) {
    refs.technicianAgendaList.innerHTML = '<div class="agenda-loading">Todavia no hay ordenes asignadas en tu agenda.</div>';
    return;
  }

  const timelineStart = 6 * 60;
  const timelineEnd = 22 * 60;
  const timelineRange = timelineEnd - timelineStart;
  const grouped = groupOrdersByDate(state.orders);
  const orderedDays = Array.from(grouped.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dayKey, dayOrders]) => {
      const ordered = dayOrders
        .slice()
        .sort((left, right) => new Date(left.scheduledStartAtUtc) - new Date(right.scheduledStartAtUtc));

      const firstStartAtUtc = ordered[0].scheduledStartAtUtc;
      const lastEndAtUtc = ordered[ordered.length - 1].scheduledEndAtUtc;
      const totalMinutes = ordered.reduce((sum, order) => {
        const start = new Date(order.scheduledStartAtUtc);
        const end = new Date(order.scheduledEndAtUtc);
        return sum + Math.max(0, Math.round((end - start) / 60000));
      }, 0);

      const scaleMarkup = [6, 9, 12, 15, 18, 21]
        .map((hour) => {
          const left = ((hour * 60) - timelineStart) / timelineRange * 100;
          return `<span class="agenda-day-scale__tick" style="left:${left}%">${escapeHtml(formatMinutesOfDay(hour * 60))}</span>`;
        })
        .join("");

      const rowsMarkup = ordered.map((order) => {
        const services = order.items.map((item) => item.serviceName).join(", ") || "Sin items";
        const startMinutes = getArgentinaMinutesOfDay(order.scheduledStartAtUtc);
        const endMinutes = getArgentinaMinutesOfDay(order.scheduledEndAtUtc);
        const clampedStart = clamp(startMinutes, timelineStart, timelineEnd);
        const clampedEnd = clamp(endMinutes, timelineStart, timelineEnd);
        const left = ((clampedStart - timelineStart) / timelineRange) * 100;
        const width = Math.max(((Math.max(clampedEnd, clampedStart + 20) - clampedStart) / timelineRange) * 100, 8);

        return `
          <button type="button" class="agenda-visual-row" data-order-id="${escapeHtml(order.id)}">
            <div class="agenda-visual-row__meta">
              <div class="agenda-order-time">${escapeHtml(formatTime(order.scheduledStartAtUtc))} a ${escapeHtml(formatTime(order.scheduledEndAtUtc))}</div>
              <div class="agenda-order-services">${escapeHtml(services)}</div>
              <div class="agenda-order-where">
                <i class="fas fa-location-dot" aria-hidden="true"></i>
                ${escapeHtml(order.address || "Sin direccion")} &middot; ${escapeHtml(getClientDisplayName(order.clientId))}
              </div>
            </div>
            <div class="agenda-visual-track">
              <div class="agenda-visual-track__grid">${scaleMarkup}</div>
              <div class="agenda-visual-bar ${escapeHtml(getOrderStatusClass(order.status))}" style="left:${left}%; width:${width}%;">
                <span>${escapeHtml(formatTime(order.scheduledStartAtUtc))}</span>
              </div>
            </div>
            <span class="appointment-status-badge ${escapeHtml(getOrderStatusClass(order.status))}">${escapeHtml(getOrderStatusLabel(order.status))}</span>
          </button>
        `;
      }).join("");

      return `
        <article class="agenda-day-card agenda-day-card--timeline">
          <div class="agenda-day-header">
            <div>
              <h3 class="agenda-day-title">${escapeHtml(formatDate(firstStartAtUtc))}</h3>
              <p class="agenda-day-subtitle">Cobertura ${escapeHtml(formatTime(firstStartAtUtc))} - ${escapeHtml(formatTime(lastEndAtUtc))} · ${escapeHtml(slotDurationLabel(firstStartAtUtc, lastEndAtUtc))}</p>
            </div>
            <span class="agenda-day-count">${ordered.length} orden${ordered.length === 1 ? "" : "es"} · ${escapeHtml(formatDurationMinutes(totalMinutes))}</span>
          </div>
          <div class="agenda-day-scale">
            ${scaleMarkup}
          </div>
          <div class="agenda-day-orders agenda-day-orders--visual">
            ${rowsMarkup}
          </div>
        </article>
      `;
    });

  const now = new Date();
  const nextOrder = state.orders
    .filter((order) => new Date(order.scheduledEndAtUtc) > now)
    .sort((left, right) => new Date(left.scheduledStartAtUtc) - new Date(right.scheduledStartAtUtc))[0];
  const totalDurationMinutes = state.orders.reduce((sum, order) => {
    const start = new Date(order.scheduledStartAtUtc);
    const end = new Date(order.scheduledEndAtUtc);
    return sum + Math.max(0, Math.round((end - start) / 60000));
  }, 0);

  const agendaStats = [
    { icon: "fa-calendar-days", label: orderedDays.length === 1 ? "Dia con agenda" : "Dias con agenda", value: String(orderedDays.length) },
    { icon: "fa-hourglass-half", label: "Carga total", value: formatDurationMinutes(totalDurationMinutes) },
    {
      icon: "fa-clock",
      label: "Proximo servicio",
      value: nextOrder
        ? `${formatArgentinaDate(nextOrder.scheduledStartAtUtc, { weekday: "short", day: "2-digit", month: "short" })} · ${formatTime(nextOrder.scheduledStartAtUtc)}`
        : "Sin pendientes"
    }
  ];

  refs.technicianAgendaList.innerHTML = `
    <div class="technician-toolbar__stats agenda-stats">
      ${agendaStats.map((stat) => `
        <div class="technician-stat">
          <i class="fas ${escapeHtml(stat.icon)}" aria-hidden="true"></i>
          <span>
            <strong>${escapeHtml(stat.value)}</strong>
            <small>${escapeHtml(stat.label)}</small>
          </span>
        </div>
      `).join("")}
    </div>
    ${orderedDays.join("")}
  `;
}

function renderTechnicianOrderCard(order) {
  const tone = getOrderTone(order.status);
  const statusValue = getOrderStatusValue(order.status);
  const timingBadge = getOrderTimingBadge(order);
  const servicesCount = order.items.length;
  const services = order.items.map((item) => item.serviceName).join(", ") || "Sin items";
  const hasSchedule = Boolean(order.scheduledStartAtUtc) && !Number.isNaN(new Date(order.scheduledStartAtUtc).getTime());
  const canStart = statusValue === ORDER_STATUS_VALUES.Confirmed;
  const canWorkOnIt = statusValue === ORDER_STATUS_VALUES.InProgress;

  return `
    <article class="technician-order-card is-${escapeHtml(tone)}" data-order-id="${escapeHtml(order.id)}">
      <header class="technician-order-card__head">
        <div class="technician-order-card__identity">
          <h4>${escapeHtml(order.items.map((item) => item.serviceName).join(", ") || "Orden de servicio")}</h4>
          <p class="technician-order-card__meta">
            <span class="technician-order-ref">#${escapeHtml(shortenGuid(order.id))}</span>
            <span>${escapeHtml(`${servicesCount} servicio${servicesCount === 1 ? "" : "s"}`)}</span>
          </p>
        </div>
        <div class="technician-order-badges">
          <span class="technician-order-status">
            <i class="fas ${escapeHtml(getOrderStatusIcon(order.status))}" aria-hidden="true"></i>
            ${escapeHtml(getOrderStatusLabel(order.status))}
          </span>
          ${timingBadge ? `
            <span class="technician-order-timing is-${escapeHtml(timingBadge.tone)}">
              <i class="fas ${escapeHtml(timingBadge.icon)}" aria-hidden="true"></i>
              ${escapeHtml(timingBadge.label)}
            </span>` : ""}
        </div>
      </header>

      <div class="technician-order-card__grid">
        <div class="technician-order-field is-primary">
          <span class="technician-order-label"><i class="fas fa-calendar-day" aria-hidden="true"></i> Visita</span>
          ${hasSchedule ? `
            <strong>${escapeHtml(formatArgentinaDate(order.scheduledStartAtUtc, { weekday: "long", day: "2-digit", month: "long" }))}</strong>
            <span class="technician-order-subvalue">${escapeHtml(formatArgentinaTime(order.scheduledStartAtUtc, { hourCycle: "h23" }))} a ${escapeHtml(formatArgentinaTime(order.scheduledEndAtUtc, { hourCycle: "h23" }))} &middot; ${escapeHtml(orderDurationLabel(order))}</span>`
            : "<strong>Sin fecha asignada</strong>"}
        </div>
        <div class="technician-order-field">
          <span class="technician-order-label"><i class="fas fa-location-dot" aria-hidden="true"></i> Donde y con quien</span>
          <strong>${escapeHtml(order.address || "Sin direccion registrada")}</strong>
          <span class="technician-order-subvalue">${escapeHtml(getClientDisplayName(order.clientId))}</span>
        </div>
      </div>

      <div class="technician-order-card__foot">
        <span class="technician-order-card__services" title="${escapeHtml(services)}">${escapeHtml(services)}</span>
        <div class="technician-order-card__actions">
          ${canStart ? `
            <button type="button" class="btn btn-primary" data-action="start-order" data-order-id="${escapeHtml(order.id)}">
              <i class="fas fa-play" aria-hidden="true"></i>
              Iniciar
            </button>` : ""}
          ${canWorkOnIt ? `
            <button type="button" class="btn btn-primary" data-action="open-evidence-modal" data-order-id="${escapeHtml(order.id)}">
              <i class="fas fa-camera" aria-hidden="true"></i>
              Evidencia
            </button>` : ""}
          <button type="button" class="btn btn-secondary" data-action="open-order" data-order-id="${escapeHtml(order.id)}">
            <i class="fas fa-eye" aria-hidden="true"></i>
            Ver detalle
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderDashboardOrders() {
  const refs = getPageRefs();
  if (!refs.consultationsList) return;

  // Inicio prioriza lo que se puede trabajar ahora: en ejecucion primero y
  // despues las visitas mas proximas.
  const actionable = sortOrdersByVisit(
    state.orders.filter((order) => {
      const statusValue = getOrderStatusValue(order.status);
      return statusValue === ORDER_STATUS_VALUES.Confirmed || statusValue === ORDER_STATUS_VALUES.InProgress;
    })
  ).sort((left, right) => {
    const leftRank = getOrderStatusValue(left.status) === ORDER_STATUS_VALUES.InProgress ? 0 : 1;
    const rightRank = getOrderStatusValue(right.status) === ORDER_STATUS_VALUES.InProgress ? 0 : 1;
    return leftRank - rightRank;
  });

  const upcoming = (actionable.length ? actionable : sortOrdersByVisit(state.orders)).slice(0, 4);

  refs.consultationsList.innerHTML = upcoming.length
    ? upcoming.map(renderTechnicianOrderCard).join("")
    : renderTechnicianEmptyState({
        icon: "fa-clipboard-list",
        title: "Sin ordenes asignadas",
        message: "Cuando el proveedor te asigne trabajo, lo vas a ver aca con su horario y direccion."
      });
}

function renderExecutionOrders() {
  const refs = getPageRefs();
  if (!refs.technicianExecutionList) return;

  const executionOrders = state.orders.filter((order) => {
    const statusValue = getOrderStatusValue(order.status);
    return statusValue === ORDER_STATUS_VALUES.InProgress || statusValue === ORDER_STATUS_VALUES.Finalized;
  });

  refs.technicianExecutionList.innerHTML = executionOrders.length
    ? sortOrdersByVisit(executionOrders).map(renderTechnicianOrderCard).join("")
    : renderTechnicianEmptyState({
        icon: "fa-spray-can",
        title: "Nada en ejecucion",
        message: "Cuando inicies una orden desde la bandeja, la vas a poder trabajar y cerrar desde aca."
      });
}

function sortOrdersByVisit(orders) {
  return orders.slice().sort((left, right) => {
    const leftTime = new Date(left.scheduledStartAtUtc).getTime();
    const rightTime = new Date(right.scheduledStartAtUtc).getTime();
    return (Number.isNaN(leftTime) ? 0 : leftTime) - (Number.isNaN(rightTime) ? 0 : rightTime);
  });
}

// La bandeja arranca por lo que viene (mas proximo primero) y deja lo ya
// pasado al final, de lo mas reciente a lo mas viejo.
function sortOrdersForTray(orders) {
  const now = Date.now();

  return orders.slice().sort((left, right) => {
    const leftTime = new Date(left.scheduledStartAtUtc).getTime() || 0;
    const rightTime = new Date(right.scheduledStartAtUtc).getTime() || 0;
    const leftIsPast = leftTime < now ? 1 : 0;
    const rightIsPast = rightTime < now ? 1 : 0;

    if (leftIsPast !== rightIsPast) return leftIsPast - rightIsPast;
    return leftIsPast ? rightTime - leftTime : leftTime - rightTime;
  });
}

function renderTechnicianOrdersStats() {
  const container = document.getElementById("technicianOrdersStats");
  if (!container) return;

  const todayKey = toDateInputValue(new Date());
  const todayCount = state.orders.filter((order) => toDateInputValue(order.scheduledStartAtUtc) === todayKey).length;
  const inProgressCount = state.orders.filter((order) => getOrderStatusValue(order.status) === ORDER_STATUS_VALUES.InProgress).length;
  const pendingStart = state.orders.filter((order) => getOrderStatusValue(order.status) === ORDER_STATUS_VALUES.Confirmed).length;
  const nextOrder = sortOrdersByVisit(state.orders.filter((order) => new Date(order.scheduledEndAtUtc) > new Date()))[0];

  const stats = [
    { icon: "fa-calendar-day", label: "Visitas de hoy", value: String(todayCount), tone: todayCount > 0 ? "attention" : "" },
    { icon: "fa-spray-can", label: "En ejecucion", value: String(inProgressCount) },
    { icon: "fa-play", label: "Listas para iniciar", value: String(pendingStart) },
    {
      icon: "fa-clock",
      label: "Proxima visita",
      value: nextOrder
        ? `${formatArgentinaDate(nextOrder.scheduledStartAtUtc, { weekday: "short", day: "2-digit", month: "short" })} &middot; ${formatArgentinaTime(nextOrder.scheduledStartAtUtc, { hourCycle: "h23" })}`
        : "Sin pendientes",
      raw: true
    }
  ];

  container.innerHTML = stats.map((stat) => `
    <div class="technician-stat ${stat.tone ? `is-${escapeHtml(stat.tone)}` : ""}">
      <i class="fas ${escapeHtml(stat.icon)}" aria-hidden="true"></i>
      <span>
        <strong>${stat.raw ? stat.value : escapeHtml(stat.value)}</strong>
        <small>${escapeHtml(stat.label)}</small>
      </span>
    </div>
  `).join("");
}

function renderOrdersList() {
  const refs = getPageRefs();
  if (!refs.technicianOrdersList) return;

  renderTechnicianOrdersStats();

  const statusFilter = document.getElementById("technicianOrdersStatusFilter")?.value || "";
  const visibleOrders = sortOrdersForTray(
    statusFilter
      ? state.orders.filter((order) => String(getOrderStatusValue(order.status)) === String(statusFilter))
      : state.orders
  );

  if (!visibleOrders.length) {
    refs.technicianOrdersList.innerHTML = renderTechnicianEmptyState(
      state.orders.length
        ? { icon: "fa-filter-circle-xmark", title: "Sin resultados", message: "Ninguna orden coincide con el estado elegido." }
        : { icon: "fa-clipboard-list", title: "Todavia no hay ordenes", message: "Cuando el proveedor te asigne una orden, aparece aca con su horario y direccion." }
    );
    return;
  }

  refs.technicianOrdersList.innerHTML = visibleOrders.map(renderTechnicianOrderCard).join("");
}

function renderTechnicianEmptyState({ icon = "fa-clipboard-list", title = "", message = "" }) {
  return `
    <div class="technician-empty">
      <span class="technician-empty__icon"><i class="fas ${escapeHtml(icon)}" aria-hidden="true"></i></span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function renderEvidenceListMarkup(evidenceItems) {
  if (!evidenceItems.length) {
    return '<div class="agenda-loading technician-evidence-empty">Todavia no registraste evidencia para esta orden.</div>';
  }

  return evidenceItems
    .slice()
    .sort((left, right) => new Date(right.recordedAtUtc) - new Date(left.recordedAtUtc))
    .map((item) => `
      <article class="technician-evidence-item">
        ${isImageEvidence(item) ? `
          <div class="technician-evidence-preview ${state.currentOrderEvidencePreviewUrls.get(item.id) ? "" : "is-loading"}" data-evidence-preview-id="${escapeHtml(item.id)}" data-evidence-preview-alt="${escapeHtml(`Vista previa de ${item.fileName || "evidencia"}`)}">
            ${state.currentOrderEvidencePreviewUrls.get(item.id)
              ? `<img src="${escapeHtml(state.currentOrderEvidencePreviewUrls.get(item.id))}" alt="Vista previa de ${escapeHtml(item.fileName || "evidencia")}">`
              : '<span>Cargando vista previa...</span>'}
          </div>` : ""}
        <div class="technician-evidence-item-head">
          <div>
            <strong>${escapeHtml(getEvidenceKindLabel(item.kind))}</strong>
            <span>${escapeHtml(formatDateTime(item.recordedAtUtc))}</span>
          </div>
          <span class="technician-evidence-badge">${escapeHtml(item.hasBinaryContent ? "Archivo" : "Registro")}</span>
        </div>
        <div class="technician-evidence-item-meta">
          ${item.fileName ? `<span>${escapeHtml(item.fileName)}</span>` : `<span>${escapeHtml(getEvidenceKindLabel(item.kind))}</span>`}
          <span>${escapeHtml(formatFileSize(item.fileSizeBytes))}</span>
          ${item.contentType ? `<span>${escapeHtml(item.contentType)}</span>` : ""}
        </div>
        ${item.note ? `<p class="technician-evidence-item-note">${escapeHtml(item.note)}</p>` : ""}
        ${item.hasBinaryContent ? `
          <div class="technician-evidence-item-actions">
            <button type="button" class="btn btn-secondary" data-action="download-evidence" data-order-id="${escapeHtml(item.serviceOrderId)}" data-evidence-id="${escapeHtml(item.id)}" data-file-name="${escapeHtml(item.fileName || "evidencia.bin")}">
              Descargar foto
            </button>
          </div>` : ""}
      </article>
    `)
    .join("");
}

async function ensureEvidencePreviews(orderId) {
  const previewableItems = state.currentOrderEvidence.filter((item) => isImageEvidence(item) && !state.currentOrderEvidencePreviewUrls.has(item.id));
  if (!previewableItems.length) return;

  const results = await Promise.allSettled(
    previewableItems.map(async (item) => {
      const fileResult = await FrontGateway.order.downloadEvidenceFile(orderId, item.id);
      return {
        evidenceId: item.id,
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

function renderOrderDetail() {
  const refs = getPageRefs();
  if (!refs.technicianOrderDetail) return;

  if (!state.currentOrderDetail) {
    refs.technicianOrderDetail.innerHTML = `
      <div class="technician-order-empty">
        <i class="fas fa-clipboard-list"></i>
        <p>Selecciona una orden para ver el detalle.</p>
      </div>
    `;
    return;
  }

  const order = state.currentOrderDetail;
  const evidenceItems = state.currentOrderEvidence;
  const cancellationRequests = state.currentOrderCancellationRequests;
  const pendingCancellationRequest = cancellationRequests.find((entry) => entry.status === "Pending" || entry.status === 1) || null;
  const hasEvidence = evidenceItems.length > 0;
  const itemsMarkup = order.items.length
    ? order.items.map((item) => `
        <div class="technician-order-item">
          <div>
            <strong>${escapeHtml(item.serviceName)}</strong>
            <div class="technician-order-subline">Cantidad: ${item.quantity} · Unitario: ${escapeHtml(formatCurrency(item.unitPrice))}</div>
          </div>
          <strong>${escapeHtml(formatCurrency(item.totalPrice || (item.unitPrice * item.quantity)))}</strong>
        </div>
      `).join("")
    : '<p class="agenda-loading">La orden no tiene items cargados.</p>';

  const historyMarkup = state.currentOrderHistory.length
    ? state.currentOrderHistory.map((entry) => `
        <div class="technician-order-history-item">
          <div class="technician-order-history-head">
            <strong>${escapeHtml(getOrderStatusLabel(entry.newStatus))}</strong>
            <span>${escapeHtml(formatDateTime(entry.changedAtUtc))}</span>
          </div>
          <div class="technician-order-history-body">
            ${escapeHtml(entry.note || "Cambio de estado registrado.")}
          </div>
        </div>
      `).join("")
    : '<p class="agenda-loading">Todavia no hay historial para esta orden.</p>';
  const cancellationHistoryMarkup = cancellationRequests.length
    ? cancellationRequests.map((entry) => `
        <div class="technician-order-history-item">
          <div class="technician-order-history-head">
            <strong>${escapeHtml(getCancellationReasonLabel(entry.reason))}</strong>
            <span>${escapeHtml(getRequestStatusLabel(entry.status))}</span>
          </div>
          <div class="technician-order-history-body">
            Solicitada ${escapeHtml(formatDateTime(entry.requestedAtUtc))}${entry.note ? ` · ${escapeHtml(entry.note)}` : ""}
            ${entry.reviewedAtUtc ? `<div class="technician-order-subline">Resuelta ${escapeHtml(formatDateTime(entry.reviewedAtUtc))}${entry.resolutionNote ? ` · ${escapeHtml(entry.resolutionNote)}` : ""}</div>` : ""}
          </div>
        </div>
      `).join("")
    : '<p class="agenda-loading">No hay solicitudes de cancelacion para esta orden.</p>';

  const orderStatusValue = getOrderStatusValue(order.status);
  const tone = getOrderTone(order.status);
  const canStartOrder = orderStatusValue === ORDER_STATUS_VALUES.Confirmed;
  const canFinalizeOrder = orderStatusValue === ORDER_STATUS_VALUES.InProgress;
  const canCaptureEvidence = orderStatusValue === ORDER_STATUS_VALUES.InProgress || orderStatusValue === ORDER_STATUS_VALUES.Finalized;
  const canRequestCancellation = [ORDER_STATUS_VALUES.Created, ORDER_STATUS_VALUES.Approved, ORDER_STATUS_VALUES.Confirmed].includes(orderStatusValue) && !pendingCancellationRequest;
  const timingBadge = getOrderTimingBadge(order);
  const hasSchedule = Boolean(order.scheduledStartAtUtc) && !Number.isNaN(new Date(order.scheduledStartAtUtc).getTime());
  const servicesCount = order.items.length;

  const feedbackMarkup = state.orderActionFeedback?.message
    ? `<div class="technician-evidence-feedback is-${escapeHtml(state.orderActionFeedback.type || "info")}">${escapeHtml(state.orderActionFeedback.message)}</div>`
    : "";

  const actionButtons = [
    canStartOrder
      ? `<button type="button" class="btn btn-primary" data-action="start-order" data-order-id="${escapeHtml(order.id)}"><i class="fas fa-play" aria-hidden="true"></i> Iniciar orden</button>`
      : "",
    canFinalizeOrder
      ? `<button type="button" class="btn btn-primary" data-action="finalize-order" data-order-id="${escapeHtml(order.id)}"${hasEvidence ? "" : " disabled"}><i class="fas fa-flag-checkered" aria-hidden="true"></i> Finalizar orden</button>`
      : "",
    canCaptureEvidence
      ? `<button type="button" class="btn btn-secondary" data-action="open-evidence-modal" data-order-id="${escapeHtml(order.id)}"><i class="fas fa-camera" aria-hidden="true"></i> Cargar evidencia</button>`
      : "",
    canRequestCancellation
      ? `<button type="button" class="btn btn-ghost-danger" data-action="open-cancellation-modal" data-order-id="${escapeHtml(order.id)}"><i class="fas fa-ban" aria-hidden="true"></i> Solicitar cancelacion</button>`
      : ""
  ].filter(Boolean).join("");

  const actionsMarkup = actionButtons
    ? `<div class="technician-order-actions">${actionButtons}</div>`
    : "";

  const hints = [
    orderStatusValue === ORDER_STATUS_VALUES.Created
      ? "La orden todavia no fue aprobada ni confirmada por el proveedor. No podes iniciarla hasta que pase a Confirmada."
      : "",
    orderStatusValue === ORDER_STATUS_VALUES.Approved
      ? "La orden ya fue aprobada, pero todavia falta la confirmacion operativa del proveedor."
      : "",
    canFinalizeOrder && !hasEvidence
      ? "Necesitas al menos una evidencia registrada para cerrar la orden."
      : ""
  ].filter(Boolean)
    .map((hint) => `<p class="technician-order-hint"><i class="fas fa-circle-info" aria-hidden="true"></i> ${escapeHtml(hint)}</p>`)
    .join("");

  const pendingCancellationMarkup = pendingCancellationRequest
    ? `
      <div class="technician-order-alert is-pending">
        <i class="fas fa-hourglass-half" aria-hidden="true"></i>
        <div>
          <strong>Cancelacion pendiente de revision</strong>
          <p>${escapeHtml(getCancellationReasonLabel(pendingCancellationRequest.reason))} · enviada el ${escapeHtml(formatDateTime(pendingCancellationRequest.requestedAtUtc))}. Espera la decision del proveedor.</p>
        </div>
      </div>
    `
    : "";

  const exceptionMarkup = order.exceptionReason
    ? `
      <div class="technician-order-alert is-danger">
        <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
        <div>
          <strong>Motivo de excepcion</strong>
          <p>${escapeHtml(order.exceptionReason)}</p>
        </div>
      </div>
    `
    : "";

  refs.technicianOrderDetail.innerHTML = `
    <article class="technician-order-detail-card is-${escapeHtml(tone)}">
      <header class="technician-order-detail-head">
        <div class="technician-order-identity">
          <p class="technician-order-kicker">
            <span class="technician-order-ref">#${escapeHtml(shortenGuid(order.id))}</span>
            <span>${escapeHtml(`${servicesCount} servicio${servicesCount === 1 ? "" : "s"}`)}</span>
            ${order.createdAtUtc ? `<span>Creada el ${escapeHtml(formatArgentinaDate(order.createdAtUtc, { weekday: undefined, day: "2-digit", month: "2-digit", year: "2-digit" }))}</span>` : ""}
          </p>
          <h3>${escapeHtml(order.items.map((item) => item.serviceName).join(", ") || "Orden de servicio")}</h3>
        </div>
        <div class="technician-order-badges">
          <span class="technician-order-status">
            <i class="fas ${escapeHtml(getOrderStatusIcon(order.status))}" aria-hidden="true"></i>
            ${escapeHtml(getOrderStatusLabel(order.status))}
          </span>
          ${timingBadge ? `
            <span class="technician-order-timing is-${escapeHtml(timingBadge.tone)}">
              <i class="fas ${escapeHtml(timingBadge.icon)}" aria-hidden="true"></i>
              ${escapeHtml(timingBadge.label)}
            </span>` : ""}
        </div>
      </header>

      <div class="technician-order-detail-grid">
        <div class="technician-order-field is-primary">
          <span class="technician-order-label"><i class="fas fa-calendar-day" aria-hidden="true"></i> Visita programada</span>
          ${hasSchedule ? `
            <strong>${escapeHtml(formatArgentinaDate(order.scheduledStartAtUtc, { weekday: "long", day: "2-digit", month: "long" }))}</strong>
            <span class="technician-order-subvalue">${escapeHtml(formatArgentinaTime(order.scheduledStartAtUtc, { hourCycle: "h23" }))} a ${escapeHtml(formatArgentinaTime(order.scheduledEndAtUtc, { hourCycle: "h23" }))} &middot; ${escapeHtml(orderDurationLabel(order))}</span>`
            : `
            <strong>Sin fecha asignada</strong>
            <span class="technician-order-subvalue">La agenda se define cuando el proveedor confirma la orden.</span>`}
        </div>
        <div class="technician-order-field">
          <span class="technician-order-label"><i class="fas fa-location-dot" aria-hidden="true"></i> Direccion</span>
          <strong>${escapeHtml(order.address || "Sin direccion registrada")}</strong>
          ${order.address ? "" : '<span class="technician-order-subvalue">Coordina el acceso con el proveedor.</span>'}
        </div>
        <div class="technician-order-field">
          <span class="technician-order-label"><i class="fas fa-user" aria-hidden="true"></i> Cliente</span>
          <strong>${escapeHtml(getClientDisplayName(order.clientId))}</strong>
        </div>
        <div class="technician-order-field">
          <span class="technician-order-label"><i class="fas fa-receipt" aria-hidden="true"></i> Monto total</span>
          <strong>${escapeHtml(formatCurrency(order.totalAmount))}</strong>
        </div>
      </div>

      ${renderOrderProgressTrack(order)}

      ${actionsMarkup}
      ${hints}
      ${pendingCancellationMarkup}
      ${exceptionMarkup}
      ${feedbackMarkup}

      <details class="technician-order-block" ${canCaptureEvidence || hasEvidence ? "open" : ""}>
        <summary>
          <span><i class="fas fa-camera" aria-hidden="true"></i> Evidencia operativa</span>
          <span class="technician-order-count">${evidenceItems.length}</span>
        </summary>
        <div class="technician-order-block-body">
          <div class="technician-evidence-list">${renderEvidenceListMarkup(evidenceItems)}</div>
          ${canCaptureEvidence
            ? ""
            : '<p class="technician-order-hint"><i class="fas fa-circle-info" aria-hidden="true"></i> La carga de evidencia se habilita cuando la orden esta en ejecucion y sigue disponible una vez finalizada.</p>'}
        </div>
      </details>

      <details class="technician-order-block" open>
        <summary>
          <span><i class="fas fa-list-check" aria-hidden="true"></i> Servicios a realizar</span>
          <span class="technician-order-count">${servicesCount}</span>
        </summary>
        <div class="technician-order-block-body">
          <div class="technician-order-items">${itemsMarkup}</div>
        </div>
      </details>

      <details class="technician-order-block">
        <summary>
          <span><i class="fas fa-clock-rotate-left" aria-hidden="true"></i> Historial de estados</span>
          <span class="technician-order-count">${state.currentOrderHistory.length}</span>
        </summary>
        <div class="technician-order-block-body">
          <div class="technician-order-history">${historyMarkup}</div>
        </div>
      </details>

      ${cancellationRequests.length ? `
        <details class="technician-order-block">
          <summary>
            <span><i class="fas fa-ban" aria-hidden="true"></i> Solicitudes de cancelacion</span>
            <span class="technician-order-count">${cancellationRequests.length}</span>
          </summary>
          <div class="technician-order-block-body">
            <div class="technician-order-history">${cancellationHistoryMarkup}</div>
          </div>
        </details>` : ""}
    </article>
  `;
}

function renderOrderProgressTrack(order) {
  const tone = getOrderTone(order.status);
  if (tone === "exception") return "";

  const currentRank = getOrderProgressRank(order.status);
  const isClosed = tone === "closed";
  const lastStepIndex = ORDER_PROGRESS_STEPS.length - 1;

  const steps = ORDER_PROGRESS_STEPS.map((step, index) => {
    const isDone = isClosed || index < currentRank;
    const isCurrent = !isClosed && index === currentRank;
    const label = isClosed && index === lastStepIndex ? "Cerrada" : step.label;

    return `
      <li class="technician-order-progress__step ${isDone ? "is-done" : isCurrent ? "is-current" : ""}">
        <span class="technician-order-progress__dot" aria-hidden="true"></span>
        <span class="technician-order-progress__label">${escapeHtml(label)}</span>
      </li>
    `;
  }).join("");

  const completedRatio = isClosed ? 1 : Math.min(1, Math.max(0, currentRank / lastStepIndex));

  return `
    <div class="technician-order-progress" style="--technician-order-progress: ${completedRatio.toFixed(2)}">
      <ol class="technician-order-progress__steps" aria-label="Progreso de la orden">
        ${steps}
      </ol>
      <p class="technician-order-progress__caption">
        Paso ${Math.min(ORDER_PROGRESS_STEPS.length, currentRank + 1)} de ${ORDER_PROGRESS_STEPS.length} &middot; <strong>${escapeHtml(getOrderStatusLabel(order.status))}</strong>
      </p>
    </div>
  `;
}

/** Ventana horaria que dibuja la linea del tiempo: de 6 a 22 cubre una jornada. */
const TIMELINE_START_HOUR = 6;
const TIMELINE_END_HOUR = 22;
const TIMELINE_HOURS = TIMELINE_END_HOUR - TIMELINE_START_HOUR;

/** Posicion porcentual de un instante dentro de la ventana del dia. */
function timelinePercent(utcValue, dateValue) {
  const minutosDelDia = minutesFromDayStart(utcValue, dateValue);
  const desde = TIMELINE_START_HOUR * 60;
  return ((minutosDelDia - desde) / (TIMELINE_HOURS * 60)) * 100;
}

/**
 * Minutos desde la medianoche argentina del dia dado. Un bloque puede empezar
 * el dia anterior o terminar el siguiente, asi que se calcula contra la
 * medianoche real y despues se recorta a la ventana visible.
 */
function minutesFromDayStart(utcValue, dateValue) {
  const medianoche = new Date(argentinaDateTimeToUtcIso(dateValue, "00:00")).getTime();
  return (new Date(utcValue).getTime() - medianoche) / 60000;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, value));
}

/** Tramos a dibujar para un dia, ya recortados a la ventana visible. */
function buildDayTimelineSegments(dateValue, slots, absences, orders) {
  const tramos = [];

  const agregar = (tipo, startAtUtc, endAtUtc, etiqueta) => {
    const desde = clampPercent(timelinePercent(startAtUtc, dateValue));
    const hasta = clampPercent(timelinePercent(endAtUtc, dateValue));
    if (hasta <= desde) return;
    tramos.push({ tipo, desde, ancho: hasta - desde, etiqueta });
  };

  slots.forEach((slot) => agregar("libre", slot.startAtUtc, slot.endAtUtc, "Disponible"));
  orders.forEach((order) => agregar(
    "ocupado",
    order.scheduledStartAtUtc,
    order.scheduledEndAtUtc,
    `Orden ${formatTime(order.scheduledStartAtUtc)}`
  ));
  absences.forEach((absence) => agregar("ausencia", absence.startAtUtc, absence.endAtUtc, "Ausencia"));

  return tramos;
}

function renderAvailabilityList() {
  const refs = getPageRefs();
  if (!refs.availabilityList) return;

  const slots = state.availability
    .slice()
    .sort((left, right) => new Date(left.startAtUtc) - new Date(right.startAtUtc));

  if (!slots.length) {
    refs.availabilityList.innerHTML = '<div class="agenda-loading">No hay bloques cargados para los proximos dias.</div>';
    return;
  }

  // Un dia por fila: se agrupa por fecha de Argentina, no por la del UTC.
  const porDia = new Map();
  slots.forEach((slot) => {
    const dia = toDateInputValue(slot.startAtUtc);
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia).push(slot);
  });

  const escala = [8, 12, 16, 20]
    .map((hora) => {
      const izquierda = ((hora - TIMELINE_START_HOUR) / TIMELINE_HOURS) * 100;
      return `<span class="avail-day__tick" style="left:${izquierda}%">${String(hora).padStart(2, "0")}</span>`;
    })
    .join("");

  refs.availabilityList.innerHTML = `
    <div class="avail-days">
      ${[...porDia.entries()].map(([dia, bloques]) => {
        const ausencias = state.absences.filter((absence) => toDateInputValue(absence.startAtUtc) === dia);
        const ordenes = state.orders.filter((order) =>
          order.scheduledStartAtUtc && toDateInputValue(order.scheduledStartAtUtc) === dia);

        const tramos = buildDayTimelineSegments(dia, bloques, ausencias, ordenes);
        const minutosLibres = bloques.reduce((total, slot) =>
          total + (new Date(slot.endAtUtc) - new Date(slot.startAtUtc)) / 60000, 0);
        const minutosOcupados = ordenes.reduce((total, order) =>
          total + (new Date(order.scheduledEndAtUtc) - new Date(order.scheduledStartAtUtc)) / 60000, 0);

        return `
          <article class="avail-day" data-day="${escapeHtml(dia)}">
            <header class="avail-day__head">
              <div>
                <strong>${escapeHtml(formatDate(`${dia}T12:00:00Z`))}</strong>
                <span>${escapeHtml(formatDurationMinutes(minutosLibres))} cargados${ordenes.length ? ` · ${escapeHtml(formatDurationMinutes(minutosOcupados))} con orden` : ""}</span>
              </div>
              <span class="avail-day__count">${escapeHtml(String(bloques.length))} ${bloques.length === 1 ? "bloque" : "bloques"}</span>
            </header>

            <div class="avail-day__track" role="img" aria-label="${escapeHtml(`Jornada del ${formatDate(`${dia}T12:00:00Z`)}: ${formatDurationMinutes(minutosLibres)} disponibles`)}">
              ${tramos.map((tramo) => `
                <span class="avail-day__seg is-${tramo.tipo}"
                  style="left:${tramo.desde.toFixed(2)}%;width:${tramo.ancho.toFixed(2)}%"
                  title="${escapeHtml(tramo.etiqueta)}"></span>
              `).join("")}
            </div>
            <div class="avail-day__scale">${escala}</div>

            <ul class="avail-day__blocks">
              ${bloques.map((slot) => `
                <li class="avail-day__block" data-availability-id="${escapeHtml(slot.id)}">
                  <span class="avail-day__range">${escapeHtml(formatTime(slot.startAtUtc))} a ${escapeHtml(formatTime(slot.endAtUtc))}</span>
                  <span class="avail-day__len">${escapeHtml(slotDurationLabel(slot.startAtUtc, slot.endAtUtc))}</span>
                  <span class="avail-day__acts">
                    <button type="button" class="avail-day__act" data-action="edit-availability" data-availability-id="${escapeHtml(slot.id)}">Editar</button>
                    <button type="button" class="avail-day__act is-danger" data-action="delete-availability" data-availability-id="${escapeHtml(slot.id)}">Eliminar</button>
                  </span>
                </li>
              `).join("")}
            </ul>
          </article>
        `;
      }).join("")}
    </div>

    <p class="avail-days__legend">
      <span><i class="avail-days__key is-libre"></i> Disponible</span>
      <span><i class="avail-days__key is-ocupado"></i> Con orden asignada</span>
      <span><i class="avail-days__key is-ausencia"></i> Ausencia</span>
    </p>
  `;
}


function renderAbsenceList() {
  const refs = getPageRefs();
  if (!refs.absenceList) return;

  const items = state.absences
    .slice()
    .sort((left, right) => new Date(left.startAtUtc) - new Date(right.startAtUtc));

  if (!items.length) {
    refs.absenceList.innerHTML = '<div class="agenda-loading">No hay ausencias cargadas para los proximos dias.</div>';
    return;
  }

  // Mismo formato que los bloques: una fila por dia con su jornada dibujada,
  // para que las dos solapas se lean igual.
  const porDia = new Map();
  items.forEach((absence) => {
    const dia = toDateInputValue(absence.startAtUtc);
    if (!porDia.has(dia)) porDia.set(dia, []);
    porDia.get(dia).push(absence);
  });

  const escala = [8, 12, 16, 20]
    .map((hora) => {
      const izquierda = ((hora - TIMELINE_START_HOUR) / TIMELINE_HOURS) * 100;
      return `<span class="avail-day__tick" style="left:${izquierda}%">${String(hora).padStart(2, "0")}</span>`;
    })
    .join("");

  refs.absenceList.innerHTML = `
    <div class="avail-days">
      ${[...porDia.entries()].map(([dia, ausencias]) => {
        const carga = getDayLoad(dia);
        const minutos = ausencias.reduce((total, absence) =>
          total + (new Date(absence.endAtUtc) - new Date(absence.startAtUtc)) / 60000, 0);

        return `
          <article class="avail-day" data-day="${escapeHtml(dia)}">
            <header class="avail-day__head">
              <div>
                <strong>${escapeHtml(formatDate(`${dia}T12:00:00Z`))}</strong>
                <span>${escapeHtml(formatDurationMinutes(minutos))} bloqueados${carga.bloques.length ? ` · ${escapeHtml(formatDurationMinutes(carga.minutosLibres))} de disponibilidad ese dia` : ""}</span>
              </div>
              <span class="avail-day__count">${escapeHtml(String(ausencias.length))} ${ausencias.length === 1 ? "ausencia" : "ausencias"}</span>
            </header>

            <div class="avail-day__track">
              ${carga.tramos.map((tramo) => `
                <span class="avail-day__seg is-${tramo.tipo}"
                  style="left:${tramo.desde.toFixed(2)}%;width:${tramo.ancho.toFixed(2)}%"
                  title="${escapeHtml(tramo.etiqueta)}"></span>
              `).join("")}
            </div>
            <div class="avail-day__scale">${escala}</div>

            <ul class="avail-day__blocks">
              ${ausencias.map((absence) => `
                <li class="avail-day__block" data-absence-id="${escapeHtml(absence.id)}">
                  <span class="avail-day__range">${escapeHtml(formatTime(absence.startAtUtc))} a ${escapeHtml(formatTime(absence.endAtUtc))}</span>
                  <span class="avail-day__len">${escapeHtml(absence.reason || "Sin motivo")}</span>
                  <span class="avail-day__acts">
                    <button type="button" class="avail-day__act" data-action="edit-absence" data-absence-id="${escapeHtml(absence.id)}">Editar</button>
                    <button type="button" class="avail-day__act is-danger" data-action="delete-absence" data-absence-id="${escapeHtml(absence.id)}">Eliminar</button>
                  </span>
                </li>
              `).join("")}
            </ul>
          </article>
        `;
      }).join("")}
    </div>

    <p class="avail-days__legend">
      <span><i class="avail-days__key is-libre"></i> Disponible</span>
      <span><i class="avail-days__key is-ocupado"></i> Con orden asignada</span>
      <span><i class="avail-days__key is-ausencia"></i> Ausencia</span>
    </p>
  `;
}


function renderSummaryCards() {
  const refs = getPageRefs();
  const now = new Date();
  const todayKey = toDateInputValue(now);
  const todayCount = state.orders.filter((order) => toDateInputValue(order.scheduledStartAtUtc) === todayKey).length;
  const activeCount = state.orders.filter((order) => ["Created", "Approved", "Confirmed", "InProgress", 1, 2, 3, 7].includes(order.status)).length;
  const inProgressCount = state.orders.filter((order) => ["InProgress", 3].includes(order.status)).length;
  const nextOrder = state.orders
    .filter((order) => new Date(order.scheduledEndAtUtc) > now)
    .sort((left, right) => new Date(left.scheduledStartAtUtc) - new Date(right.scheduledStartAtUtc))[0];

  if (refs.ordersToday) refs.ordersToday.textContent = String(todayCount);
  if (refs.activeOrders) refs.activeOrders.textContent = String(activeCount);
  if (refs.inProgressOrders) refs.inProgressOrders.textContent = String(inProgressCount);
  // Es una hora, no un contador: "0" no significaba nada cuando no habia
  // proximo servicio.
  if (refs.nextService) refs.nextService.textContent = nextOrder ? formatTime(nextOrder.scheduledStartAtUtc) : "-";
}

function renderProviderChangeRequests() {
  const refs = getPageRefs();
  if (!refs.technicianProviderChangeRequests) return;

  if (!state.providerChangeRequests.length) {
    refs.technicianProviderChangeRequests.innerHTML = '<p class="request-empty-text">Todavia no registraste solicitudes de cambio de entidad.</p>';
    return;
  }

  refs.technicianProviderChangeRequests.innerHTML = state.providerChangeRequests
    .slice()
    .sort((left, right) => new Date(right.requestedAtUtc) - new Date(left.requestedAtUtc))
    .map((request) => `
      <article class="profile-request-card">
        <div class="profile-request-card__head">
          <div>
            <h4>${escapeHtml(getProviderName(request.requestedProviderEntityId))}</h4>
            <p>Solicitada ${escapeHtml(formatDateTime(request.requestedAtUtc))}</p>
          </div>
          <span class="provider-status-badge">${escapeHtml(getRequestStatusLabel(request.status))}</span>
        </div>
        <div class="provider-meta-list">
          <div class="provider-meta-item">
            <strong>Entidad actual</strong>
            <span>${escapeHtml(getProviderName(request.currentProviderEntityId))}</span>
          </div>
          <div class="provider-meta-item">
            <strong>Nota</strong>
            <span>${escapeHtml(request.note || "-")}</span>
          </div>
          <div class="provider-meta-item">
            <strong>Resolucion</strong>
            <span>${escapeHtml(request.resolutionNote || "-")}</span>
          </div>
        </div>
      </article>
    `)
    .join("");
}

function populateProfile() {
  const refs = getPageRefs();
  if (!state.user || !state.technicianProfile) return;

  const displayName = [state.user.firstName, state.user.lastName].filter(Boolean).join(" ").trim() || state.user.email || "Tecnico";
  if (refs.userMenuName) refs.userMenuName.textContent = displayName;
  if (refs.welcomeName) refs.welcomeName.textContent = "Jornada operativa";
  if (refs.welcomeMessage) refs.welcomeMessage.textContent = `${displayName}: agenda, bandeja y seguimiento para ejecutar, registrar evidencia y cerrar cada orden con trazabilidad.`;

  const entidad = getProviderName(state.technicianProfile.providerEntityId);
  const especialidad = state.technicianProfile.specialty || "";
  const alta = state.technicianProfile.createdAtUtc ?? state.technicianProfile.CreatedAtUtc;

  const avatar = document.getElementById("technicianAvatar");
  if (avatar) avatar.textContent = getInitials(displayName);

  const nombre = document.getElementById("technicianProfileName");
  if (nombre) nombre.textContent = displayName;

  const email = document.getElementById("technicianProfileEmail");
  if (email) email.textContent = state.user.email || "-";

  const meta = document.getElementById("technicianProfileMeta");
  if (meta) {
    const desde = alta
      ? `En la plataforma desde ${formatArgentinaDate(alta, { weekday: undefined, day: undefined, month: "long", year: "numeric" })}`
      : "";
    meta.textContent = [entidad, desde].filter(Boolean).join(" · ");
  }

  const badge = document.getElementById("technicianProfileSpecialty");
  if (badge) {
    badge.textContent = especialidad || "Sin especialidad cargada";
    badge.classList.toggle("is-empty", !especialidad);
  }

  renderTechnicianProfileStats();
  renderTechnicianProfileFacts(displayName, entidad, especialidad, alta);

  const currentProviderName = document.getElementById("technicianCurrentProviderName");
  if (currentProviderName) currentProviderName.textContent = entidad;
}

function renderTechnicianProfileStats() {
  const contenedor = document.getElementById("technicianProfileStats");
  if (!contenedor) return;

  const hoy = getArgentinaDateInputValue();
  const delDia = state.orders.filter((order) =>
    order.scheduledStartAtUtc && toDateInputValue(order.scheduledStartAtUtc) === hoy).length;
  const activas = state.orders.filter((order) => !isClosedTechnicianOrder(order)).length;
  const minutosCargados = state.availability.reduce((total, slot) =>
    total + (new Date(slot.endAtUtc) - new Date(slot.startAtUtc)) / 60000, 0);

  const tiles = [
    { icon: "fa-calendar-day", value: String(delDia), label: "Ordenes hoy" },
    { icon: "fa-clipboard-list", value: String(activas), label: "Activas" },
    { icon: "fa-clock", value: formatDurationMinutes(minutosCargados), label: "Disponibilidad cargada" },
    { icon: "fa-user-slash", value: String(state.absences.length), label: state.absences.length === 1 ? "Ausencia" : "Ausencias" }
  ];

  contenedor.innerHTML = tiles.map((tile) => `
    <div class="tech-profile-stat">
      <i class="fas ${tile.icon}" aria-hidden="true"></i>
      <div>
        <strong>${escapeHtml(tile.value)}</strong>
        <small>${escapeHtml(tile.label)}</small>
      </div>
    </div>
  `).join("");
}

function renderTechnicianProfileFacts(displayName, entidad, especialidad, alta) {
  const contenedor = document.getElementById("technicianProfileFacts");
  if (!contenedor) return;

  // Se muestran como valores y no como campos de formulario: el tecnico no puede
  // editarlos. El endpoint de actualizacion es de la entidad proveedora.
  const filas = [
    ["Nombre", displayName],
    ["Email", state.user.email || "-"],
    ["Especialidad", especialidad || "Sin especialidad cargada"],
    ["Entidad proveedora", entidad],
    ["Alta en la plataforma", alta ? formatDate(alta) : "-"]
  ];

  contenedor.innerHTML = filas.map(([etiqueta, valor]) => `
    <div>
      <dt>${escapeHtml(etiqueta)}</dt>
      <dd>${escapeHtml(valor)}</dd>
    </div>
  `).join("");
}

/** Una orden deja de estar activa cuando se finaliza o se cierra. */
function isClosedTechnicianOrder(order) {
  const estado = order.status;
  return estado === 4 || estado === 6 || estado === "Finalized" || estado === "Closed";
}


async function loadAvailability() {
  const refs = getPageRefs();
  if (!state.technicianProfile) throw new Error("No se pudo resolver el perfil tecnico.");

  if (refs.availabilityList) {
    refs.availabilityList.innerHTML = '<div class="agenda-loading">Cargando disponibilidad...</div>';
  }
  if (refs.availabilityWeeklySummary) {
    refs.availabilityWeeklySummary.innerHTML = '<div class="agenda-loading">Cargando resumen...</div>';
  }

  const fromUtc = getArgentinaRangeStartUtcIso();
  const toUtc = getArgentinaRangeEndUtcIso(21);
  const availability = await FrontGateway.scheduling.getAvailabilityByTechnician(state.technicianProfile.id, fromUtc, toUtc);

  state.availability = availability.map(normalizeAvailabilitySlot);
  // La carga inicial cubre 21 dias: el selector semanal lo usa para saber hasta
  // donde puede detectar conflictos sin volver a pedir.
  state.bulkLoadedUntil = shiftArgentinaDate(getArgentinaDateInputValue(), 21);
  renderAvailabilityList();
  renderAgendaWeek();
  renderAgendaMonth();
  renderBulkAvailability();
}

async function loadAbsences() {
  const refs = getPageRefs();
  if (!state.technicianProfile) throw new Error("No se pudo resolver el perfil tecnico.");

  if (refs.absenceList) {
    refs.absenceList.innerHTML = '<div class="agenda-loading">Cargando ausencias...</div>';
  }

  const fromUtc = getArgentinaRangeStartUtcIso();
  const toUtc = getArgentinaRangeEndUtcIso(21);
  const absences = await FrontGateway.scheduling.getAbsencesByTechnician(state.technicianProfile.id, fromUtc, toUtc);

  state.absences = absences.map(normalizeAbsenceSlot);
  renderAbsenceList();
  renderAvailabilityList();
  renderAgendaWeek();
  renderAgendaMonth();
}

async function loadOrders() {
  const refs = getPageRefs();
  if (!state.technicianProfile) throw new Error("No se pudo resolver el perfil tecnico.");

  if (refs.consultationsList) {
    refs.consultationsList.innerHTML = '<div class="agenda-loading">Cargando ordenes...</div>';
  }
  if (refs.weeklySchedule) {
    refs.weeklySchedule.innerHTML = '<div class="agenda-loading">Cargando agenda semanal...</div>';
  }
  if (refs.technicianAgendaList) {
    refs.technicianAgendaList.innerHTML = '<div class="agenda-loading">Cargando agenda tecnica...</div>';
  }
  if (refs.technicianExecutionList) {
    refs.technicianExecutionList.innerHTML = '<div class="agenda-loading">Cargando seguimiento operativo...</div>';
  }
  if (refs.technicianOrdersList) {
    refs.technicianOrdersList.innerHTML = '<div class="agenda-loading">Cargando ordenes asignadas...</div>';
  }

  const orders = await FrontGateway.order.getOrdersByTechnician(state.technicianProfile.id);
  state.orders = orders
    .map(normalizeOrder)
    .sort((left, right) => new Date(left.scheduledStartAtUtc) - new Date(right.scheduledStartAtUtc));

  await loadClientNames();

  renderDashboardOrders();
  renderOrderWeekSummary(refs.weeklySchedule, state.orders);
  renderAgendaList();
  renderExecutionOrders();
  renderOrdersList();
  renderSummaryCards();
  // Las ordenes pintan los tramos ocupados de la linea del tiempo.
  renderAvailabilityList();
}

// El tecnico veia al cliente como "#c1111111". Los nombres viven en
// DirectoryMS por entidad proveedora; si el rol no tuviera permiso sobre ese
// endpoint, se conserva el identificador corto como respaldo.
async function loadClientNames() {
  const providerEntityId = state.technicianProfile?.providerEntityId;
  if (!isGuid(providerEntityId)) return;

  try {
    const profiles = await FrontGateway.directory.getClientProfilesByProvider(providerEntityId);
    state.clientNamesById = new Map(
      profiles
        .map((profile) => [
          profile.id ?? profile.Id,
          profile.fullName ?? profile.FullName ?? ""
        ])
        .filter(([id, fullName]) => isGuid(id) && fullName)
    );
  } catch (error) {
    console.warn("No se pudieron resolver los nombres de los clientes.", error);
  }
}

function getClientDisplayName(clientId) {
  return state.clientNamesById?.get(clientId) || `Cliente #${shortenGuid(clientId)}`;
}

async function openOrderDetail(orderId, { preserveFeedback = false } = {}) {
  clearEvidencePreviewUrls();
  const detail = await FrontGateway.order.getOrderDetail(orderId);

  state.currentOrderDetail = normalizeOrder(detail.order ?? detail.Order);
  state.currentOrderHistory = (detail.history ?? detail.History ?? []).map(normalizeOrderHistoryEntry);
  state.currentOrderEvidence = (detail.evidence ?? detail.Evidence ?? []).map(normalizeOrderEvidence);
  state.currentOrderCancellationRequests = (detail.cancellationRequests ?? detail.CancellationRequests ?? []).map(normalizeCancellationRequest);
  if (!preserveFeedback) {
    setOrderActionFeedback("");
  }
  renderOrderDetail();
  updateEvidencePreviewElements();
  setSection("ordenes");
  setTechnicianOrdersMode("detail");
  ensureEvidencePreviews(orderId).catch((error) => {
    console.warn("No se pudieron cargar las vistas previas de evidencia.", error);
  });
}

function findMatchingReservation(order, reservations) {
  return reservations.find((reservation) => {
    const sameClient = (reservation.clientId ?? reservation.ClientId) === order.clientId;
    const sameProvider = (reservation.providerEntityId ?? reservation.ProviderEntityId) === order.providerEntityId;
    const sameTechnician = (reservation.technicianId ?? reservation.TechnicianId) === order.technicianId;
    const sameStart = (reservation.startAtUtc ?? reservation.StartAtUtc) === order.scheduledStartAtUtc;
    const sameEnd = (reservation.endAtUtc ?? reservation.EndAtUtc) === order.scheduledEndAtUtc;
    return sameClient && sameProvider && sameTechnician && sameStart && sameEnd;
  }) || null;
}

async function transitionReservationForOrder(order, status, note) {
  const reservationId = order.reservationId;
  if (isGuid(reservationId)) {
    await FrontGateway.scheduling.updateReservationStatus(reservationId, {
      status,
      changedByUserId: state.user?.userId ?? null,
      note
    });
    return;
  }

  const reservations = await FrontGateway.scheduling.getReservationsByTechnician(order.technicianId);
  const reservation = findMatchingReservation(order, reservations);
  if (!reservation) return;

  const resolvedReservationId = reservation.id ?? reservation.Id;
  if (!isGuid(resolvedReservationId)) return;

  await FrontGateway.scheduling.updateReservationStatus(resolvedReservationId, {
    status,
    changedByUserId: state.user?.userId ?? null,
    note
  });
}

async function startOrder(orderId) {
  if (!state.currentOrderDetail || state.currentOrderDetail.id !== orderId) {
    await openOrderDetail(orderId);
  }

  const order = state.currentOrderDetail;
  const orderStatusValue = getOrderStatusValue(order.status);
  if (orderStatusValue !== ORDER_STATUS_VALUES.Confirmed) {
    throw new Error("La orden debe estar confirmada por el proveedor antes de iniciarse.");
  }

  const noteBase = "Started by technician panel.";

  await FrontGateway.order.updateOrderStatus(order.id, {
    status: ORDER_STATUS_VALUES.InProgress,
    changedByUserId: state.user?.userId ?? null,
    note: noteBase
  });

  try {
    await transitionReservationForOrder(order, ORDER_STATUS_VALUES.InProgress, noteBase);
  } catch (error) {
    console.warn("No se pudo pasar la reserva a en ejecucion.", error);
  }

  await loadOrders();
  setOrderActionFeedback("Orden iniciada correctamente.", "success");
  await openOrderDetail(order.id, { preserveFeedback: true });
}

async function createCancellationRequest(orderId, formElement) {
  const reasonValue = formElement.querySelector('select[name="reason"]')?.value || "";
  const noteValue = formElement.querySelector('textarea[name="note"]')?.value?.trim() || null;
  const reason = Number(reasonValue);

  if (!Number.isInteger(reason) || reason <= 0) {
    throw new Error("Selecciona un motivo para solicitar la cancelacion.");
  }

  await FrontGateway.order.createCancellationRequest(orderId, {
    technicianId: state.technicianProfile?.id,
    reason,
    requestedByUserId: state.user?.userId ?? null,
    note: noteValue
  });

  setOrderActionFeedback("Solicitud de cancelacion enviada correctamente.", "success");
  await loadOrders();
  await openOrderDetail(orderId, { preserveFeedback: true });
}

function openCancellationModal(orderId) {
  const modal = document.getElementById("cancellation-modal");
  if (!modal) return;

  const form = document.getElementById("cancellationForm");
  form?.reset();
  modal.dataset.orderId = orderId;
  modal.classList.remove("hidden");
  syncDialogVisibility(modal);
}

function setEvidenceModalTab(tabKey) {
  const modal = document.getElementById("evidence-modal");
  if (!modal) return;

  modal.querySelectorAll("[data-evidence-tab]").forEach((tab) => {
    const isActive = tab.dataset.evidenceTab === tabKey;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  modal.querySelectorAll("[data-evidence-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.evidencePanel !== tabKey);
  });
}

function openEvidenceModal(orderId) {
  const modal = document.getElementById("evidence-modal");
  if (!modal) return;

  modal.dataset.orderId = orderId;
  modal.querySelectorAll("form[data-form]").forEach((form) => {
    form.reset();
    form.dataset.orderId = orderId;
    const fileNameElement = form.querySelector('[data-role="file-name"]');
    if (fileNameElement) {
      fileNameElement.textContent = "Todavia no elegiste un archivo.";
    }
  });

  setEvidenceModalTab("photo");
  modal.classList.remove("hidden");
  syncDialogVisibility(modal);
}

function closeEvidenceModal() {
  const modal = document.getElementById("evidence-modal");
  if (!modal || modal.classList.contains("hidden")) return;

  modal.classList.add("hidden");
  syncDialogVisibility(modal);
}

async function loadProviderContext() {
  if (!state.technicianProfile) throw new Error("No se pudo resolver el perfil tecnico.");

  const [currentProvider, providers, providerChangeRequests] = await Promise.all([
    FrontGateway.directory.getProviderById(state.technicianProfile.providerEntityId),
    FrontGateway.directory.getProviders(),
    FrontGateway.directory.getTechnicianProviderChangeRequestsByTechnician(state.technicianProfile.id)
  ]);

  state.currentProviderEntity = normalizeProviderEntity(currentProvider);
  state.availableProviders = providers.map(normalizeProviderEntity);
  state.providerChangeRequests = providerChangeRequests.map(normalizeProviderChangeRequest);
}

async function createProviderChangeRequest() {
  const refs = getPageRefs();
  const requestedProviderEntityId = refs.technicianProviderTargetSelect?.value?.trim() || "";
  const note = refs.technicianProviderChangeNote?.value?.trim() || null;

  if (!isGuid(requestedProviderEntityId)) {
    throw new Error("Selecciona la entidad destino para enviar la solicitud.");
  }

  await FrontGateway.directory.createTechnicianProviderChangeRequest({
    technicianProfileId: state.technicianProfile?.id,
    requestedProviderEntityId,
    requestedByAuthUserId: state.user?.userId ?? null,
    note
  });

  if (refs.technicianProviderTargetSelect) refs.technicianProviderTargetSelect.value = "";
  if (refs.technicianProviderChangeNote) refs.technicianProviderChangeNote.value = "";

  showProviderChangeFeedback("Solicitud enviada. La entidad destino debe aprobar el cambio.", "success");
  await loadProviderContext();
  populateProfile();
  showProviderChangeFeedback("Solicitud enviada. La entidad destino debe aprobar el cambio.", "success");
}

async function finalizeOrder(orderId) {
  if (!state.currentOrderDetail || state.currentOrderDetail.id !== orderId) {
    await openOrderDetail(orderId);
  }

  const order = state.currentOrderDetail;
  if (!state.currentOrderEvidence.length) {
    setOrderActionFeedback("Carga al menos una evidencia antes de finalizar la orden.", "error");
    renderOrderDetail();
    return;
  }

  const note = "Finalized by technician panel.";

  await FrontGateway.order.updateOrderStatus(order.id, {
    status: ORDER_STATUS_VALUES.Finalized,
    changedByUserId: state.user?.userId ?? null,
    note
  });

  try {
    await transitionReservationForOrder(order, ORDER_STATUS_VALUES.Finalized, note);
  } catch (error) {
    console.warn("No se pudo finalizar la reserva asociada.", error);
  }

  await loadOrders();
  setOrderActionFeedback("Orden finalizada correctamente.", "success");
  await openOrderDetail(order.id, { preserveFeedback: true });
}

async function addPhotoEvidence(orderId, formElement) {
  const fileInput = formElement.querySelector('input[type="file"][name="file"]');
  const noteInput = formElement.querySelector('textarea[name="note"]');
  const file = fileInput?.files?.[0] ?? null;

  if (!(file instanceof File)) {
    throw new Error("Selecciona una imagen antes de guardar la evidencia.");
  }

  await FrontGateway.order.addPhotoEvidence(orderId, {
    file,
    recordedByUserId: state.user?.userId ?? null,
    note: noteInput?.value?.trim() ?? null
  });

  setOrderActionFeedback("Foto de evidencia registrada correctamente.", "success");
  await openOrderDetail(orderId, { preserveFeedback: true });
}

async function addDigitalCheckEvidence(orderId, formElement) {
  const noteInput = formElement.querySelector('textarea[name="note"]');

  await FrontGateway.order.addDigitalCheckEvidence(orderId, {
    recordedByUserId: state.user?.userId ?? null,
    note: noteInput?.value?.trim() ?? null
  });

  setOrderActionFeedback("Check digital registrado correctamente.", "success");
  await openOrderDetail(orderId, { preserveFeedback: true });
}

async function downloadEvidenceFile(orderId, evidenceId, fallbackFileName = "evidencia.bin") {
  const result = await FrontGateway.order.downloadEvidenceFile(orderId, evidenceId);
  downloadBlob(result.blob, result.fileName || fallbackFileName);
}

function beginAvailabilityEdit(availabilityId) {
  const refs = getPageRefs();
  const slot = state.availability.find((item) => item.id === availabilityId);
  if (!slot) return;

  state.editingAvailabilityId = availabilityId;
  refs.availabilityDate.value = toDateInputValue(slot.startAtUtc);
  refs.availabilityStartTime.value = toTimeInputValue(slot.startAtUtc);
  refs.availabilityEndTime.value = toTimeInputValue(slot.endAtUtc);

  if (refs.availabilitySubmitBtn) {
    refs.availabilitySubmitBtn.textContent = "Guardar cambios";
  }
  refs.availabilityForm?.classList.remove("hidden");
  refs.availabilityForm?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  showAvailabilityFeedback("Editando bloque existente.", "info");
  setSection("disponibilidad");
}

async function deleteAvailability(availabilityId) {
  const confirmed = await confirmAppAction({
    title: "Eliminar bloque de disponibilidad",
    message: "Esta franja dejara de estar disponible para nuevas asignaciones. Puedes volver a cargarla mas tarde.",
    confirmLabel: "Eliminar bloque",
    cancelLabel: "Cancelar",
    tone: "danger"
  });
  if (!confirmed) return;

  showAvailabilityFeedback("Eliminando bloque...", "info");
  await FrontGateway.scheduling.deleteAvailability(availabilityId);
  resetAvailabilityForm();
  await loadAvailability();
  showAvailabilityFeedback("Disponibilidad eliminada correctamente.", "success");
}

function beginAbsenceEdit(absenceId) {
  const refs = getPageRefs();
  const absence = state.absences.find((item) => item.id === absenceId);
  if (!absence) return;

  state.editingAbsenceId = absenceId;
  refs.absenceDate.value = toDateInputValue(absence.startAtUtc);
  refs.absenceStartTime.value = toTimeInputValue(absence.startAtUtc);
  refs.absenceEndTime.value = toTimeInputValue(absence.endAtUtc);
  refs.absenceReason.value = absence.reason;

  if (refs.absenceSubmitBtn) {
    refs.absenceSubmitBtn.textContent = "Actualizar ausencia";
  }
  refs.absenceCancelEditBtn?.classList.remove("hidden");
  showAbsenceFeedback("Editando ausencia existente.", "info");
  setSection("disponibilidad");
}

async function deleteAbsence(absenceId) {
  const confirmed = await confirmAppAction({
    title: "Eliminar ausencia programada",
    message: "La ausencia dejara de bloquear la agenda y el sistema podra volver a asignarte trabajo en esa franja.",
    confirmLabel: "Eliminar ausencia",
    cancelLabel: "Cancelar",
    tone: "danger"
  });
  if (!confirmed) return;

  showAbsenceFeedback("Eliminando ausencia...", "info");
  await FrontGateway.scheduling.deleteAbsence(absenceId);
  resetAbsenceForm();
  await loadAbsences();
  showAbsenceFeedback("Ausencia eliminada correctamente.", "success");
}

function validateAvailabilityForm(dateValue, startTimeValue, endTimeValue) {
  if (!dateValue || !startTimeValue || !endTimeValue) {
    throw new Error("Completa dia, hora de inicio y hora de fin.");
  }

  const startAtUtc = argentinaDateTimeToUtcIso(dateValue, startTimeValue);
  const endAtUtc = argentinaDateTimeToUtcIso(dateValue, endTimeValue);

  if (!startAtUtc || !endAtUtc) {
    throw new Error("La fecha u hora ingresada no es valida.");
  }

  if (new Date(endAtUtc) <= new Date(startAtUtc)) {
    throw new Error("La hora de fin debe ser posterior a la hora de inicio.");
  }

  return {
    startAtUtc,
    endAtUtc
  };
}

function validateAbsenceForm(dateValue, startTimeValue, endTimeValue, reason) {
  const payload = validateAvailabilityForm(dateValue, startTimeValue, endTimeValue);

  if (!reason || !String(reason).trim()) {
    throw new Error("Ingresa un motivo para la ausencia.");
  }

  return {
    ...payload,
    reason: String(reason).trim()
  };
}

/* --- Carga de disponibilidad por dias de la semana --- */

const BULK_WEEKDAYS = [
  { offset: 0, short: "Lun", long: "lunes" },
  { offset: 1, short: "Mar", long: "martes" },
  { offset: 2, short: "Mié", long: "miércoles" },
  { offset: 3, short: "Jue", long: "jueves" },
  { offset: 4, short: "Vie", long: "viernes" },
  { offset: 5, short: "Sáb", long: "sábado" },
  { offset: 6, short: "Dom", long: "domingo" }
];

/** Cuantas peticiones se disparan a la vez al crear los bloques. */
const BULK_CONCURRENCY = 6;

/**
 * Lunes de la semana que contiene la fecha dada, en dias de Argentina.
 * getDay() sobre un input date lo interpreta como UTC, que para el huso
 * argentino cae el dia anterior: por eso se arma la fecha a mediodia.
 */
function getWeekStart(dateValue) {
  const { year, month, day } = splitDateInput(dateValue);
  const noon = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const weekday = (noon.getUTCDay() + 6) % 7; // 0 = lunes
  return shiftArgentinaDate(dateValue, -weekday);
}

function splitDateInput(dateValue) {
  const [year, month, day] = String(dateValue).split("-").map(Number);
  return { year, month, day };
}

function getBulkWeekDates() {
  return BULK_WEEKDAYS.map((weekday) => ({
    ...weekday,
    date: shiftArgentinaDate(state.bulkWeekStart, weekday.offset)
  }));
}

/**
 * Un dia no se puede cargar si su bloque ya arranco: el backend exige que la
 * disponibilidad empiece en el futuro. Eso alcanza tambien al dia de hoy cuando
 * el horario elegido ya paso.
 */
function isBulkDayInThePast(dateValue, startTime) {
  const startAtUtc = argentinaDateTimeToUtcIso(dateValue, startTime || "00:00");
  if (!startAtUtc) return true;
  return new Date(startAtUtc).getTime() <= Date.now();
}

/** Bloques ya cargados que se cruzan con el horario pedido para ese dia. */
function findBulkConflicts(dateValue, startTime, endTime) {
  const startAtUtc = argentinaDateTimeToUtcIso(dateValue, startTime);
  const endAtUtc = argentinaDateTimeToUtcIso(dateValue, endTime);
  if (!startAtUtc || !endAtUtc) return [];

  const start = new Date(startAtUtc).getTime();
  const end = new Date(endAtUtc).getTime();

  return state.availability.filter((slot) => {
    const slotStart = new Date(slot.startAtUtc).getTime();
    const slotEnd = new Date(slot.endAtUtc).getTime();
    return slotStart < end && slotEnd > start;
  });
}

function getBulkTimes() {
  const refs = getPageRefs();
  return {
    startTime: refs.availabilityBulkStart?.value || "",
    endTime: refs.availabilityBulkEnd?.value || ""
  };
}

function isBulkTimeRangeValid(startTime, endTime) {
  if (!startTime || !endTime) return false;
  return startTime < endTime;
}

/**
 * Estado de cada dia de la semana mostrada. Es lo que pinta los chips y lo que
 * decide que se envia, asi que vive en un solo lugar.
 */
function getBulkDayStates() {
  const { startTime, endTime } = getBulkTimes();
  const rangeIsValid = isBulkTimeRangeValid(startTime, endTime);

  return getBulkWeekDates().map((weekday) => {
    const past = isBulkDayInThePast(weekday.date, startTime);
    const conflicts = rangeIsValid && !past ? findBulkConflicts(weekday.date, startTime, endTime) : [];

    return {
      ...weekday,
      past,
      conflicts,
      selectable: !past && rangeIsValid,
      selected: state.bulkSelectedDates.has(weekday.date)
    };
  });
}

function renderBulkDays() {
  const refs = getPageRefs();
  if (!refs.availabilityBulkDays) return;

  const days = getBulkDayStates();

  refs.availabilityBulkDays.innerHTML = days.map((day) => {
    const classes = ["avail-day-chip"];
    if (day.selected) classes.push("is-selected");
    if (day.past) classes.push("is-past");
    else if (day.conflicts.length) classes.push("is-conflict");

    const dayNumber = Number(day.date.split("-")[2]);
    const note = day.past
      ? "ya pasó"
      : day.conflicts.length
        ? `ocupado ${formatArgentinaTime(day.conflicts[0].startAtUtc, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`
        : "";

    return `
      <button type="button"
        class="${classes.join(" ")}"
        data-bulk-date="${escapeHtml(day.date)}"
        ${day.past ? "disabled" : ""}
        aria-pressed="${day.selected ? "true" : "false"}"
        title="${escapeHtml(day.long)} ${dayNumber}${note ? ` · ${note}` : ""}">
        <span class="avail-day-chip__name">${escapeHtml(day.short)}</span>
        <span class="avail-day-chip__num">${dayNumber}</span>
        ${note ? `<span class="avail-day-chip__note">${escapeHtml(note)}</span>` : ""}
      </button>
    `;
  }).join("");

  renderBulkSummary(days);
}

function renderBulkSummary(days) {
  const refs = getPageRefs();
  const { startTime, endTime } = getBulkTimes();
  const selected = days.filter((day) => day.selected && !day.past);
  const conflicting = selected.filter((day) => day.conflicts.length);
  const creatable = selected.length - conflicting.length;

  if (refs.availabilityBulkSubmit) {
    refs.availabilityBulkSubmit.disabled = creatable === 0;
    refs.availabilityBulkSubmit.textContent = creatable > 0
      ? `Cargar ${creatable} ${creatable === 1 ? "día" : "días"}`
      : "Cargar días seleccionados";
  }

  if (!refs.availabilityBulkSummary) return;

  if (!isBulkTimeRangeValid(startTime, endTime)) {
    refs.availabilityBulkSummary.textContent = "Elegí un horario válido: la hora de fin tiene que ser posterior al inicio.";
    return;
  }

  if (!selected.length) {
    refs.availabilityBulkSummary.textContent = "Marcá los días a los que querés aplicar ese horario.";
    return;
  }

  const partes = [`${creatable} ${creatable === 1 ? "bloque" : "bloques"} de ${startTime} a ${endTime}`];
  if (conflicting.length) {
    // El aviso llega antes de enviar para que se pueda destildar el dia; si se
    // envia igual, ese dia se saltea y se informa en el resultado.
    partes.push(`${conflicting.length} se ${conflicting.length === 1 ? "saltea" : "saltean"} porque ya ${conflicting.length === 1 ? "tenés" : "tenés"} algo cargado (${conflicting.map((day) => day.short).join(", ")})`);
  }

  refs.availabilityBulkSummary.textContent = partes.join(" · ");
}

function renderBulkWeekLabel() {
  const refs = getPageRefs();
  if (refs.availabilityBulkWeekLabel) {
    const end = shiftArgentinaDate(state.bulkWeekStart, 6);
    const [, mesInicio, diaInicio] = state.bulkWeekStart.split("-");
    const [anioFin, mesFin, diaFin] = end.split("-");
    const nombreMes = (fecha) => formatArgentinaDate(`${fecha}T12:00:00Z`, { weekday: undefined, day: undefined, month: "long" });

    // Cuando la semana cruza de mes hay que nombrar los dos, si no alcanza con uno.
    refs.availabilityBulkWeekLabel.textContent = mesInicio === mesFin
      ? `Semana del ${Number(diaInicio)} al ${Number(diaFin)} de ${nombreMes(end)} de ${anioFin}`
      : `Semana del ${Number(diaInicio)} de ${nombreMes(state.bulkWeekStart)} al ${Number(diaFin)} de ${nombreMes(end)} de ${anioFin}`;
  }

  if (refs.availabilityBulkPrevWeek) {
    // No tiene sentido retroceder a una semana entera en el pasado.
    const currentWeekStart = getWeekStart(getArgentinaDateInputValue());
    refs.availabilityBulkPrevWeek.disabled = state.bulkWeekStart <= currentWeekStart;
  }
}

function renderBulkAvailability() {
  renderBulkWeekLabel();
  renderBulkDays();
}

/**
 * La lista del panel cubre 21 dias. Al navegar mas alla hay que traer esa semana,
 * porque si no el detector de conflictos no ve nada y diria que esta libre.
 */
async function ensureBulkWeekLoaded() {
  if (!state.technicianProfile) return;

  const weekEnd = shiftArgentinaDate(state.bulkWeekStart, 7);
  if (state.bulkLoadedUntil && weekEnd <= state.bulkLoadedUntil) return;

  const fromUtc = argentinaDateTimeToUtcIso(state.bulkWeekStart, "00:00");
  const toUtc = argentinaDateTimeToUtcIso(weekEnd, "00:00");

  try {
    const extra = await FrontGateway.scheduling.getAvailabilityByTechnician(
      state.technicianProfile.id,
      fromUtc,
      toUtc
    );

    const known = new Set(state.availability.map((slot) => slot.id));
    extra.map(normalizeAvailabilitySlot)
      .filter((slot) => !known.has(slot.id))
      .forEach((slot) => state.availability.push(slot));

    if (!state.bulkLoadedUntil || weekEnd > state.bulkLoadedUntil) {
      state.bulkLoadedUntil = weekEnd;
    }
  } catch (error) {
    console.error("No se pudo traer la disponibilidad de la semana", error);
    showBulkResult("No pudimos revisar si ya tenías bloques cargados en esta semana. Podés cargar igual, pero los días ocupados van a fallar.", "warning");
  }
}

function showBulkResult(message, tone = "") {
  const refs = getPageRefs();
  if (!refs.availabilityBulkResult) return;

  refs.availabilityBulkResult.className = `avail-bulk__result${tone ? ` is-${tone}` : ""}`;
  refs.availabilityBulkResult.innerHTML = message;
  refs.availabilityBulkResult.classList.toggle("hidden", !message);
}

async function moveBulkWeek(deltaWeeks) {
  const currentWeekStart = getWeekStart(getArgentinaDateInputValue());
  const next = shiftArgentinaDate(state.bulkWeekStart, deltaWeeks * 7);
  state.bulkWeekStart = next < currentWeekStart ? currentWeekStart : next;

  // Los dias marcados son de la semana anterior: no se arrastran.
  state.bulkSelectedDates.clear();
  showBulkResult("");
  renderBulkAvailability();

  await ensureBulkWeekLoaded();
  renderBulkAvailability();
}

function toggleBulkDay(dateValue) {
  const day = getBulkDayStates().find((item) => item.date === dateValue);
  if (!day || !day.selectable) return;

  if (state.bulkSelectedDates.has(dateValue)) state.bulkSelectedDates.delete(dateValue);
  else state.bulkSelectedDates.add(dateValue);

  renderBulkDays();
}

async function submitBulkAvailability() {
  const refs = getPageRefs();
  if (!state.technicianProfile) {
    showBulkResult("No se pudo resolver el perfil tecnico actual.", "error");
    return;
  }

  const { startTime, endTime } = getBulkTimes();
  const days = getBulkDayStates();
  const seleccionados = days.filter((day) => day.selected && !day.past);
  const salteados = seleccionados.filter((day) => day.conflicts.length);
  const aCrear = seleccionados.filter((day) => !day.conflicts.length);

  if (!aCrear.length) return;

  refs.availabilityBulkSubmit?.setAttribute("disabled", "disabled");
  showBulkResult(`Cargando ${aCrear.length} ${aCrear.length === 1 ? "bloque" : "bloques"}...`);

  const pendientes = [...aCrear];
  const creados = [];
  const fallidos = [];

  const trabajadores = Array.from({ length: Math.min(BULK_CONCURRENCY, pendientes.length) }, async () => {
    while (pendientes.length) {
      const day = pendientes.shift();
      try {
        await FrontGateway.scheduling.createAvailability({
          technicianId: state.technicianProfile.id,
          providerEntityId: state.technicianProfile.providerEntityId,
          startAtUtc: argentinaDateTimeToUtcIso(day.date, startTime),
          endAtUtc: argentinaDateTimeToUtcIso(day.date, endTime)
        });
        creados.push(day);
      } catch (error) {
        fallidos.push({ day, message: getErrorMessage(error, "no se pudo crear") });
      }
    }
  });

  await Promise.all(trabajadores);

  state.bulkSelectedDates.clear();
  refs.availabilityBulkSubmit?.removeAttribute("disabled");

  await loadAvailability();
  state.bulkLoadedUntil = null;
  await ensureBulkWeekLoaded();
  renderBulkAvailability();

  const lineas = [];
  if (creados.length) lineas.push(`<strong>${creados.length} ${creados.length === 1 ? "bloque creado" : "bloques creados"}</strong> de ${escapeHtml(startTime)} a ${escapeHtml(endTime)}.`);
  if (salteados.length) lineas.push(`${salteados.length} ${salteados.length === 1 ? "día salteado" : "días salteados"} porque ya tenías algo cargado: ${escapeHtml(salteados.map((day) => day.long).join(", "))}.`);
  fallidos.forEach(({ day, message }) => lineas.push(`No se pudo cargar el ${escapeHtml(day.long)}: ${escapeHtml(message)}`));

  const tono = fallidos.length ? "error" : creados.length ? "success" : "warning";
  showBulkResult(lineas.map((linea) => `<p>${linea}</p>`).join(""), tono);
}

function setupBulkAvailability() {
  const refs = getPageRefs();
  if (!refs.availabilityBulkDays) return;

  state.bulkWeekStart = getWeekStart(getArgentinaDateInputValue());

  refs.availabilityBulkPrevWeek?.addEventListener("click", () => {
    moveBulkWeek(-1).catch((error) => console.error(error));
  });

  refs.availabilityBulkNextWeek?.addEventListener("click", () => {
    moveBulkWeek(1).catch((error) => console.error(error));
  });

  refs.availabilityBulkDays.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-bulk-date]");
    if (chip && !chip.disabled) toggleBulkDay(chip.dataset.bulkDate);
  });

  [refs.availabilityBulkStart, refs.availabilityBulkEnd].forEach((input) => {
    input?.addEventListener("change", () => {
      // Cambiar el horario cambia que dias estan en conflicto o ya pasaron.
      getBulkDayStates()
        .filter((day) => day.selected && !day.selectable)
        .forEach((day) => state.bulkSelectedDates.delete(day.date));
      renderBulkDays();
    });
  });

  refs.availabilityBulkSubmit?.addEventListener("click", () => {
    submitBulkAvailability().catch((error) => {
      showBulkResult(getErrorMessage(error, "No se pudieron cargar los días."), "error");
    });
  });

  renderBulkAvailability();
}

async function submitAvailabilityForm(event) {
  event.preventDefault();

  const refs = getPageRefs();
  if (!state.technicianProfile) {
    showAvailabilityFeedback("No se pudo resolver el perfil tecnico actual.", "error");
    return;
  }

  try {
    const wasEditing = Boolean(state.editingAvailabilityId);
    const payload = validateAvailabilityForm(
      refs.availabilityDate?.value,
      refs.availabilityStartTime?.value,
      refs.availabilityEndTime?.value
    );

    if (wasEditing) {
      showAvailabilityFeedback("Actualizando disponibilidad...", "info");
      await FrontGateway.scheduling.updateAvailability(state.editingAvailabilityId, payload);
    } else {
      showAvailabilityFeedback("Guardando disponibilidad...", "info");
      await FrontGateway.scheduling.createAvailability({
        technicianId: state.technicianProfile.id,
        providerEntityId: state.technicianProfile.providerEntityId,
        ...payload
      });
    }

    resetAvailabilityForm();
    await loadAvailability();
    showAvailabilityFeedback(
      wasEditing ? "Disponibilidad actualizada correctamente." : "Disponibilidad registrada correctamente.",
      "success"
    );
  } catch (error) {
    console.error("No se pudo guardar la disponibilidad.", error);
    showAvailabilityFeedback(error.message || "No se pudo guardar la disponibilidad.", "error");
  }
}

async function submitAbsenceForm(event) {
  event.preventDefault();

  const refs = getPageRefs();
  if (!state.technicianProfile) {
    showAbsenceFeedback("No se pudo resolver el perfil tecnico actual.", "error");
    return;
  }

  try {
    const wasEditing = Boolean(state.editingAbsenceId);
    const payload = validateAbsenceForm(
      refs.absenceDate?.value,
      refs.absenceStartTime?.value,
      refs.absenceEndTime?.value,
      refs.absenceReason?.value
    );

    if (wasEditing) {
      showAbsenceFeedback("Actualizando ausencia...", "info");
      await FrontGateway.scheduling.updateAbsence(state.editingAbsenceId, payload);
    } else {
      showAbsenceFeedback("Guardando ausencia...", "info");
      await FrontGateway.scheduling.createAbsence({
        technicianId: state.technicianProfile.id,
        providerEntityId: state.technicianProfile.providerEntityId,
        ...payload
      });
    }

    resetAbsenceForm();
    await loadAbsences();
    showAbsenceFeedback(
      wasEditing ? "Ausencia actualizada correctamente." : "Ausencia registrada correctamente.",
      "success"
    );
  } catch (error) {
    console.error("No se pudo guardar la ausencia.", error);
    showAbsenceFeedback(error.message || "No se pudo guardar la ausencia.", "error");
  }
}

function setupAvailabilityActions() {
  const refs = getPageRefs();
  refs.availabilityForm?.addEventListener("submit", submitAvailabilityForm);
  setupBulkAvailability();
  setupAgendas();
  setupAgendaDay();
  refs.availabilityCancelEditBtn?.addEventListener("click", resetAvailabilityForm);

  refs.availabilitySubnav?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-availability-view]");
    if (!button) return;
    setAvailabilityView(button.dataset.availabilityView || "availability");
  });

  refs.availabilityList?.addEventListener("click", async (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;

    const availabilityId = actionButton.dataset.availabilityId;
    if (!isGuid(availabilityId)) return;

    if (actionButton.dataset.action === "edit-availability") {
      beginAvailabilityEdit(availabilityId);
      setAvailabilityView("availability");
      return;
    }

    if (actionButton.dataset.action === "delete-availability") {
      try {
        await deleteAvailability(availabilityId);
      } catch (error) {
        console.error("No se pudo eliminar la disponibilidad.", error);
        showAvailabilityFeedback(error.message || "No se pudo eliminar la disponibilidad.", "error");
      }
    }
  });
}

function setupAbsenceActions() {
  const refs = getPageRefs();
  refs.absenceForm?.addEventListener("submit", submitAbsenceForm);
  refs.absenceCancelEditBtn?.addEventListener("click", resetAbsenceForm);

  // Preset chips — llenan Desde/Hasta con un clic
  refs.absenceForm?.addEventListener("click", (event) => {
    const chip = event.target.closest(".avail-preset-chip");
    if (!chip) return;
    event.preventDefault();
    if (refs.absenceStartTime) refs.absenceStartTime.value = chip.dataset.start || "";
    if (refs.absenceEndTime) refs.absenceEndTime.value = chip.dataset.end || "";
  });

  refs.absenceList?.addEventListener("click", async (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;

    const absenceId = actionButton.dataset.absenceId;
    if (!isGuid(absenceId)) return;

    if (actionButton.dataset.action === "edit-absence") {
      beginAbsenceEdit(absenceId);
      setAvailabilityView("absences");
      return;
    }

    if (actionButton.dataset.action === "delete-absence") {
      try {
        await deleteAbsence(absenceId);
      } catch (error) {
        console.error("No se pudo eliminar la ausencia.", error);
        showAbsenceFeedback(error.message || "No se pudo eliminar la ausencia.", "error");
      }
    }
  });
}

function setupOrderActions() {
  const refs = getPageRefs();
  const openOrderFromEvent = async (event) => {
    // Las tarjetas de la lista ahora traen acciones propias (iniciar, cargar
    // evidencia): esos clics no deben abrir ademas el detalle.
    const actionElement = event.target.closest("[data-action]");
    if (actionElement && actionElement.dataset.action !== "open-order") return;

    const button = event.target.closest("[data-order-id]");
    if (!button) return;

    const orderId = button.dataset.orderId;
    if (!isGuid(orderId)) return;

    try {
      await openOrderDetail(orderId);
    } catch (error) {
      console.error("No se pudo abrir el detalle de la orden.", error);
      showAppFeedback(getErrorMessage(error, "No se pudo cargar el detalle de la orden."), {
        type: "error",
        title: "No pudimos abrir la orden"
      });
    }
  };

  refs.consultationsList?.addEventListener("click", openOrderFromEvent);
  refs.technicianAgendaList?.addEventListener("click", openOrderFromEvent);
  refs.technicianExecutionList?.addEventListener("click", openOrderFromEvent);
  refs.technicianOrdersList?.addEventListener("click", openOrderFromEvent);
  refs.technicianBackToOrders?.addEventListener("click", () => {
    setTechnicianOrdersMode("list");
  });
  document.getElementById("technicianOrdersStatusFilter")?.addEventListener("change", renderOrdersList);
  const handleOrderActionClick = async (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (!actionButton) return;

    const orderId = actionButton.dataset.orderId;
    if (!isGuid(orderId)) return;

    try {
      if (actionButton.dataset.action === "start-order") {
        await startOrder(orderId);
        return;
      }

      if (actionButton.dataset.action === "finalize-order") {
        await finalizeOrder(orderId);
        return;
      }

      if (actionButton.dataset.action === "download-evidence") {
        await downloadEvidenceFile(
          orderId,
          actionButton.dataset.evidenceId,
          actionButton.dataset.fileName || "evidencia.bin"
        );
        return;
      }

      if (actionButton.dataset.action === "open-evidence-modal") {
        openEvidenceModal(orderId);
        return;
      }

      if (actionButton.dataset.action === "open-cancellation-modal") {
        openCancellationModal(orderId);
      }
    } catch (error) {
      console.error("No se pudo actualizar la orden.", error);
      setOrderActionFeedback(getErrorMessage(error, "No se pudo completar la accion sobre la orden."), "error");
      renderOrderDetail();
    }
  };

  const handleEvidenceFileChange = (event) => {
    const fileInput = event.target.closest('input[type="file"][name="file"]');
    if (!fileInput) return;

    const form = fileInput.closest("form");
    const fileNameElement = form?.querySelector('[data-role="file-name"]');
    if (fileNameElement) {
      fileNameElement.textContent = fileInput.files?.[0]?.name || "Todavia no elegiste un archivo.";
    }
  };

  const handleEvidenceFormSubmit = async (event) => {
    const form = event.target.closest("form[data-form]");
    if (!form) return;

    event.preventDefault();
    const orderId = form.dataset.orderId;
    if (!isGuid(orderId)) return;

    try {
      if (form.dataset.form === "photo-evidence") {
        setOrderActionFeedback("Guardando foto de evidencia...", "info");
        await addPhotoEvidence(orderId, form);
        closeEvidenceModal();
        return;
      }

      if (form.dataset.form === "digital-check") {
        setOrderActionFeedback("Registrando check digital...", "info");
        await addDigitalCheckEvidence(orderId, form);
        closeEvidenceModal();
      }
    } catch (error) {
      console.error("No se pudo registrar la evidencia.", error);
      setOrderActionFeedback(getErrorMessage(error, "No se pudo registrar la evidencia."), "error");
      renderOrderDetail();
    }
  };

  // Los formularios de evidencia viven en el modal, fuera del contenedor del
  // detalle, y las listas ahora tienen acciones propias: los mismos handlers
  // se enganchan en todos esos lugares.
  const evidenceModal = document.getElementById("evidence-modal");
  [
    refs.technicianOrderDetail,
    evidenceModal,
    refs.consultationsList,
    refs.technicianOrdersList,
    refs.technicianExecutionList
  ].forEach((container) => {
    container?.addEventListener("click", handleOrderActionClick);
    container?.addEventListener("change", handleEvidenceFileChange);
    container?.addEventListener("submit", handleEvidenceFormSubmit);
  });
}

function setupProviderChangeActions() {
  const refs = getPageRefs();
  refs.technicianProviderChangeSubmit?.addEventListener("click", async () => {
    try {
      showProviderChangeFeedback("Enviando solicitud de cambio...", "info");
      await createProviderChangeRequest();
    } catch (error) {
      console.error("No se pudo solicitar el cambio de entidad.", error);
      showProviderChangeFeedback(getErrorMessage(error, "No se pudo enviar la solicitud."), "error");
    }
  });
}

function setupNavigation() {
  const refs = getPageRefs();

  refs.navItems.forEach((item) => {
    item.addEventListener("click", (event) => {
      event.preventDefault();
      navigateToSection(item.dataset.section || "inicio");
    });
  });

  window.addEventListener("hashchange", () => setSection(parseTechnicianSection()));

  refs.viewAgendaBtn?.addEventListener("click", (event) => { event.preventDefault(); navigateToSection("agenda"); });
  refs.manageSchedule?.addEventListener("click", () => navigateToSection("disponibilidad"));
  refs.viewClients?.addEventListener("click", () => navigateToSection("ordenes"));
  refs.emitPrescription?.addEventListener("click", () => {
    navigateToSection("ordenes");
    if (state.currentOrderDetail) {
      setOrderActionFeedback("Completa la evidencia desde el detalle de la orden seleccionada.", "info");
      renderOrderDetail();
    }
  });
}

function setupUserMenu() {
  const refs = getPageRefs();
  if (!refs.userBtn || !refs.userDropdown || !refs.userMenu) return;

  syncMenuExpandedState(refs.userBtn, false);
  refs.userBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    const isOpen = refs.userDropdown.style.display === "block";
    refs.userDropdown.style.display = isOpen ? "none" : "block";
    refs.userMenu.classList.toggle("active", !isOpen);
    syncMenuExpandedState(refs.userBtn, !isOpen);
  });

  document.addEventListener("click", (event) => {
    if (!refs.userMenu.contains(event.target)) {
      refs.userDropdown.style.display = "none";
      refs.userMenu.classList.remove("active");
      syncMenuExpandedState(refs.userBtn, false);
    }
  });

  refs.logoutBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    redirectToLogin();
  });
}

function setupAccessibleDialogs() {
  const rescheduleModal = document.getElementById("reschedule-modal");
  if (!rescheduleModal) return;

  decorateDialog(rescheduleModal, {
    titleId: "rescheduleModalTitle",
    descriptionId: "rescheduleModalDescription"
  });
  syncDialogVisibility(rescheduleModal);

  const closeDialog = () => {
    rescheduleModal.classList.add("hidden");
    syncDialogVisibility(rescheduleModal);
  };

  rescheduleModal.querySelectorAll(".close-modal, #cancelReschedule").forEach((button) => {
    button.addEventListener("click", closeDialog);
  });

  rescheduleModal.addEventListener("click", (event) => {
    if (event.target === rescheduleModal) {
      closeDialog();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !rescheduleModal.classList.contains("hidden")) {
      event.preventDefault();
      closeDialog();
    }
  });

  const observer = new MutationObserver(() => {
    syncDialogVisibility(rescheduleModal);
  });
  observer.observe(rescheduleModal, { attributes: true, attributeFilter: ["class"] });

  setupCancellationModal();
  setupEvidenceModal();
}

function setupEvidenceModal() {
  const evidenceModal = document.getElementById("evidence-modal");
  if (!evidenceModal) return;

  decorateDialog(evidenceModal, {
    titleId: "evidenceModalTitle",
    descriptionId: "evidenceModalDescription"
  });
  syncDialogVisibility(evidenceModal);

  evidenceModal.querySelectorAll(".close-modal, #cancelEvidenceModal").forEach((button) => {
    button.addEventListener("click", closeEvidenceModal);
  });

  evidenceModal.addEventListener("click", (event) => {
    if (event.target === evidenceModal) {
      closeEvidenceModal();
      return;
    }

    const tab = event.target.closest("[data-evidence-tab]");
    if (tab) {
      setEvidenceModalTab(tab.dataset.evidenceTab);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !evidenceModal.classList.contains("hidden")) {
      event.preventDefault();
      closeEvidenceModal();
    }
  });

  const observer = new MutationObserver(() => {
    syncDialogVisibility(evidenceModal);
  });
  observer.observe(evidenceModal, { attributes: true, attributeFilter: ["class"] });
}

function setupCancellationModal() {
  const cancellationModal = document.getElementById("cancellation-modal");
  if (!cancellationModal) return;

  decorateDialog(cancellationModal, {
    titleId: "cancellationModalTitle",
    descriptionId: "cancellationModalDescription"
  });
  syncDialogVisibility(cancellationModal);

  const closeDialog = () => {
    cancellationModal.classList.add("hidden");
    syncDialogVisibility(cancellationModal);
  };

  cancellationModal.querySelectorAll(".close-modal, #cancelCancellationModal").forEach((button) => {
    button.addEventListener("click", closeDialog);
  });

  cancellationModal.addEventListener("click", (event) => {
    if (event.target === cancellationModal) {
      closeDialog();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !cancellationModal.classList.contains("hidden")) {
      event.preventDefault();
      closeDialog();
    }
  });

  const observer = new MutationObserver(() => {
    syncDialogVisibility(cancellationModal);
  });
  observer.observe(cancellationModal, { attributes: true, attributeFilter: ["class"] });

  document.getElementById("cancellationForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const orderId = cancellationModal.dataset.orderId;
    if (!isGuid(orderId)) return;

    try {
      setOrderActionFeedback("Enviando solicitud de cancelacion...", "info");
      await createCancellationRequest(orderId, event.target);
      closeDialog();
    } catch (error) {
      console.error("No se pudo enviar la solicitud de cancelacion.", error);
      setOrderActionFeedback(getErrorMessage(error, "No se pudo enviar la solicitud de cancelacion."), "error");
    }
  });
}


async function bootstrapTechnicianContext() {
  const context = await ensureAuthorizedPage(["Technician"]);
  if (!context.userId || !isGuid(context.userId)) {
    throw new Error("No se encontro un identificador valido de tecnico en la sesion.");
  }

  state.user = context;
  const profile = await FrontGateway.directory.getTechnicianProfileByAuthUserId(context.userId);
  state.technicianProfile = {
    id: profile.id ?? profile.Id,
    authUserId: profile.authUserId ?? profile.AuthUserId,
    providerEntityId: profile.providerEntityId ?? profile.ProviderEntityId,
    specialty: profile.specialty ?? profile.Specialty ?? "",
    status: profile.status ?? profile.Status,
    createdAtUtc: profile.createdAtUtc ?? profile.CreatedAtUtc ?? null
  };

  if (!isGuid(state.technicianProfile.id) || !isGuid(state.technicianProfile.providerEntityId)) {
    throw new Error("El perfil tecnico recibido desde DirectoryMS no es valido.");
  }
}

export async function initializeFumigatorPanel() {
  setupUserMenu();
  setupNavigation();
  setupAvailabilityActions();
  setupAbsenceActions();
  setupOrderActions();
  setupProviderChangeActions();
  setupAccessibleDialogs();
  setSection(parseTechnicianSection());

  try {
    await bootstrapTechnicianContext();
    resetAvailabilityForm();
    resetAbsenceForm();
    await Promise.all([loadOrders(), loadAvailability(), loadAbsences(), loadProviderContext()]);
    populateProfile();
    renderOrderDetail();
  } catch (error) {
    if (isAuthRedirectError(error)) return;
    console.error("No se pudo inicializar el panel tecnico.", error);
    showAppFeedback(getErrorMessage(error, "Verifica AuthMS, DirectoryMS y SchedulingMS."), {
      type: "error",
      title: "No pudimos iniciar el panel tecnico",
      timeout: 0
    });
    window.setTimeout(() => {
      redirectToLogin();
    }, 1800);
  }
}
