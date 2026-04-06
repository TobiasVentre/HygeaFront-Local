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
  getArgentinaTimeInputValue
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
  availabilityView: "availability"
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
    profilePageHeader: document.getElementById("profilePageHeader"),
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
    availabilityViewAgendaDay: document.getElementById("availabilityViewAgendaDay"),
    availabilityViewAgendaWeek: document.getElementById("availabilityViewAgendaWeek"),
    clientsToday: document.getElementById("clients-today"),
    weeklyAppointments: document.getElementById("weekly-appointments"),
    activeConsultation: document.getElementById("active-consultation"),
    prescriptionsToday: document.getElementById("prescriptions-today"),
    profileFirstNameInput: document.getElementById("profileFirstNameInput"),
    profileLastNameInput: document.getElementById("profileLastNameInput"),
    profileEmailInput: document.getElementById("profileEmailInput"),
    profileSpecialtyInput: document.getElementById("profileSpecialtyInput"),
    specialtyChip: document.getElementById("specialtyChip"),
    profileBioInput: document.getElementById("profileBioInput"),
    bioToggle: document.getElementById("bioToggle"),
    technicianCurrentProviderName: document.getElementById("technicianCurrentProviderName"),
    technicianProviderTargetSelect: document.getElementById("technicianProviderTargetSelect"),
    technicianProviderChangeNote: document.getElementById("technicianProviderChangeNote"),
    technicianProviderChangeForm: document.getElementById("technicianProviderChangeForm"),
    technicianProviderChangeSubmit: document.getElementById("technicianProviderChangeSubmit"),
    technicianProviderChangeFeedback: document.getElementById("technicianProviderChangeFeedback"),
    technicianProviderChangeRequests: document.getElementById("technicianProviderChangeRequests"),
    manageSchedule: document.getElementById("manageSchedule"),
    viewClients: document.getElementById("viewClients"),
    emitPrescription: document.getElementById("emitPrescription"),
    navItems: Array.from(document.querySelectorAll(".sidebar-nav .nav-item"))
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
  return formatArgentinaTime(dateValue);
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
    refs.availabilitySubmitBtn.textContent = "Guardar disponibilidad";
  }
  refs.availabilityCancelEditBtn?.classList.add("hidden");
  showAvailabilityFeedback("");
  renderAvailabilityDaySummary();
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
  renderAvailabilityDaySummary();
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

function setTechnicianOrdersMode(mode = "list") {
  const refs = getPageRefs();
  refs.technicianOrdersOverview?.classList.toggle("hidden", mode !== "list");
  refs.technicianOrderDetailView?.classList.toggle("hidden", mode !== "detail");
}

function setAvailabilityView(view = "availability") {
  const refs = getPageRefs();
  const resolvedView = ["availability", "absences", "agenda-day", "agenda-week"].includes(view) ? view : "availability";
  state.availabilityView = resolvedView;

  refs.availabilityViewAvailability?.classList.toggle("hidden", resolvedView !== "availability");
  refs.availabilityViewAbsences?.classList.toggle("hidden", resolvedView !== "absences");
  refs.availabilityViewAgendaDay?.classList.toggle("hidden", resolvedView !== "agenda-day");
  refs.availabilityViewAgendaWeek?.classList.toggle("hidden", resolvedView !== "agenda-week");

  refs.availabilitySubnav?.querySelectorAll("[data-availability-view]").forEach((button) => {
    const isActive = button.dataset.availabilityView === resolvedView;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });
}

function renderAvailabilityDaySummary() {
  const refs = getPageRefs();
  if (!refs.availabilityDaySummary) return;

  const selectedDate = refs.availabilityAgendaDate?.value || getArgentinaDateInputValue();
  if (refs.availabilityAgendaDate && !refs.availabilityAgendaDate.value) {
    refs.availabilityAgendaDate.value = selectedDate;
  }

  const availableSlots = state.availability
    .filter((slot) => toDateInputValue(slot.startAtUtc) === selectedDate)
    .sort((left, right) => new Date(left.startAtUtc) - new Date(right.startAtUtc));

  const absences = state.absences
    .filter((absence) => toDateInputValue(absence.startAtUtc) === selectedDate)
    .sort((left, right) => new Date(left.startAtUtc) - new Date(right.startAtUtc));

  if (!availableSlots.length && !absences.length) {
    refs.availabilityDaySummary.innerHTML = '<div class="agenda-loading">No hay bloques ni ausencias para el dia seleccionado.</div>';
    return;
  }

  const timeline = [
    ...availableSlots.map((slot) => ({
      id: slot.id,
      type: "availability",
      startAtUtc: slot.startAtUtc,
      endAtUtc: slot.endAtUtc,
      label: "Disponible",
      note: "Bloque habilitado para nuevas asignaciones."
    })),
    ...absences.map((absence) => ({
      id: absence.id,
      type: "absence",
      startAtUtc: absence.startAtUtc,
      endAtUtc: absence.endAtUtc,
      label: "Ausencia",
      note: absence.reason || "Bloqueo operativo"
    }))
  ].sort((left, right) => new Date(left.startAtUtc) - new Date(right.startAtUtc));

  refs.availabilityDaySummary.innerHTML = `
    <div class="availability-timeline">
      ${timeline.map((entry) => `
        <article class="availability-timeline-card ${entry.type === "absence" ? "is-absence" : "is-availability"}">
          <div class="availability-timeline-card__time">
            <strong>${escapeHtml(formatTime(entry.startAtUtc))} - ${escapeHtml(formatTime(entry.endAtUtc))}</strong>
            <span>${escapeHtml(slotDurationLabel(entry.startAtUtc, entry.endAtUtc))}</span>
          </div>
          <div class="availability-timeline-card__body">
            <span class="availability-timeline-card__badge">${escapeHtml(entry.label)}</span>
            <p>${escapeHtml(entry.note)}</p>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderWeeklySummary(target, availability) {
  if (!target) return;

  if (!availability.length && !state.absences.length) {
    target.innerHTML = '<div class="agenda-loading">Todavia no hay disponibilidad cargada.</div>';
    return;
  }

  const groupedAvailability = availability.reduce((accumulator, slot) => {
    const key = toDateInputValue(slot.startAtUtc);
    if (!accumulator.has(key)) accumulator.set(key, []);
    accumulator.get(key).push(slot);
    return accumulator;
  }, new Map());

  const groupedAbsences = state.absences.reduce((accumulator, absence) => {
    const key = toDateInputValue(absence.startAtUtc);
    if (!accumulator.has(key)) accumulator.set(key, []);
    accumulator.get(key).push(absence);
    return accumulator;
  }, new Map());

  const keys = [...new Set([...groupedAvailability.keys(), ...groupedAbsences.keys()])].sort((left, right) => left.localeCompare(right));

  const markup = keys
    .map((dayKey) => {
      const orderedSlots = (groupedAvailability.get(dayKey) || [])
        .slice()
        .sort((left, right) => new Date(left.startAtUtc) - new Date(right.startAtUtc));
      const orderedAbsences = (groupedAbsences.get(dayKey) || [])
        .slice()
        .sort((left, right) => new Date(left.startAtUtc) - new Date(right.startAtUtc));

      const referenceDate = orderedSlots[0]?.startAtUtc || orderedAbsences[0]?.startAtUtc;
      const ranges = orderedSlots.length
        ? orderedSlots
        .map((slot) => `${formatTime(slot.startAtUtc)} - ${formatTime(slot.endAtUtc)}`)
        .join(" | ")
        : "Sin bloques de disponibilidad";
      const absenceLabel = orderedAbsences.length
        ? `${orderedAbsences.length} ausencia(s)`
        : "Sin ausencias";

      return `
        <div class="schedule-item">
            <span class="schedule-day-badge">
            <span class="day-abbr">${escapeHtml(formatArgentinaDateTime(referenceDate, { weekday: "short", timeZone: ARGENTINA_TIME_ZONE }).replace(".", ""))}</span>
            <span class="day-num">${escapeHtml(dayKey.slice(-2))}</span>
          </span>
          <span>${escapeHtml(formatDate(referenceDate))}</span>
          <span>${escapeHtml(ranges)}</span>
          <span class="schedule-count-badge">${orderedSlots.length} bloque(s) · ${escapeHtml(absenceLabel)}</span>
        </div>
      `;
    })
    .join("");

  target.innerHTML = markup;
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
          <span class="schedule-count-badge">${ordered.length} orden(es)</span>
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
              <div class="agenda-order-time">${escapeHtml(formatTime(order.scheduledStartAtUtc))} - ${escapeHtml(formatTime(order.scheduledEndAtUtc))}</div>
              <div class="agenda-order-services">${escapeHtml(services)}</div>
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
            <span class="agenda-day-count">${ordered.length} orden(es) · ${escapeHtml(formatDurationMinutes(totalMinutes))}</span>
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

  refs.technicianAgendaList.innerHTML = `
    <section class="agenda-visual-summary">
      <article class="agenda-visual-metric">
        <span class="agenda-visual-metric__label">Dias con agenda</span>
        <strong class="agenda-visual-metric__value">${orderedDays.length}</strong>
      </article>
      <article class="agenda-visual-metric">
        <span class="agenda-visual-metric__label">Carga total</span>
        <strong class="agenda-visual-metric__value">${escapeHtml(formatDurationMinutes(totalDurationMinutes))}</strong>
      </article>
      <article class="agenda-visual-metric">
        <span class="agenda-visual-metric__label">Proximo servicio</span>
        <strong class="agenda-visual-metric__value">${nextOrder ? escapeHtml(`${formatDate(nextOrder.scheduledStartAtUtc)} · ${formatTime(nextOrder.scheduledStartAtUtc)}`) : "Sin pendientes"}</strong>
      </article>
    </section>
    ${orderedDays.join("")}
  `;
}

function renderTechnicianOrderCard(order) {
  const services = order.items.map((item) => item.serviceName).join(", ") || "Sin items";
  return `
    <article class="consultation-item" data-order-id="${escapeHtml(order.id)}">
      <div class="consultation-header">
        <div class="consultation-info">
          <div class="consultation-client">Orden #${escapeHtml(shortenGuid(order.id))}</div>
          <div class="consultation-meta">
            <span class="consultation-date"><i class="fas fa-calendar"></i>${escapeHtml(formatDate(order.scheduledStartAtUtc))}</span>
            <span class="consultation-time"><i class="fas fa-clock"></i>${escapeHtml(formatTime(order.scheduledStartAtUtc))}</span>
          </div>
        </div>
        <span class="appointment-status-badge ${escapeHtml(getOrderStatusClass(order.status))}">${escapeHtml(getOrderStatusLabel(order.status))}</span>
      </div>
      <div class="consultation-body">
        <div class="consultation-reason-wrapper">
          <div class="consultation-reason-content">
            <div class="consultation-reason"><strong>Servicios:</strong> ${escapeHtml(services)}</div>
            <div class="consultation-reason"><strong>Duracion:</strong> ${escapeHtml(orderDurationLabel(order))}</div>
            <div class="consultation-reason"><strong>Total:</strong> ${escapeHtml(formatCurrency(order.totalAmount))}</div>
          </div>
        </div>
      </div>
      <div class="consultation-actions">
        <button type="button" class="btn btn-secondary" data-action="open-order" data-order-id="${escapeHtml(order.id)}">Ver detalle</button>
      </div>
    </article>
  `;
}

function renderDashboardOrders() {
  const refs = getPageRefs();
  if (!refs.consultationsList) return;

  const upcoming = state.orders.slice(0, 4);
  refs.consultationsList.innerHTML = upcoming.length
    ? upcoming.map(renderTechnicianOrderCard).join("")
    : '<div class="agenda-loading">Todavia no hay ordenes asignadas.</div>';
}

function renderExecutionOrders() {
  const refs = getPageRefs();
  if (!refs.technicianExecutionList) return;

  const executionOrders = state.orders.filter((order) => {
    const statusValue = getOrderStatusValue(order.status);
    return statusValue === ORDER_STATUS_VALUES.InProgress || statusValue === ORDER_STATUS_VALUES.Finalized;
  });

  refs.technicianExecutionList.innerHTML = executionOrders.length
    ? executionOrders.map(renderTechnicianOrderCard).join("")
    : '<div class="agenda-loading">No tenes ordenes en ejecucion o listas para cierre.</div>';
}

function renderOrdersList() {
  const refs = getPageRefs();
  if (!refs.technicianOrdersList) return;

  refs.technicianOrdersList.innerHTML = state.orders.length
    ? state.orders.map(renderTechnicianOrderCard).join("")
    : '<div class="agenda-loading">Todavia no hay ordenes en la bandeja operativa.</div>';
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
  const canStartOrder = orderStatusValue === ORDER_STATUS_VALUES.Confirmed;
  const canFinalizeOrder = orderStatusValue === ORDER_STATUS_VALUES.InProgress;
  const canCaptureEvidence = orderStatusValue === ORDER_STATUS_VALUES.InProgress || orderStatusValue === ORDER_STATUS_VALUES.Finalized;
  const canRequestCancellation = [ORDER_STATUS_VALUES.Created, ORDER_STATUS_VALUES.Approved, ORDER_STATUS_VALUES.Confirmed].includes(orderStatusValue) && !pendingCancellationRequest;
  const feedbackMarkup = state.orderActionFeedback?.message
    ? `<div class="technician-evidence-feedback is-${escapeHtml(state.orderActionFeedback.type || "info")}">${escapeHtml(state.orderActionFeedback.message)}</div>`
    : "";
  const actionsMarkup = (canStartOrder || canFinalizeOrder)
    ? `
      <div class="technician-order-actions">
        ${canStartOrder ? '<button type="button" class="btn btn-primary" data-action="start-order" data-order-id="' + escapeHtml(order.id) + '">Iniciar orden</button>' : ""}
        ${canFinalizeOrder ? '<button type="button" class="btn btn-primary" data-action="finalize-order" data-order-id="' + escapeHtml(order.id) + '"' + (hasEvidence ? "" : " disabled") + '>Finalizar orden</button>' : ""}
      </div>
    `
    : "";
  const providerConfirmationHintMarkup = orderStatusValue === ORDER_STATUS_VALUES.Created
    ? '<p class="technician-evidence-cta">La orden todavia no fue aprobada ni confirmada por el proveedor. No puedes iniciarla hasta que pase a estado Confirmada.</p>'
    : orderStatusValue === ORDER_STATUS_VALUES.Approved
      ? '<p class="technician-evidence-cta">La orden ya fue aprobada, pero todavia falta la confirmacion operativa del proveedor.</p>'
      : "";
  const evidenceHintMarkup = canFinalizeOrder && !hasEvidence
    ? '<p class="technician-evidence-cta">Necesitas al menos una evidencia registrada para cerrar la orden.</p>'
    : "";
  const cancellationMarkup = canRequestCancellation
    ? `
      <form class="technician-evidence-form" data-form="cancellation-request" data-order-id="${escapeHtml(order.id)}">
        <div class="technician-evidence-form-head">
          <h5>Solicitar cancelacion justificada</h5>
          <span>Queda pendiente de revision del proveedor</span>
        </div>
        <label class="technician-evidence-form-field">
          <span>Motivo</span>
          <select name="reason" required>
            <option value="">Seleccionar motivo</option>
            <option value="1">Falta de insumos</option>
            <option value="2">Clima adverso</option>
          </select>
        </label>
        <label class="technician-evidence-form-field">
          <span>Detalle</span>
          <textarea name="note" rows="3" placeholder="Describe brevemente por que no puedes completar la orden"></textarea>
        </label>
        <button type="submit" class="btn btn-secondary">Enviar solicitud</button>
      </form>
    `
    : pendingCancellationRequest
      ? `<p class="technician-evidence-cta">Ya hay una solicitud pendiente enviada el ${escapeHtml(formatDateTime(pendingCancellationRequest.requestedAtUtc))}. Espera la decision del proveedor.</p>`
      : '<p class="technician-evidence-cta">La cancelacion justificada ya no esta disponible para el estado actual de la orden.</p>';
  const evidenceFormsMarkup = canCaptureEvidence
    ? `
      <div class="technician-evidence-grid">
        <form class="technician-evidence-form" data-form="photo-evidence" data-order-id="${escapeHtml(order.id)}">
          <div class="technician-evidence-form-head">
            <h5>Cargar foto</h5>
            <span>Hasta 10 MB</span>
          </div>
          <label class="technician-evidence-upload" for="photoEvidenceFile">
            <input type="file" id="photoEvidenceFile" name="file" accept="image/*" required>
            <span class="technician-evidence-upload-label">Seleccionar imagen</span>
            <small data-role="file-name">Todavia no elegiste un archivo.</small>
          </label>
          <label class="technician-evidence-form-field">
            <span>Nota</span>
            <textarea name="note" rows="3" placeholder="Observacion breve sobre la imagen"></textarea>
          </label>
          <button type="submit" class="btn btn-secondary">Guardar foto</button>
        </form>

        <form class="technician-evidence-form" data-form="digital-check" data-order-id="${escapeHtml(order.id)}">
          <div class="technician-evidence-form-head">
            <h5>Registrar check digital</h5>
            <span>Sin archivo adjunto</span>
          </div>
          <label class="technician-evidence-form-field">
            <span>Nota</span>
            <textarea name="note" rows="4" placeholder="Deja constancia del control realizado"></textarea>
          </label>
          <button type="submit" class="btn btn-secondary">Registrar check</button>
        </form>
      </div>
    `
    : '<p class="technician-evidence-cta">La evidencia se habilita cuando la orden esta en ejecucion y sigue visible una vez finalizada.</p>';

  refs.technicianOrderDetail.innerHTML = `
    <div class="technician-order-detail-card">
      <div class="technician-order-detail-head">
        <div>
          <div class="technician-order-kicker">Orden #${escapeHtml(shortenGuid(order.id))}</div>
          <h3>${escapeHtml(order.items.map((item) => item.serviceName).join(", ") || "Orden de servicio")}</h3>
        </div>
        <span class="appointment-status-badge ${escapeHtml(getOrderStatusClass(order.status))}">${escapeHtml(getOrderStatusLabel(order.status))}</span>
      </div>

      <div class="technician-order-detail-grid">
        <div class="technician-order-field">
          <span class="technician-order-label">Programada</span>
          <strong>${escapeHtml(formatDateTime(order.scheduledStartAtUtc))}</strong>
        </div>
        <div class="technician-order-field">
          <span class="technician-order-label">Fin estimado</span>
          <strong>${escapeHtml(formatDateTime(order.scheduledEndAtUtc))}</strong>
        </div>
        <div class="technician-order-field">
          <span class="technician-order-label">Cliente</span>
          <strong>${escapeHtml(shortenGuid(order.clientId))}</strong>
        </div>
        <div class="technician-order-field">
          <span class="technician-order-label">Monto total</span>
          <strong>${escapeHtml(formatCurrency(order.totalAmount))}</strong>
        </div>
        <div class="technician-order-field">
          <span class="technician-order-label">Duracion</span>
          <strong>${escapeHtml(orderDurationLabel(order))}</strong>
        </div>
        <div class="technician-order-field">
          <span class="technician-order-label">Creada</span>
          <strong>${escapeHtml(formatDateTime(order.createdAtUtc))}</strong>
        </div>
      </div>

      ${order.exceptionReason ? `<div class="technician-order-alert"><strong>Motivo de excepcion:</strong> ${escapeHtml(order.exceptionReason)}</div>` : ""}

      ${actionsMarkup}
      ${providerConfirmationHintMarkup}
      ${evidenceHintMarkup}
      ${feedbackMarkup}

      <div class="technician-order-block">
        <h4>Cancelacion justificada</h4>
        ${cancellationMarkup}
        <div class="technician-order-history">${cancellationHistoryMarkup}</div>
      </div>

      <div class="technician-order-block">
        <h4>Evidencia operativa</h4>
        <div class="technician-evidence-list">${renderEvidenceListMarkup(evidenceItems)}</div>
        ${evidenceFormsMarkup}
      </div>

      <div class="technician-order-block">
        <h4>Items</h4>
        <div class="technician-order-items">${itemsMarkup}</div>
      </div>

      <div class="technician-order-block">
        <h4>Historial</h4>
        <div class="technician-order-history">${historyMarkup}</div>
      </div>
    </div>
  `;
}

function renderAvailabilityList() {
  const refs = getPageRefs();
  const slots = state.availability
    .slice()
    .sort((left, right) => new Date(left.startAtUtc) - new Date(right.startAtUtc));

  if (!refs.availabilityList) return;

  if (!slots.length) {
    refs.availabilityList.innerHTML = '<div class="agenda-loading">No hay bloques cargados para los proximos dias.</div>';
    return;
  }

  refs.availabilityList.innerHTML = slots
    .map((slot) => `
      <article class="availability-card" data-availability-id="${escapeHtml(slot.id)}">
        <div class="availability-info">
          <div class="availability-time">${escapeHtml(formatDate(slot.startAtUtc))}</div>
          <div class="availability-duration">
            ${escapeHtml(formatTime(slot.startAtUtc))} - ${escapeHtml(formatTime(slot.endAtUtc))}
            <span>(${escapeHtml(slotDurationLabel(slot.startAtUtc, slot.endAtUtc))})</span>
          </div>
        </div>
        <div class="availability-actions">
          <button type="button" class="btn btn-secondary" data-action="edit-availability" data-availability-id="${escapeHtml(slot.id)}">Editar</button>
          <button type="button" class="btn btn-secondary" data-action="delete-availability" data-availability-id="${escapeHtml(slot.id)}">Eliminar</button>
        </div>
      </article>
    `)
    .join("");
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

  refs.absenceList.innerHTML = items
    .map((absence) => `
      <article class="availability-card absence-card" data-absence-id="${escapeHtml(absence.id)}">
        <div class="availability-info">
          <div class="availability-time">${escapeHtml(formatDate(absence.startAtUtc))}</div>
          <div class="availability-duration">
            ${escapeHtml(formatTime(absence.startAtUtc))} - ${escapeHtml(formatTime(absence.endAtUtc))}
            <span>(${escapeHtml(slotDurationLabel(absence.startAtUtc, absence.endAtUtc))})</span>
          </div>
          <div class="absence-reason">${escapeHtml(absence.reason)}</div>
        </div>
        <div class="availability-actions">
          <button type="button" class="btn btn-secondary" data-action="edit-absence" data-absence-id="${escapeHtml(absence.id)}">Editar</button>
          <button type="button" class="btn btn-secondary" data-action="delete-absence" data-absence-id="${escapeHtml(absence.id)}">Eliminar</button>
        </div>
      </article>
    `)
    .join("");
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

  if (refs.clientsToday) refs.clientsToday.textContent = String(todayCount);
  if (refs.weeklyAppointments) refs.weeklyAppointments.textContent = String(activeCount);
  if (refs.activeConsultation) refs.activeConsultation.textContent = String(inProgressCount);
  if (refs.prescriptionsToday) refs.prescriptionsToday.textContent = nextOrder ? formatTime(nextOrder.scheduledStartAtUtc) : "0";
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

  if (refs.profileFirstNameInput) refs.profileFirstNameInput.value = state.user.firstName || "";
  if (refs.profileLastNameInput) refs.profileLastNameInput.value = state.user.lastName || "";
  if (refs.profileEmailInput) refs.profileEmailInput.value = state.user.email || "";
  if (refs.profileSpecialtyInput) refs.profileSpecialtyInput.value = state.technicianProfile.specialty || "";
  if (refs.specialtyChip) {
    refs.specialtyChip.textContent = state.technicianProfile.specialty || "";
    refs.specialtyChip.setAttribute("aria-hidden", state.technicianProfile.specialty ? "false" : "true");
  }
  if (refs.profileBioInput) {
    refs.profileBioInput.value = "Perfil sincronizado desde AuthMS/DirectoryMS. La edicion avanzada queda pendiente.";
  }
  if (refs.technicianCurrentProviderName) {
    refs.technicianCurrentProviderName.textContent = getProviderName(state.technicianProfile.providerEntityId);
  }
  if (refs.technicianProviderTargetSelect) {
    const providerOptions = state.availableProviders
      .filter((provider) => provider.id !== state.technicianProfile.providerEntityId && provider.isEnabled)
      .map((provider) => `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.name)}</option>`)
      .join("");
    refs.technicianProviderTargetSelect.innerHTML = `
      <option value="">Seleccionar entidad</option>
      ${providerOptions}
    `;
  }
  const hasPendingProviderChange = state.providerChangeRequests.some((request) => request.status === "Pending" || request.status === 1);
  if (refs.technicianProviderTargetSelect) refs.technicianProviderTargetSelect.disabled = hasPendingProviderChange;
  if (refs.technicianProviderChangeNote) refs.technicianProviderChangeNote.disabled = hasPendingProviderChange;
  if (refs.technicianProviderChangeSubmit) refs.technicianProviderChangeSubmit.disabled = hasPendingProviderChange;
  if (hasPendingProviderChange) {
    showProviderChangeFeedback("Ya tienes una solicitud de cambio pendiente. Espera la decision de la entidad destino.", "info");
  } else {
    showProviderChangeFeedback("");
  }
  renderProviderChangeRequests();

  setupProfileEnhancements();
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
  renderAvailabilityList();
  renderWeeklySummary(refs.availabilityWeeklySummary, state.availability);
  renderAvailabilityDaySummary();
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
  renderWeeklySummary(refs.availabilityWeeklySummary, state.availability);
  renderAvailabilityDaySummary();
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

  renderDashboardOrders();
  renderOrderWeekSummary(refs.weeklySchedule, state.orders);
  renderAgendaList();
  renderExecutionOrders();
  renderOrdersList();
  renderSummaryCards();
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
    refs.availabilitySubmitBtn.textContent = "Actualizar disponibilidad";
  }
  refs.availabilityCancelEditBtn?.classList.remove("hidden");
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
  refs.availabilityCancelEditBtn?.addEventListener("click", resetAvailabilityForm);
  refs.availabilityAgendaDate?.addEventListener("change", renderAvailabilityDaySummary);
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
  refs.technicianOrderDetail?.addEventListener("click", async (event) => {
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
      }
    } catch (error) {
      console.error("No se pudo actualizar la orden.", error);
      setOrderActionFeedback(getErrorMessage(error, "No se pudo completar la accion sobre la orden."), "error");
      renderOrderDetail();
    }
  });

  refs.technicianOrderDetail?.addEventListener("change", (event) => {
    const fileInput = event.target.closest('input[type="file"][name="file"]');
    if (!fileInput) return;

    const form = fileInput.closest("form");
    const fileNameElement = form?.querySelector('[data-role="file-name"]');
    if (fileNameElement) {
      fileNameElement.textContent = fileInput.files?.[0]?.name || "Todavia no elegiste un archivo.";
    }
  });

  refs.technicianOrderDetail?.addEventListener("submit", async (event) => {
    const form = event.target.closest("form[data-form]");
    if (!form) return;

    event.preventDefault();
    const orderId = form.dataset.orderId;
    if (!isGuid(orderId)) return;

    try {
      if (form.dataset.form === "photo-evidence") {
        setOrderActionFeedback("Guardando foto de evidencia...", "info");
        await addPhotoEvidence(orderId, form);
        return;
      }

      if (form.dataset.form === "digital-check") {
        setOrderActionFeedback("Registrando check digital...", "info");
        await addDigitalCheckEvidence(orderId, form);
        return;
      }

      if (form.dataset.form === "cancellation-request") {
        setOrderActionFeedback("Enviando solicitud de cancelacion...", "info");
        await createCancellationRequest(orderId, form);
      }
    } catch (error) {
      console.error("No se pudo registrar la evidencia.", error);
      setOrderActionFeedback(getErrorMessage(error, "No se pudo registrar la evidencia."), "error");
      renderOrderDetail();
    }
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
      setSection(item.dataset.section || "inicio");
    });
  });

  refs.manageSchedule?.addEventListener("click", () => setSection("disponibilidad"));
  refs.viewClients?.addEventListener("click", () => setSection("ordenes"));
  refs.emitPrescription?.addEventListener("click", () => {
    setSection("ordenes");
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
}

function setupProfileEnhancements() {
  const refs = getPageRefs();

  if (refs.profilePageHeader && refs.profileSection && !refs.profileSection.querySelector(".profile-header-trigger")) {
    const headerTrigger = document.createElement("div");
    headerTrigger.className = "profile-header-trigger";
    refs.profileSection.insertBefore(headerTrigger, refs.profileSection.firstChild);

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        refs.profilePageHeader?.classList.toggle("sticky", entry.intersectionRatio < 1);
      });
    }, {
      threshold: [0, 1],
      rootMargin: "-60px 0px 0px 0px"
    });

    observer.observe(headerTrigger);
  }

  const refreshSpecialtyChip = () => {
    if (!refs.specialtyChip || !refs.profileSpecialtyInput) return;
    const value = refs.profileSpecialtyInput.value.trim();
    refs.specialtyChip.textContent = value;
    refs.specialtyChip.setAttribute("aria-hidden", value ? "false" : "true");
  };

  const refreshBiographyToggle = () => {
    if (!refs.profileBioInput || !refs.bioToggle) return;
    const text = refs.profileBioInput.value || "";
    const lineCount = text.split("\n").length;
    const hasLongContent = lineCount > 3 || text.length > 200;
    refs.bioToggle.classList.toggle("hidden", !hasLongContent);

    if (!hasLongContent) {
      refs.profileBioInput.setAttribute("data-expanded", "false");
      refs.bioToggle.setAttribute("aria-expanded", "false");
      const label = refs.bioToggle.querySelector(".bio-toggle-text");
      if (label) label.textContent = "Ver mas";
    }
  };

  if (refs.profileSpecialtyInput && !refs.profileSpecialtyInput.dataset.enhanced) {
    refs.profileSpecialtyInput.addEventListener("input", refreshSpecialtyChip);
    refs.profileSpecialtyInput.dataset.enhanced = "true";
  }

  if (refs.profileBioInput && !refs.profileBioInput.dataset.enhanced) {
    refs.profileBioInput.addEventListener("input", refreshBiographyToggle);
    refs.profileBioInput.dataset.enhanced = "true";
  }

  if (refs.bioToggle && !refs.bioToggle.dataset.enhanced && refs.profileBioInput) {
    refs.bioToggle.addEventListener("click", () => {
      const isExpanded = refs.profileBioInput.getAttribute("data-expanded") === "true";
      refs.profileBioInput.setAttribute("data-expanded", isExpanded ? "false" : "true");
      refs.bioToggle.setAttribute("aria-expanded", isExpanded ? "false" : "true");
      const label = refs.bioToggle.querySelector(".bio-toggle-text");
      if (label) label.textContent = isExpanded ? "Ver mas" : "Ver menos";
    });
    refs.bioToggle.dataset.enhanced = "true";
  }

  refreshSpecialtyChip();
  refreshBiographyToggle();
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
    status: profile.status ?? profile.Status
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
  setupProfileEnhancements();
  setSection("inicio");

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
