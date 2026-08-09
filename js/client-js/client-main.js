import { FrontGateway } from "../api.js";
import {
  argentinaDateTimeToUtcIso,
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
import {
  ORDER_PROGRESS_STEPS,
  formatCompactDuration,
  getDayOffsetFromToday,
  getInitials,
  getOrderDurationMinutes,
  getOrderStatusIcon,
  getOrderStatusTone,
  getOrderTimingBadge,
  renderOrderProgressTrack as renderSharedProgressTrack
} from "../utils/order-presentation.js";

const TECHNICIAN_STATUS_ACTIVE = 1;
const SUGGESTION_STEP_MINUTES = 30;
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

const EVIDENCE_KIND_LABELS = {
  Photo: "Foto",
  DigitalCheck: "Check digital",
  1: "Foto",
  2: "Check digital"
};

let currentClientProfile = null;
let currentProviderEntity = null;
let currentMembership = null;
let currentCreditMovements = [];
let currentServiceOfferings = [];
let currentOrderItems = [];
let currentOrders = [];
let currentSuggestedSlots = [];
let currentSelectedSlot = null;
let currentOrderDetail = null;
let currentOrderDetailHistory = [];
let currentOrderDetailEvidence = [];
let currentOrderDetailEvidencePreviewUrls = new Map();
let currentOrderTechnicianProfile = null;
let currentTechniciansById = new Map();
let isClientBootstrapComplete = false;
const ACTIVE_RESERVATION_STATUSES = new Set([1, 2, 3, "Created", "Confirmed", "InProgress"]);

function logClientAvailability(message, payload = null) {
  if (payload === null) {
    console.log(`[ClientAvailability] ${message}`);
    return;
  }

  console.log(`[ClientAvailability] ${message}`, payload);
}

function getErrorMessage(error, fallbackMessage) {
  if (!error) return fallbackMessage;
  if (typeof error.message === "string" && error.message.trim() !== "") return error.message;
  if (typeof error.body === "string" && error.body.trim() !== "") return error.body;
  return fallbackMessage;
}

function isGuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function toStableGuid(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value) return null;
  if (isGuid(value)) return value;

  if (/^\d+$/.test(value)) {
    const hex = BigInt(value).toString(16).padStart(12, "0").slice(-12);
    return `00000000-0000-0000-0000-${hex}`;
  }

  return null;
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
    if (Array.isArray(value) && value.length) return value[0];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function getAuthUserIdFromToken() {
  const token = localStorage.getItem("token");
  if (!token) return null;

  const payload = parseJwt(token);
  return toStableGuid(getClaim(payload, [
    "sub",
    "userId",
    "UserId",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"
  ]));
}

function getUserDisplayName() {
  try {
    const rawUser = localStorage.getItem("user");
    if (!rawUser) return "Bienvenido";
    const user = JSON.parse(rawUser);
    const fullName = `${user.firstName || ""} ${user.lastName || ""}`.trim();
    return fullName || user.email || "Bienvenido";
  } catch {
    return "Bienvenido";
  }
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
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

function formatDurationMinutes(totalMinutes) {
  const normalizedMinutes = Number(totalMinutes || 0);
  if (normalizedMinutes <= 0) return "0 minutos";

  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;

  if (hours === 0) return `${minutes} minuto(s)`;
  if (minutes === 0) return `${hours} hora(s)`;
  return `${hours} hora(s) ${minutes} minuto(s)`;
}

function formatUtcDateRange(startAtUtc, endAtUtc) {
  if (!startAtUtc || !endAtUtc) return "-";

  const compact = (value) => formatArgentinaDate(value, { weekday: undefined, day: "2-digit", month: "short", year: "numeric" });
  return `${compact(startAtUtc)} a ${compact(endAtUtc)}`;
}

function formatFileSize(bytes) {
  const size = Number(bytes ?? 0);
  if (!Number.isFinite(size) || size <= 0) return "Sin archivo";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(value) {
  // 24h como el resto del producto: `timeStyle: short` en es-AR da "12:00 p. m.".
  return formatArgentinaDateTime(value, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
}

function formatDayLabel(value) {
  return formatArgentinaDate(value, {
    weekday: "long",
    day: "2-digit",
    month: "long"
  });
}

function getStatusLabel(status) {
  return ORDER_STATUS_LABELS[status] || String(status || "Sin estado");
}

function getStatusValue(status) {
  if (typeof status === "number") return status;

  const values = {
    Created: 1,
    Confirmed: 2,
    InProgress: 3,
    Finalized: 4,
    Exception: 5,
    Closed: 6,
    Approved: 7
  };

  return values[status] || null;
}

function getEvidenceKindLabel(kind) {
  return EVIDENCE_KIND_LABELS[kind] || String(kind || "Evidencia");
}

function isImageEvidence(evidence) {
  return Boolean(evidence?.hasBinaryContent && /^image\//i.test(String(evidence?.contentType || "")));
}

function isClosedOrderStatus(status) {
  return ["Finalized", "Closed", "Exception", 4, 5, 6].includes(status);
}

function normalizeMembership(rawMembership) {
  if (!rawMembership) return null;

  return {
    id: rawMembership.id ?? rawMembership.Id,
    clientId: rawMembership.clientId ?? rawMembership.ClientId,
    planName: rawMembership.planName ?? rawMembership.PlanName,
    totalCredits: rawMembership.totalCredits ?? rawMembership.TotalCredits ?? 0,
    availableCredits: rawMembership.availableCredits ?? rawMembership.AvailableCredits ?? 0,
    validFromUtc: rawMembership.validFromUtc ?? rawMembership.ValidFromUtc,
    validToUtc: rawMembership.validToUtc ?? rawMembership.ValidToUtc,
    isActive: rawMembership.isActive ?? rawMembership.IsActive ?? false,
    createdAtUtc: rawMembership.createdAtUtc ?? rawMembership.CreatedAtUtc
  };
}

function normalizeCreditMovement(rawMovement) {
  return {
    id: rawMovement.id ?? rawMovement.Id,
    membershipId: rawMovement.membershipId ?? rawMovement.MembershipId,
    serviceOrderId: rawMovement.serviceOrderId ?? rawMovement.ServiceOrderId ?? null,
    movementType: rawMovement.movementType ?? rawMovement.MovementType ?? "Movimiento",
    creditsDelta: rawMovement.creditsDelta ?? rawMovement.CreditsDelta ?? 0,
    occurredAtUtc: rawMovement.occurredAtUtc ?? rawMovement.OccurredAtUtc,
    note: rawMovement.note ?? rawMovement.Note ?? null
  };
}

function isMembershipExpiringSoon(membership) {
  if (!membership?.validToUtc) return false;
  const diffMs = new Date(membership.validToUtc).getTime() - Date.now();
  return diffMs <= 1000 * 60 * 60 * 24 * 7;
}

function normalizeTechnicianDirectoryEntry(technicianProfile, publicProfile = null) {
  return {
    id: technicianProfile?.id ?? technicianProfile?.Id,
    authUserId: technicianProfile?.authUserId ?? technicianProfile?.AuthUserId ?? null,
    fullName: publicProfile?.fullName
      || publicProfile?.FullName
      || [publicProfile?.firstName ?? publicProfile?.FirstName, publicProfile?.lastName ?? publicProfile?.LastName]
        .filter(Boolean)
        .join(" ")
        .trim()
      || technicianProfile?.fullName
      || technicianProfile?.FullName
      || "",
    specialty: publicProfile?.specialty
      ?? publicProfile?.Specialty
      ?? technicianProfile?.specialty
      ?? technicianProfile?.Specialty
      ?? ""
  };
}

function getTechnicianDirectoryEntry(technicianId) {
  return currentTechniciansById.get(technicianId) || null;
}

function getTechnicianDisplayName(technicianId) {
  const technician = getTechnicianDirectoryEntry(technicianId);
  if (technician?.fullName) return technician.fullName;
  return `Tecnico ${String(technicianId || "").slice(0, 8) || "sin asignar"}`;
}

function formatEntityStatus(entity) {
  if (!entity) return "Sin entidad asignada";
  const isEnabled = entity?.isEnabled ?? entity?.IsEnabled ?? false;
  return isEnabled ? "Habilitada" : "No habilitada";
}

function parseClientRoute() {
  const rawHash = window.location.hash.replace(/^#/, "").trim();
  if (!rawHash) {
    return { section: "inicio", orderId: null };
  }

  const [section, maybeOrderId] = rawHash.split("/");
  if (section === "ordenes" && isGuid(maybeOrderId)) {
    return { section: "ordenes", orderId: maybeOrderId };
  }

  return {
    section: ["inicio", "ordenes", "nuevo-servicio", "historial", "perfil"].includes(section) ? section : "inicio",
    orderId: null
  };
}

function buildClientRouteHash(route) {
  if (route.section === "ordenes" && isGuid(route.orderId)) {
    return `#ordenes/${route.orderId}`;
  }

  return `#${route.section || "inicio"}`;
}

function updateClientRoute(route, { replace = false } = {}) {
  const hash = buildClientRouteHash(route);
  if (window.location.hash === hash) return;

  if (replace) {
    window.history.replaceState(null, "", hash);
    return;
  }

  window.location.hash = hash;
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

function getOrderSummary(items) {
  return items.map((item) => `${item.serviceName} x${item.quantity}`).join(", ");
}

function getOrderUnitsCount(items) {
  return (items || []).reduce((total, item) => total + Number(item.quantity || 0), 0);
}

function getOrderTitle(order) {
  const items = order?.items || [];
  if (!items.length) return "Orden sin items";

  const [firstItem, ...restItems] = items;
  if (!restItems.length) return firstItem.serviceName || "Servicio sin nombre";
  return `${firstItem.serviceName} +${restItems.length} mas`;
}

function setWelcomeMessage() {
  const title = document.getElementById("welcome-name");
  const subtitle = document.getElementById("welcome-message");

  if (title) title.textContent = "Tus servicios, en un solo flujo";
  if (subtitle) subtitle.textContent = `${getUserDisplayName()}: consulta el estado de cada orden, solicita un nuevo servicio y revisa evidencia cuando el trabajo queda cerrado.`;
}

function setupUserMenu() {
  const userBtn = document.getElementById("userBtn");
  const userDropdown = document.getElementById("userDropdown");
  const userMenu = document.getElementById("userMenu");
  const userMenuName = document.getElementById("userMenuName");
  const logoutBtn = document.getElementById("logoutBtn");

  if (userMenuName) {
    userMenuName.textContent = getUserDisplayName();
  }

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

function setActiveSidebar(section) {
  setActiveNavItems(Array.from(document.querySelectorAll(".sidebar-nav .nav-item, .mobile-bottom-nav .nav-item")), section);
}

function setVisibleClientSection(sectionId, sidebarSection) {
  [
    "mainDashboardSection",
    "clientOrdersSection",
    "clientHistorySection",
    "clientProfileSection",
    "clientRequestSection",
    "clientOrderDetailSection"
  ].forEach((id) => {
    document.getElementById(id)?.classList.toggle("hidden", id !== sectionId);
  });

  setActiveSidebar(sidebarSection);
}

function showDashboardSection(section = "inicio") {
  const sectionIdByRoute = {
    inicio: "mainDashboardSection",
    ordenes: "clientOrdersSection",
    historial: "clientHistorySection",
    perfil: "clientProfileSection"
  };

  setVisibleClientSection(sectionIdByRoute[section] || "mainDashboardSection", section);
}

function showRequestSection() {
  ensureRequestDateValue();
  setVisibleClientSection("clientRequestSection", "nuevo-servicio");
  refreshSuggestedSlots().catch((error) => {
    showRequestFeedback(error.message || "No se pudo cargar la agenda sugerida.", "error");
  });
}

function showOrderDetailSection() {
  setVisibleClientSection("clientOrderDetailSection", "ordenes");
}

function resetOrderSelection() {
  currentSelectedSlot = null;
  updateSelectedSlotSummary();
}

function closeRequestSection() {
  resetOrderSelection();
  updateClientRoute({ section: "inicio" });
}

function closeOrderDetailSection() {
  currentOrderDetail = null;
  currentOrderDetailHistory = [];
  currentOrderDetailEvidence = [];
  currentOrderTechnicianProfile = null;
  clearEvidencePreviewUrls();
  updateClientRoute({ section: "ordenes" });
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
  currentOrderDetailEvidencePreviewUrls.forEach((previewUrl) => {
    try {
      window.URL.revokeObjectURL(previewUrl);
    } catch {
    }
  });
  currentOrderDetailEvidencePreviewUrls.clear();
}

function updateEvidencePreviewElements() {
  document.querySelectorAll("[data-client-evidence-preview-id]").forEach((element) => {
    const evidenceId = element.dataset.clientEvidencePreviewId;
    const previewUrl = currentOrderDetailEvidencePreviewUrls.get(evidenceId);
    if (!previewUrl) return;

    element.classList.remove("is-loading");
    element.innerHTML = `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(element.dataset.clientEvidencePreviewAlt || "Vista previa de evidencia")}">`;
  });
}

async function ensureEvidencePreviews(orderId) {
  const previewableItems = currentOrderDetailEvidence.filter((entry) => isImageEvidence(entry) && !currentOrderDetailEvidencePreviewUrls.has(entry.id));
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

  if (currentOrderDetail?.id !== orderId) {
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
    currentOrderDetailEvidencePreviewUrls.set(result.value.evidenceId, result.value.previewUrl);
    updated = true;
  });

  if (updated) {
    updateEvidencePreviewElements();
  }
}

async function handleClientRouteChange() {
  if (!isClientBootstrapComplete) return;

  const route = parseClientRoute();
  if (route.section === "nuevo-servicio") {
    showRequestSection();
    return;
  }

  if (route.section === "ordenes" && isGuid(route.orderId)) {
    if (!currentOrderDetail || currentOrderDetail.id !== route.orderId) {
      try {
        await openOrderDetail(route.orderId, { updateRoute: false });
      } catch (error) {
        console.error("No se pudo navegar al detalle de la orden.", error);
        updateClientRoute({ section: "ordenes" }, { replace: true });
        showDashboardSection("ordenes");
      }
      return;
    }

    showOrderDetailSection();
    return;
  }

  showDashboardSection(route.section);
}

function setupSidebar() {
  const navItems = Array.from(document.querySelectorAll(".sidebar-nav .nav-item, .mobile-bottom-nav .nav-item"));
  const newOrderButton = document.getElementById("newAppointment");
  const newOrderButtonFromOrders = document.getElementById("newAppointmentFromOrders");
  const backToDashboard = document.getElementById("backToDashboard");
  const cancelRequestButton = document.getElementById("cancel-request-section");
  const backFromOrderDetail = document.getElementById("backFromOrderDetail");

  navItems.forEach((item) => {
    item.addEventListener("click", (event) => {
      event.preventDefault();
      updateClientRoute({ section: item.dataset.section || "inicio" });
    });
  });

  newOrderButton?.addEventListener("click", () => updateClientRoute({ section: "nuevo-servicio" }));
  newOrderButtonFromOrders?.addEventListener("click", () => updateClientRoute({ section: "nuevo-servicio" }));
  backToDashboard?.addEventListener("click", closeRequestSection);
  cancelRequestButton?.addEventListener("click", closeRequestSection);
  backFromOrderDetail?.addEventListener("click", closeOrderDetailSection);
  window.addEventListener("hashchange", () => {
    handleClientRouteChange().catch((error) => {
      console.error("No se pudo resolver la navegacion del cliente.", error);
    });
  });
}

async function loadClientContext() {
  const authUserId = getAuthUserIdFromToken();
  if (!isGuid(authUserId)) {
    throw new Error("No se encontro un identificador de usuario valido en la sesion.");
  }

  try {
    currentClientProfile = await FrontGateway.directory.getClientProfileByAuthUserId(authUserId);
  } catch (error) {
    if (error?.status === 404) {
      throw new Error(`No existe perfil de cliente en DirectoryMS para el usuario autenticado (${authUserId}).`);
    }

    throw error;
  }

  const providerEntityId = currentClientProfile?.providerEntityId ?? currentClientProfile?.ProviderEntityId;
  currentProviderEntity = isGuid(providerEntityId)
    ? await FrontGateway.directory.getProviderById(providerEntityId)
    : null;
}

async function loadMembershipContext() {
  const clientId = currentClientProfile?.id ?? currentClientProfile?.Id;
  if (!isGuid(clientId)) {
    currentMembership = null;
    currentCreditMovements = [];
    return;
  }

  try {
    const membership = await FrontGateway.order.getActiveMembershipByClient(clientId);
    currentMembership = normalizeMembership(membership);
  } catch (error) {
    if (error?.status === 404) {
      currentMembership = null;
    } else {
      throw error;
    }
  }

  try {
    const movements = await FrontGateway.order.getCreditMovementsByClient(clientId);
    currentCreditMovements = movements.map(normalizeCreditMovement)
      .sort((left, right) => new Date(right.occurredAtUtc) - new Date(left.occurredAtUtc));
  } catch (error) {
    if (error?.status === 404) {
      currentCreditMovements = [];
    } else {
      throw error;
    }
  }
}

async function loadServiceOptions() {
  const select = document.getElementById("service-offering");
  if (!select) return;

  currentServiceOfferings = await FrontGateway.catalog.getEnabledServiceOfferings();
  logClientAvailability("Service offerings loaded", currentServiceOfferings);
  select.innerHTML = '<option value="">Seleccionar servicio</option>';

  for (const service of currentServiceOfferings) {
    const option = document.createElement("option");
    option.value = service.id || service.Id;
    option.textContent = service.name || service.Name;
    option.dataset.price = String(service.basePrice ?? service.BasePrice ?? 0);
    option.dataset.durationMinutes = String(service.durationMinutes ?? service.DurationMinutes ?? 0);
    select.appendChild(option);
  }

  updateSummaryCards();
}

function renderClientProfile() {
  const profileCard = document.getElementById("clientProfileCard");
  const providerCard = document.getElementById("clientProviderCard");
  const membershipCard = document.getElementById("clientMembershipCard");
  const creditMovementsList = document.getElementById("clientCreditMovementsList");
  const profileCreatedAt = currentClientProfile?.createdAtUtc ?? currentClientProfile?.CreatedAtUtc;

  if (profileCard) {
    profileCard.innerHTML = `
      <div class="client-profile-item">
        <strong>Nombre</strong>
        <span>${escapeHtml(currentClientProfile?.fullName ?? currentClientProfile?.FullName ?? getUserDisplayName())}</span>
      </div>
      <div class="client-profile-item">
        <strong>Email</strong>
        <span>${escapeHtml(getStoredUser()?.email ?? "-")}</span>
      </div>
      <div class="client-profile-item">
        <strong>Alta en la plataforma</strong>
        <span>${escapeHtml(profileCreatedAt ? formatDateTime(profileCreatedAt) : "-")}</span>
      </div>
      <div class="client-profile-item">
        <strong>Ordenes registradas</strong>
        <span>${escapeHtml(String(currentOrders.length))}</span>
      </div>
    `;
  }

  if (providerCard) {
    providerCard.innerHTML = `
      <div class="client-profile-item">
        <strong>Entidad</strong>
        <span>${escapeHtml(currentProviderEntity?.name ?? currentProviderEntity?.Name ?? "Sin entidad asignada")}</span>
      </div>
      <div class="client-profile-item">
        <strong>Estado</strong>
        <span>${escapeHtml(formatEntityStatus(currentProviderEntity))}</span>
      </div>
      <div class="client-profile-item">
        <strong>Agenda sugerida</strong>
        <span>Se calcula con la disponibilidad activa de esta entidad.</span>
      </div>
    `;
  }

  if (membershipCard) {
    if (!currentMembership) {
      membershipCard.innerHTML = `
        <div class="client-membership-empty">
          <span class="client-membership-empty__icon"><i class="fas fa-wallet" aria-hidden="true"></i></span>
          <strong>Sin membresia activa</strong>
          <p>Operas en modalidad eventual: podes solicitar servicios normalmente y cada orden se factura por separado.</p>
        </div>
      `;
    } else {
      const usedCredits = Math.max(0, Number(currentMembership.totalCredits || 0) - Number(currentMembership.availableCredits || 0));
      const usedRatio = currentMembership.totalCredits > 0
        ? Math.min(1, usedCredits / Number(currentMembership.totalCredits))
        : 0;
      const isLowBalance = Number(currentMembership.availableCredits) <= 2;
      const expiringSoon = isMembershipExpiringSoon(currentMembership);
      const tone = !currentMembership.isActive ? "inactive" : isLowBalance || expiringSoon ? "warning" : "active";

      membershipCard.innerHTML = `
        <div class="client-membership is-${escapeHtml(tone)}">
          <div class="client-membership__head">
            <div>
              <span class="client-membership__label">Plan</span>
              <strong>${escapeHtml(currentMembership.planName)}</strong>
            </div>
            <span class="client-membership__badge">
              <i class="fas ${currentMembership.isActive ? "fa-circle-check" : "fa-circle-pause"}" aria-hidden="true"></i>
              ${escapeHtml(currentMembership.isActive ? "Activa" : "Inactiva")}
            </span>
          </div>

          <div class="client-membership__credits">
            <div class="client-membership__credits-head">
              <strong>${escapeHtml(String(currentMembership.availableCredits))}</strong>
              <span>de ${escapeHtml(String(currentMembership.totalCredits))} creditos disponibles</span>
            </div>
            <div class="client-membership__bar" role="img" aria-label="${escapeHtml(`${currentMembership.availableCredits} de ${currentMembership.totalCredits} creditos disponibles`)}">
              <span style="width: ${(100 - usedRatio * 100).toFixed(1)}%"></span>
            </div>
            <span class="client-membership__used">${escapeHtml(String(usedCredits))} consumidos</span>
          </div>

          <dl class="client-membership__facts">
            <div>
              <dt>Vigencia</dt>
              <dd>${escapeHtml(formatUtcDateRange(currentMembership.validFromUtc, currentMembership.validToUtc))}</dd>
            </div>
            <div>
              <dt>Consumo</dt>
              <dd>Los creditos se descuentan cuando la orden queda finalizada.</dd>
            </div>
          </dl>

          ${expiringSoon || isLowBalance ? `
            <p class="client-membership__note">
              <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
              ${escapeHtml(expiringSoon
                ? "Tu plan vence pronto. Si necesitas renovarlo, pedi gestion administrativa."
                : "Tu saldo esta bajo. Podes seguir generando ordenes, pero conviene reponer creditos.")}
            </p>` : ""}
        </div>
      `;
    }
  }

  if (creditMovementsList) {
    creditMovementsList.innerHTML = currentCreditMovements.length
      ? `
        <ul class="client-movement-list">
          ${currentCreditMovements.slice(0, 8).map((movement) => `
            <li class="client-movement ${movement.creditsDelta < 0 ? "is-consumption" : "is-credit"}">
              <span class="client-movement__icon" aria-hidden="true">
                <i class="fas ${movement.creditsDelta < 0 ? "fa-arrow-down" : "fa-arrow-up"}"></i>
              </span>
              <span class="client-movement__body">
                <strong>${escapeHtml(movement.movementType)}</strong>
                <small>
                  ${escapeHtml(formatDateTime(movement.occurredAtUtc))}
                  ${movement.serviceOrderId ? ` &middot; orden #${escapeHtml(String(movement.serviceOrderId).slice(0, 8))}` : ""}
                </small>
                ${movement.note ? `<small class="client-movement__note">${escapeHtml(movement.note)}</small>` : ""}
              </span>
              <span class="client-movement__delta">${escapeHtml(movement.creditsDelta > 0 ? `+${movement.creditsDelta}` : String(movement.creditsDelta))}</span>
            </li>
          `).join("")}
        </ul>
        ${currentCreditMovements.length > 8 ? `<p class="client-movement-more">Se muestran los 8 movimientos mas recientes de ${escapeHtml(String(currentCreditMovements.length))}.</p>` : ""}`
      : '<p class="request-empty-text">Todavia no hay movimientos de creditos para mostrar.</p>';
  }
}

async function ensureTechnicianDirectoryEntry(technicianId) {
  if (!isGuid(technicianId)) return null;

  const cached = getTechnicianDirectoryEntry(technicianId);
  if (cached) return cached;

  try {
    const technicianProfile = await FrontGateway.directory.getTechnicianProfileById(technicianId);
    let publicProfile = null;

    try {
      const authUserId = technicianProfile?.authUserId ?? technicianProfile?.AuthUserId;
      if (isGuid(authUserId)) {
        publicProfile = await FrontGateway.auth.getTechnicianPublicProfile(authUserId);
      }
    } catch {
      publicProfile = null;
    }

    const resolvedProfile = normalizeTechnicianDirectoryEntry(technicianProfile, publicProfile);
    currentTechniciansById.set(technicianId, resolvedProfile);
    return resolvedProfile;
  } catch {
    return null;
  }
}

async function loadTechnicianDirectoryForOrders() {
  const technicianIds = [...new Set(
    currentOrders
      .map((order) => order.technicianId)
      .filter((technicianId) => isGuid(technicianId))
  )];

  await Promise.allSettled(technicianIds.map((technicianId) => ensureTechnicianDirectoryEntry(technicianId)));
}

function showRequestFeedback(message, type = "info") {
  const feedback = document.getElementById("requestAvailabilityFeedback");
  if (!feedback) return;

  feedback.textContent = message || "";
  feedback.classList.toggle("hidden", !message);
  feedback.classList.remove("is-info", "is-success", "is-error");
  if (message) {
    feedback.classList.add(type === "error" ? "is-error" : type === "success" ? "is-success" : "is-info");
  }
}

function renderOrderItems() {
  const container = document.getElementById("order-items-list");
  if (!container) return;

  if (currentOrderItems.length === 0) {
    container.innerHTML = '<p class="request-empty-text">Todavia no agregaste servicios.</p>';
    updateRequestSummary();
    return;
  }

  container.innerHTML = currentOrderItems.map((item, index) => `
    <div class="request-order-item">
      <div>
        <strong>${escapeHtml(item.serviceName)}</strong><br>
        <span class="request-order-item__meta">${formatCurrency(item.unitPrice)} c/u · ${formatCompactDuration(item.durationMinutes)} c/u</span>
      </div>
      <div class="request-order-item__totals">
        <div class="request-qty-control">
          <button type="button" class="request-qty-btn qty-minus" data-index="${index}" ${item.quantity <= 1 ? "disabled" : ""} aria-label="Reducir cantidad">−</button>
          <span class="request-qty-value">${item.quantity}</span>
          <button type="button" class="request-qty-btn qty-plus" data-index="${index}" ${item.quantity >= 5 ? "disabled" : ""} aria-label="Aumentar cantidad">+</button>
        </div>
        <span class="request-order-item__amount">${formatCurrency(item.unitPrice * item.quantity)}</span>
        <span class="request-order-item__meta">${formatCompactDuration(item.durationMinutes * item.quantity)}</span>
        <button type="button" data-index="${index}" class="remove-order-item request-order-item__remove">
          Quitar
        </button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll(".qty-minus").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.index);
      if (currentOrderItems[index] && currentOrderItems[index].quantity > 1) {
        currentOrderItems[index].quantity -= 1;
        renderOrderItems();
        refreshSuggestedSlots().catch((error) => showRequestFeedback(error.message, "error"));
      }
    });
  });

  container.querySelectorAll(".qty-plus").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.index);
      if (currentOrderItems[index] && currentOrderItems[index].quantity < 5) {
        currentOrderItems[index].quantity += 1;
        renderOrderItems();
        refreshSuggestedSlots().catch((error) => showRequestFeedback(error.message, "error"));
      }
    });
  });

  container.querySelectorAll(".remove-order-item").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      currentOrderItems.splice(index, 1);
      renderOrderItems();
      refreshSuggestedSlots().catch((error) => showRequestFeedback(error.message, "error"));
    });
  });

  updateRequestSummary();
}

function addSelectedItem() {
  const select = document.getElementById("service-offering");
  const quantityInput = document.getElementById("service-quantity");
  if (!select || !quantityInput) return;

  const selectedOption = select.selectedOptions?.[0];
  const serviceId = select.value;
  const quantity = Number(quantityInput.value || 1);

  if (!serviceId || !selectedOption) {
    showRequestFeedback("Selecciona un servicio antes de agregarlo a la orden.", "error");
    return;
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    showRequestFeedback("La cantidad debe ser mayor a cero.", "error");
    return;
  }

  if (quantity > 5) {
    showRequestFeedback("La cantidad máxima por servicio es 5.", "error");
    return;
  }

  if (Number(selectedOption.dataset.price || 0) <= 0) {
    showRequestFeedback("El servicio seleccionado no tiene un precio valido para crear la orden.", "error");
    return;
  }

  const durationMinutes = Number(selectedOption.dataset.durationMinutes || 0);
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    showRequestFeedback("El servicio seleccionado no tiene una duracion valida en el catalogo.", "error");
    return;
  }

  // Si el servicio ya esta en la orden se acumula en la misma linea: dos
  // lineas separadas dejaban pasar mas de 5 unidades del mismo servicio.
  const existingItem = currentOrderItems.find((item) => item.serviceId === serviceId);

  if (existingItem) {
    if (existingItem.quantity >= 5) {
      showRequestFeedback(`Ya tenes ${existingItem.quantity} unidades de ${existingItem.serviceName}, que es el maximo por servicio.`, "error");
      return;
    }

    const mergedQuantity = Math.min(5, existingItem.quantity + quantity);
    const addedQuantity = mergedQuantity - existingItem.quantity;
    existingItem.quantity = mergedQuantity;

    renderOrderItems();
    select.value = "";
    quantityInput.value = "1";
    select.dispatchEvent(new Event("change"));
    showRequestFeedback(
      addedQuantity < quantity
        ? `Sumamos ${addedQuantity} unidad(es) a ${existingItem.serviceName}: el maximo por servicio es 5.`
        : `Actualizamos ${existingItem.serviceName}: ahora son ${mergedQuantity} unidad(es).`,
      addedQuantity < quantity ? "error" : "success"
    );
    refreshSuggestedSlots().catch((error) => showRequestFeedback(error.message, "error"));
    return;
  }

  currentOrderItems.push({
    serviceId,
    serviceName: selectedOption.textContent.trim(),
    unitPrice: Number(selectedOption.dataset.price || 0),
    durationMinutes,
    quantity
  });

  logClientAvailability("Added order item", currentOrderItems[currentOrderItems.length - 1]);
  logClientAvailability("Current order items", currentOrderItems);

  renderOrderItems();
  select.value = "";
  quantityInput.value = "1";
  select.dispatchEvent(new Event("change")); // limpia el preview
  showRequestFeedback("Servicio agregado a la orden.", "success");
  refreshSuggestedSlots().catch((error) => showRequestFeedback(error.message, "error"));
}

function getRequestedDurationMinutes() {
  return currentOrderItems.reduce((total, item) => total + (Number(item.durationMinutes || 0) * Number(item.quantity || 0)), 0);
}

function hasPendingSelection() {
  const select = document.getElementById("service-offering");
  return Boolean(select?.value);
}

function getPendingSelectionDurationMinutes() {
  const select = document.getElementById("service-offering");
  const quantityInput = document.getElementById("service-quantity");
  const option = select?.selectedOptions?.[0];
  if (!select?.value || !option) return 0;

  const durationMinutes = Number(option.dataset.durationMinutes || 0);
  const quantity = Number(quantityInput?.value || 1);
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) return 0;
  if (!Number.isInteger(quantity) || quantity <= 0) return 0;

  return durationMinutes * quantity;
}

function updateRequestStepper() {
  const hasItems = currentOrderItems.length > 0;
  const hasSlot = Boolean(currentSelectedSlot);

  const stateByStep = {
    1: hasItems ? "done" : "current",
    2: !hasItems ? "pending" : hasSlot ? "done" : "current",
    3: hasItems && hasSlot ? "current" : "pending"
  };

  document.querySelectorAll(".request-stepper__step").forEach((step) => {
    const state = stateByStep[step.dataset.step] || "pending";
    step.classList.toggle("is-done", state === "done");
    step.classList.toggle("is-current", state === "current");
  });

  // El paso 2 depende del 1: se atenua hasta que haya al menos un servicio.
  document.getElementById("requestStepSchedule")?.classList.toggle("is-blocked", !hasItems);
}

function updateRequestSummary() {
  updateRequestStepper();

  const itemsContainer = document.getElementById("requestSummaryItems");
  const countElement = document.getElementById("requestSummaryCount");
  const durationElement = document.getElementById("requestSummaryDuration");
  const slotElement = document.getElementById("requestSummarySlot");
  const totalElement = document.getElementById("requestSummaryTotal");
  const checklistElement = document.getElementById("requestSummaryChecklist");
  const submitButton = document.getElementById("submitRequestOrder");

  const totalDurationMinutes = getRequestedDurationMinutes();
  const totalPrice = currentOrderItems.reduce((sum, item) => sum + (Number(item.unitPrice || 0) * Number(item.quantity || 0)), 0);
  const unitsCount = currentOrderItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  if (itemsContainer) {
    itemsContainer.innerHTML = currentOrderItems.length
      ? `<ul class="request-summary__list">${currentOrderItems.map((item) => `
          <li>
            <span>
              ${escapeHtml(item.serviceName)}
              <small>x${escapeHtml(String(item.quantity))} &middot; ${escapeHtml(formatCompactDuration(item.durationMinutes * item.quantity))}</small>
            </span>
            <strong>${escapeHtml(formatCurrency(item.unitPrice * item.quantity))}</strong>
          </li>
        `).join("")}</ul>`
      : '<p class="request-empty-text">Todavia no agregaste servicios.</p>';
  }

  if (countElement) {
    countElement.textContent = `${unitsCount} servicio${unitsCount === 1 ? "" : "s"}`;
  }

  if (durationElement) {
    durationElement.textContent = totalDurationMinutes > 0 ? formatCompactDuration(totalDurationMinutes) : "-";
  }

  if (slotElement) {
    slotElement.textContent = currentSelectedSlot
      ? `${formatArgentinaDate(currentSelectedSlot.startAtUtc, { weekday: "short", day: "2-digit", month: "short" })} · ${formatArgentinaTime(currentSelectedSlot.startAtUtc, { hourCycle: "h23" })} a ${formatArgentinaTime(currentSelectedSlot.endAtUtc, { hourCycle: "h23" })}`
      : "Sin elegir";
  }

  if (totalElement) {
    totalElement.textContent = formatCurrency(totalPrice);
  }

  const missingSteps = [
    currentOrderItems.length === 0 ? "Agrega al menos un servicio" : "",
    !currentSelectedSlot ? "Elegi un horario disponible" : ""
  ].filter(Boolean);

  if (checklistElement) {
    checklistElement.innerHTML = missingSteps.length
      ? missingSteps.map((step) => `<li class="is-pending"><i class="fas fa-circle" aria-hidden="true"></i>${escapeHtml(step)}</li>`).join("")
      : '<li class="is-ready"><i class="fas fa-circle-check" aria-hidden="true"></i>Todo listo para crear la orden</li>';
  }

  if (submitButton) {
    submitButton.disabled = missingSteps.length > 0;
  }
}

function getRequestedDateValue() {
  return document.getElementById("request-date")?.value || "";
}

function ensureRequestDateValue() {
  const input = document.getElementById("request-date");
  if (!input) return;

  // Sin `min` el navegador deja elegir fechas pasadas, que siempre devuelven
  // cero horarios porque las franjas vencidas se descartan.
  const today = getArgentinaDateInputValue();
  input.min = today;

  if (!input.value || input.value < today) {
    input.value = today;
  }
}

function overlapsPeriod(startAtUtc, endAtUtc, period) {
  const periodStart = new Date(period.startAtUtc ?? period.StartAtUtc);
  const periodEnd = new Date(period.endAtUtc ?? period.EndAtUtc);
  const candidateStart = new Date(startAtUtc);
  const candidateEnd = new Date(endAtUtc);

  return periodStart < candidateEnd && candidateStart < periodEnd;
}

function buildSuggestedSlots(technicians, snapshotsByTechnician, durationMinutes) {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    return [];
  }

  const suggestions = new Map();
  const now = new Date();

  technicians.forEach((technician, index) => {
    const technicianId = technician.id ?? technician.Id;
    const snapshot = snapshotsByTechnician[index] || {};
    const slots = snapshot.availability || [];
    const absences = snapshot.absences || [];
    const reservations = (snapshot.reservations || []).filter((reservation) => {
      const status = reservation.status ?? reservation.Status;
      return ACTIVE_RESERVATION_STATUSES.has(status);
    });

    slots.forEach((rawSlot) => {
      const slot = {
        id: rawSlot.id ?? rawSlot.Id,
        startAtUtc: rawSlot.startAtUtc ?? rawSlot.StartAtUtc,
        endAtUtc: rawSlot.endAtUtc ?? rawSlot.EndAtUtc
      };

      const slotStart = new Date(slot.startAtUtc);
      const slotEnd = new Date(slot.endAtUtc);

      for (let cursor = new Date(slotStart); cursor.getTime() + durationMinutes * 60000 <= slotEnd.getTime(); cursor = new Date(cursor.getTime() + SUGGESTION_STEP_MINUTES * 60000)) {
        const startAtUtc = cursor.toISOString();
        const endAtUtc = new Date(cursor.getTime() + durationMinutes * 60000).toISOString();

        if (new Date(endAtUtc) <= now) continue;
        if (absences.some((absence) => overlapsPeriod(startAtUtc, endAtUtc, absence))) continue;
        if (reservations.some((reservation) => overlapsPeriod(startAtUtc, endAtUtc, reservation))) continue;

        const key = `${startAtUtc}|${endAtUtc}`;
        if (!suggestions.has(key)) {
          suggestions.set(key, {
            startAtUtc,
            endAtUtc,
            technicianIds: new Set()
          });
        }

        suggestions.get(key).technicianIds.add(technicianId);
      }
    });
  });

  return Array.from(suggestions.values())
    .map((slot) => ({
      startAtUtc: slot.startAtUtc,
      endAtUtc: slot.endAtUtc,
      availableTechnicianCount: slot.technicianIds.size
    }))
    .sort((left, right) => new Date(left.startAtUtc) - new Date(right.startAtUtc));
}

function updateSelectedSlotSummary() {
  const summary = document.getElementById("requestSelectedSlotSummary");
  if (!summary) return;

  if (!currentSelectedSlot) {
    summary.textContent = "Aun no seleccionaste un horario.";
    summary.classList.remove("is-selected");
    updateRequestSummary();
    return;
  }

  summary.classList.add("is-selected");
  summary.innerHTML = `
    <strong>Horario elegido:</strong>
    ${escapeHtml(formatDayLabel(currentSelectedSlot.startAtUtc))},
    ${escapeHtml(formatArgentinaTime(currentSelectedSlot.startAtUtc, { hourCycle: "h23" }))} a ${escapeHtml(formatArgentinaTime(currentSelectedSlot.endAtUtc, { hourCycle: "h23" }))}
    <br>
    <span class="request-slot-muted">Tecnicos disponibles en esa franja: ${currentSelectedSlot.availableTechnicianCount}</span>
  `;
  updateRequestSummary();
}

function renderSuggestedSlots() {
  const container = document.getElementById("suggested-slots-list");
  if (!container) return;

  const requestedDate = getRequestedDateValue();

  if (currentOrderItems.length === 0 && !hasPendingSelection()) {
    container.innerHTML = `
      <div class="loading-spinner">
        <i class="fas fa-calendar-alt"></i>
        <p>Elegi un servicio en el paso 1 para ver los dias y horarios disponibles.</p>
      </div>
    `;
    return;
  }

  if (currentSuggestedSlots.length === 0) {
    container.innerHTML = `
      <div class="loading-spinner">
        <i class="fas fa-calendar-times"></i>
        <p>No encontramos horarios disponibles para la fecha elegida.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <section class="suggested-day-group">
      <header class="suggested-day-header">
        <div>
          <h5>${escapeHtml(requestedDate ? formatDayLabel(`${requestedDate}T12:00:00Z`) : "Horarios disponibles")}</h5>
          <span>${currentSuggestedSlots.length} horario${currentSuggestedSlots.length === 1 ? "" : "s"} disponible${currentSuggestedSlots.length === 1 ? "" : "s"}</span>
        </div>
      </header>
      <div class="suggested-slot-grid">
        ${currentSuggestedSlots.map((slot) => {
          const isActive = currentSelectedSlot?.startAtUtc === slot.startAtUtc && currentSelectedSlot?.endAtUtc === slot.endAtUtc;
          const startLabel = formatArgentinaTime(slot.startAtUtc, { hourCycle: "h23" });
          const endLabel = formatArgentinaTime(slot.endAtUtc, { hourCycle: "h23" });
          const techniciansLabel = `${slot.availableTechnicianCount} tecnico${slot.availableTechnicianCount === 1 ? "" : "s"} disponible${slot.availableTechnicianCount === 1 ? "" : "s"}`;

          return `
            <button
              type="button"
              class="suggested-slot-btn${isActive ? " active" : ""}"
              data-start-at-utc="${escapeHtml(slot.startAtUtc)}"
              data-end-at-utc="${escapeHtml(slot.endAtUtc)}"
              data-available-count="${slot.availableTechnicianCount}"
              aria-pressed="${isActive ? "true" : "false"}"
              aria-label="${escapeHtml(`Horario de ${startLabel} a ${endLabel}, ${techniciansLabel}`)}">
              <span class="suggested-slot-time">
                ${escapeHtml(startLabel)}<span class="suggested-slot-end"> a ${escapeHtml(endLabel)}</span>
              </span>
              <span class="suggested-slot-meta" title="${escapeHtml(techniciansLabel)}">
                <i class="fas fa-user-gear" aria-hidden="true"></i>
                <span class="suggested-slot-count-text">${slot.availableTechnicianCount} tecnico${slot.availableTechnicianCount === 1 ? "" : "s"}</span>
                <span class="suggested-slot-count-short" aria-hidden="true">${slot.availableTechnicianCount}</span>
              </span>
            </button>
          `;
        }).join("")}
      </div>
    </section>
  `;

  container.querySelectorAll(".suggested-slot-btn").forEach((button) => {
    button.addEventListener("click", () => {
      currentSelectedSlot = {
        startAtUtc: button.dataset.startAtUtc,
        endAtUtc: button.dataset.endAtUtc,
        availableTechnicianCount: Number(button.dataset.availableCount || 0)
      };
      updateSelectedSlotSummary();
      renderSuggestedSlots();
    });
  });
}

async function refreshSuggestedSlots() {
  const providerEntityId = currentClientProfile?.providerEntityId ?? currentClientProfile?.ProviderEntityId;
  const container = document.getElementById("suggested-slots-list");
  const requestedDate = getRequestedDateValue();

  logClientAvailability("Refreshing suggested slots", {
    providerEntityId,
    requestedDate,
    currentOrderItems
  });

  // Recalcular la agenda invalida el horario elegido: la franja se calcula
  // sobre la duracion total, que acaba de cambiar.
  const hadSelectedSlot = Boolean(currentSelectedSlot);
  resetOrderSelection();
  updateSelectedSlotSummary();

  if (!isGuid(providerEntityId)) {
    currentSuggestedSlots = [];
    renderSuggestedSlots();
    return;
  }

  if (currentOrderItems.length === 0 && !hasPendingSelection()) {
    currentSuggestedSlots = [];
    renderSuggestedSlots();
    showRequestFeedback("");
    return;
  }

  const requestedDurationMinutes = getRequestedDurationMinutes() + getPendingSelectionDurationMinutes();
  logClientAvailability("Requested duration minutes", requestedDurationMinutes);
  if (!Number.isInteger(requestedDurationMinutes) || requestedDurationMinutes <= 0) {
    currentSuggestedSlots = [];
    renderSuggestedSlots();
    showRequestFeedback("Los servicios elegidos no tienen una duracion valida en el catalogo.", "error");
    return;
  }

  if (!requestedDate) {
    currentSuggestedSlots = [];
    renderSuggestedSlots();
    showRequestFeedback("Selecciona una fecha para consultar horarios.", "error");
    return;
  }

  if (container) {
    container.innerHTML = `
      <div class="loading-spinner">
        <i class="fas fa-spinner fa-spin"></i>
        <p>Buscando horarios disponibles para la fecha elegida...</p>
      </div>
    `;
  }

  showRequestFeedback("");

  const technicians = await FrontGateway.directory.getTechniciansByProvider(providerEntityId);
  logClientAvailability("Technicians by provider", technicians);
  const activeTechnicians = technicians.filter((technician) => {
    const status = technician.status ?? technician.Status;
    return status === TECHNICIAN_STATUS_ACTIVE;
  });
  logClientAvailability("Active technicians", activeTechnicians);

  if (activeTechnicians.length === 0) {
    currentSuggestedSlots = [];
    renderSuggestedSlots();
    showRequestFeedback("No hay tecnicos activos para tu entidad proveedora.", "error");
    return;
  }

  const fromUtc = argentinaDateTimeToUtcIso(requestedDate, "00:00");
  const toUtc = argentinaDateTimeToUtcIso(requestedDate, "23:59");
  const snapshotsByTechnician = await Promise.all(
    activeTechnicians.map(async (technician) => {
      const technicianId = technician.id ?? technician.Id;
      try {
        const [availability, absences, reservations] = await Promise.all([
          FrontGateway.scheduling.getAvailabilityByTechnician(technicianId, fromUtc, toUtc),
          FrontGateway.scheduling.getAbsencesByTechnician(technicianId, fromUtc, toUtc),
          FrontGateway.scheduling.getBusyPeriodsByTechnician(technicianId)
        ]);

        logClientAvailability(`Snapshot for technician ${technicianId}`, {
          availability,
          absences,
          reservations
        });

        return { availability, absences, reservations };
      } catch (error) {
        logClientAvailability(`Snapshot failed for technician ${technicianId}`, error);
        return { availability: [], absences: [], reservations: [] };
      }
    })
  );

  logClientAvailability("Snapshots by technician", snapshotsByTechnician);

  // El encabezado de la lista rotula los horarios con la fecha pedida, asi que
  // se descarta cualquier franja de otro dia que pueda venir en la respuesta.
  currentSuggestedSlots = buildSuggestedSlots(activeTechnicians, snapshotsByTechnician, requestedDurationMinutes)
    .filter((slot) => getArgentinaDateInputValue(new Date(slot.startAtUtc)) === requestedDate);
  logClientAvailability("Suggested slots", currentSuggestedSlots);
  renderSuggestedSlots();

  if (currentSuggestedSlots.length === 0) {
    showRequestFeedback(`No encontramos horarios disponibles para esa fecha con una duracion total de ${formatCompactDuration(requestedDurationMinutes)}. Proba con otro dia.`, "error");
    return;
  }

  if (hadSelectedSlot) {
    showRequestFeedback("Cambiaron los servicios de la orden: volve a elegir un horario para la nueva duracion.", "info");
  }
}

function updateSummaryCards() {
  const activeOrders = currentOrders.filter((order) => ["Created", "Approved", "Confirmed", "InProgress", 1, 2, 3, 7].includes(order.status)).length;
  const completedOrders = currentOrders.filter((order) => ["Finalized", "Closed", "Exception", 4, 5, 6].includes(order.status)).length;

  const activeOrdersElement = document.getElementById("active-orders");
  const completedOrdersElement = document.getElementById("completed-orders");
  const availableServicesElement = document.getElementById("available-services");
  const availableCreditsElement = document.getElementById("available-credits");

  if (activeOrdersElement) activeOrdersElement.textContent = String(activeOrders);
  if (completedOrdersElement) completedOrdersElement.textContent = String(completedOrders);
  if (availableServicesElement) availableServicesElement.textContent = String(currentServiceOfferings.length);
  if (availableCreditsElement) availableCreditsElement.textContent = currentMembership ? String(currentMembership.availableCredits) : "-";
}

function renderOrderDetail(order = currentOrderDetail) {
  const hero = document.getElementById("orderDetailHero");
  const itemsContainer = document.getElementById("orderDetailItems");
  const historyContainer = document.getElementById("orderDetailHistory");
  const evidenceContainer = document.getElementById("orderDetailEvidence");
  if (!hero || !itemsContainer || !historyContainer || !evidenceContainer) return;

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
    return;
  }

  const itemSummary = getOrderSummary(order.items);
  const exceptionBlock = order.exceptionReason
    ? `<div class="order-detail-alert"><strong>Motivo de excepcion:</strong> ${escapeHtml(order.exceptionReason)}</div>`
    : "";
  const technicianDirectoryEntry = getTechnicianDirectoryEntry(order.technicianId);
  const technicianLabel = currentOrderTechnicianProfile?.fullName
    || currentOrderTechnicianProfile?.FullName
    || [currentOrderTechnicianProfile?.firstName ?? currentOrderTechnicianProfile?.FirstName, currentOrderTechnicianProfile?.lastName ?? currentOrderTechnicianProfile?.LastName].filter(Boolean).join(" ").trim()
    || technicianDirectoryEntry?.fullName
    || `Tecnico ${String(order.technicianId).slice(0, 8)}`;
  const technicianSpecialty = currentOrderTechnicianProfile?.specialty
    ?? currentOrderTechnicianProfile?.Specialty
    ?? technicianDirectoryEntry?.specialty;
  const orderStatusValue = getStatusValue(order.status);
  const canDownloadReceipt = orderStatusValue === 4 || orderStatusValue === 6;
  const tone = getOrderStatusTone(order.status);
  const timingBadge = getOrderTimingBadge(order);
  const durationMinutes = getOrderDurationMinutes(order);
  const servicesCount = (order.items || []).length;
  const hasSchedule = Boolean(order.scheduledStartAtUtc) && !Number.isNaN(new Date(order.scheduledStartAtUtc).getTime());

  hero.classList.add("client-order-surface");
  hero.dataset.tone = tone;

  hero.innerHTML = `
    <div class="order-detail-head">
      <div class="client-order-card__identity">
        <p class="client-order-card__meta">
          <span class="client-order-card__ref">#${escapeHtml(String(order.id).slice(0, 8))}</span>
          <span>${escapeHtml(`${servicesCount} servicio${servicesCount === 1 ? "" : "s"}`)}</span>
          ${order.createdAtUtc ? `<span>Solicitada el ${escapeHtml(formatArgentinaDate(order.createdAtUtc, { weekday: undefined, day: "2-digit", month: "2-digit", year: "2-digit" }))}</span>` : ""}
        </p>
        <h4>${escapeHtml(getOrderTitle(order))}</h4>
        ${servicesCount > 1 ? `<p class="order-detail-subtitle">${escapeHtml(itemSummary)}</p>` : ""}
      </div>
      <div class="client-order-card__badges">
        <span class="client-order-card__status">
          <i class="fas ${escapeHtml(getOrderStatusIcon(order.status))}" aria-hidden="true"></i>
          ${escapeHtml(getStatusLabel(order.status))}
        </span>
        ${timingBadge ? `
          <span class="client-order-card__timing is-${escapeHtml(timingBadge.tone)}">
            <i class="fas ${escapeHtml(timingBadge.icon)}" aria-hidden="true"></i>
            ${escapeHtml(timingBadge.label)}
          </span>` : ""}
      </div>
    </div>

    <div class="client-order-card__grid">
      <div class="client-order-card__item is-primary">
        <span class="client-order-card__label"><i class="fas fa-calendar-day" aria-hidden="true"></i> Visita programada</span>
        ${hasSchedule ? `
          <strong>${escapeHtml(formatArgentinaDate(order.scheduledStartAtUtc, { weekday: "long", day: "2-digit", month: "long" }))}</strong>
          <span class="client-order-card__value-sub">
            ${escapeHtml(formatArgentinaTime(order.scheduledStartAtUtc, { hourCycle: "h23" }))} a ${escapeHtml(formatArgentinaTime(order.scheduledEndAtUtc, { hourCycle: "h23" }))}
            ${durationMinutes ? ` &middot; ${escapeHtml(formatCompactDuration(durationMinutes))}` : ""}
          </span>` : `
          <strong>Sin fecha asignada</strong>
          <span class="client-order-card__value-sub">La agenda se confirma cuando se aprueba la orden.</span>`}
      </div>
      <div class="client-order-card__item">
        <span class="client-order-card__label"><i class="fas fa-user-gear" aria-hidden="true"></i> Tecnico asignado</span>
        <div class="client-order-card__technician">
          <span class="client-order-card__avatar" aria-hidden="true">${escapeHtml(getInitials(technicianLabel))}</span>
          <span>
            <strong>${escapeHtml(technicianLabel)}</strong>
            <span class="client-order-card__value-sub">${escapeHtml(technicianSpecialty || "Sin especialidad registrada")}</span>
          </span>
        </div>
      </div>
      <div class="client-order-card__item">
        <span class="client-order-card__label"><i class="fas fa-location-dot" aria-hidden="true"></i> Direccion del servicio</span>
        <strong>${escapeHtml(order.address || "Sin direccion registrada")}</strong>
      </div>
      <div class="client-order-card__item is-amount">
        <span class="client-order-card__label"><i class="fas fa-receipt" aria-hidden="true"></i> Total de la orden</span>
        <strong>${escapeHtml(formatCurrency(order.totalAmount))}</strong>
        <span class="client-order-card__value-sub">${escapeHtml(`${servicesCount} servicio${servicesCount === 1 ? "" : "s"} en la orden`)}</span>
      </div>
    </div>

    ${renderOrderProgressTrack(order)}
    ${exceptionBlock}
    ${canDownloadReceipt ? `
      <div class="order-detail-actions">
        <button type="button" class="btn btn-secondary client-download-receipt" data-order-id="${escapeHtml(order.id)}">
          <i class="fas fa-file-pdf"></i>
          Descargar comprobante PDF
        </button>
      </div>` : ""}
  `;

  hero.querySelector(".client-download-receipt")?.addEventListener("click", () => {
    downloadReceipt(order.id).catch((error) => {
      showAppFeedback(getErrorMessage(error, "No se pudo descargar el comprobante."), {
        type: "error",
        title: "Comprobante no disponible"
      });
    });
  });

  itemsContainer.innerHTML = order.items.length
    ? `
      <ul class="client-item-list">
        ${order.items.map((item) => `
          <li class="client-item-row">
            <span class="client-item-row__qty">${escapeHtml(String(item.quantity))}x</span>
            <span class="client-item-row__name">
              <strong>${escapeHtml(item.serviceName)}</strong>
              <small>${escapeHtml(formatCurrency(item.unitPrice))} por unidad</small>
            </span>
            <span class="client-item-row__amount">${escapeHtml(formatCurrency(item.totalPrice || (item.unitPrice * item.quantity)))}</span>
          </li>
        `).join("")}
      </ul>
      <div class="client-item-total">
        <span>Total de la orden</span>
        <strong>${escapeHtml(formatCurrency(order.totalAmount))}</strong>
      </div>`
    : '<p class="request-empty-text">Todavia no hay items para mostrar.</p>';

  historyContainer.innerHTML = currentOrderDetailHistory.length
    ? `<ol class="client-timeline">
        ${currentOrderDetailHistory
          .slice()
          .sort((left, right) => new Date(right.changedAtUtc ?? right.ChangedAtUtc) - new Date(left.changedAtUtc ?? left.ChangedAtUtc))
          .map((entry) => {
            const previous = entry.previousStatus ?? entry.PreviousStatus;
            const next = entry.newStatus ?? entry.NewStatus;
            const note = entry.note ?? entry.Note;
            const changedAtUtc = entry.changedAtUtc ?? entry.ChangedAtUtc;

            return `
              <li class="client-timeline__entry is-${escapeHtml(getOrderStatusTone(next))}">
                <span class="client-timeline__dot" aria-hidden="true"></span>
                <div class="client-timeline__body">
                  <div class="client-timeline__head">
                    <strong>${escapeHtml(getStatusLabel(next))}</strong>
                    <span>${escapeHtml(formatDateTime(changedAtUtc))}</span>
                  </div>
                  <span class="client-timeline__transition">${escapeHtml(previous ? `${getStatusLabel(previous)} → ${getStatusLabel(next)}` : "Estado inicial")}</span>
                  ${note ? `<p>${escapeHtml(note)}</p>` : ""}
                </div>
              </li>
            `;
          }).join("")}
      </ol>`
    : '<p class="request-empty-text">Todavia no hay historial para mostrar.</p>';

  evidenceContainer.innerHTML = currentOrderDetailEvidence.length
    ? currentOrderDetailEvidence
        .slice()
        .sort((left, right) => new Date(right.recordedAtUtc) - new Date(left.recordedAtUtc))
        .map((entry) => `
          <article class="order-evidence-item">
            ${isImageEvidence(entry) ? `
              <div class="order-evidence-preview ${currentOrderDetailEvidencePreviewUrls.get(entry.id) ? "" : "is-loading"}" data-client-evidence-preview-id="${escapeHtml(entry.id)}" data-client-evidence-preview-alt="${escapeHtml(`Vista previa de ${entry.fileName || "evidencia"}`)}">
                ${currentOrderDetailEvidencePreviewUrls.get(entry.id)
                  ? `<img src="${escapeHtml(currentOrderDetailEvidencePreviewUrls.get(entry.id))}" alt="Vista previa de ${escapeHtml(entry.fileName || "evidencia")}">`
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
                <button type="button" class="btn btn-secondary client-download-evidence" data-order-id="${escapeHtml(order.id)}" data-evidence-id="${escapeHtml(entry.id)}" data-file-name="${escapeHtml(entry.fileName || "evidencia.bin")}">
                  <i class="fas fa-download"></i>
                  Descargar archivo
                </button>
              </div>` : ""}
          </article>
        `).join("")
    : '<p class="request-empty-text">Todavia no hay evidencia para mostrar.</p>';

  evidenceContainer.querySelectorAll(".client-download-evidence").forEach((button) => {
    button.addEventListener("click", () => {
      downloadEvidenceFile(button.dataset.orderId, button.dataset.evidenceId, button.dataset.fileName).catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudo descargar la evidencia."), {
          type: "error",
          title: "Descarga no disponible"
        });
      });
    });
  });
}

async function openOrderDetail(orderId, { updateRoute = true } = {}) {
  if (!isGuid(orderId)) {
    throw new Error("La orden seleccionada no tiene un identificador valido.");
  }

  const existingOrder = currentOrders.find((order) => order.id === orderId);
  clearEvidencePreviewUrls();
  currentOrderDetail = existingOrder ?? null;
  currentOrderDetailHistory = [];
  currentOrderDetailEvidence = [];
  currentOrderTechnicianProfile = null;
  renderOrderDetail();
  showOrderDetailSection();

  const detail = await FrontGateway.order.getOrderDetail(orderId);
  currentOrderDetail = normalizeOrder(detail.order ?? detail.Order);
  currentOrderDetailEvidence = (detail.evidence ?? detail.Evidence ?? []).map(normalizeEvidenceEntry);

  try {
    const technicianProfile = await ensureTechnicianDirectoryEntry(currentOrderDetail.technicianId);
    currentOrderTechnicianProfile = technicianProfile;
    currentOrderDetailHistory = detail.history ?? detail.History ?? [];
  } catch {
    currentOrderDetailHistory = [];
  }

  renderOrderDetail();
  updateEvidencePreviewElements();
  if (updateRoute) {
    updateClientRoute({ section: "ordenes", orderId });
  }
  ensureEvidencePreviews(orderId).catch((error) => {
    console.warn("No se pudieron cargar las vistas previas de evidencia.", error);
  });
}

async function downloadReceipt(orderId, fallbackFileName = "comprobante.pdf") {
  const result = await FrontGateway.order.downloadReceipt(orderId);
  downloadBlob(result.blob, result.fileName || fallbackFileName);
}

function renderOrdersEmptyState(emptyState) {
  const state = typeof emptyState === "string" ? { message: emptyState } : (emptyState || {});

  return `
    <div class="client-orders-empty">
      <span class="client-orders-empty__icon"><i class="fas ${escapeHtml(state.icon || "fa-clipboard-list")}" aria-hidden="true"></i></span>
      <strong>${escapeHtml(state.title || "Todavia no hay nada por aca")}</strong>
      <p>${escapeHtml(state.message || "")}</p>
      ${state.actionLabel ? `
        <button type="button" class="btn btn-primary client-empty-action" data-section="${escapeHtml(state.actionSection || "nuevo-servicio")}">
          <i class="fas fa-plus" aria-hidden="true"></i>
          ${escapeHtml(state.actionLabel)}
        </button>` : ""}
    </div>
  `;
}

function openOrderDetailSafely(orderId) {
  openOrderDetail(orderId).catch((error) => {
    showAppFeedback(getErrorMessage(error, "No se pudo abrir el detalle de la orden."), {
      type: "error",
      title: "No pudimos abrir la orden"
    });
  });
}

function renderOrderCollection(containerId, orders, emptyState) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = orders.length
    ? orders.map(renderOrderCard).join("")
    : renderOrdersEmptyState(emptyState);

  container.querySelectorAll(".view-order-detail-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openOrderDetailSafely(button.dataset.orderId);
    });
  });

  container.querySelectorAll(".client-order-card__receipt").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      downloadReceipt(button.dataset.orderId).catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudo descargar el comprobante."), {
          type: "error",
          title: "Comprobante no disponible"
        });
      });
    });
  });

  container.querySelectorAll(".client-order-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("button, a")) return;
      openOrderDetailSafely(card.dataset.orderId);
    });
  });

  container.querySelectorAll(".client-empty-action").forEach((button) => {
    button.addEventListener("click", () => {
      updateClientRoute({ section: button.dataset.section || "nuevo-servicio" });
    });
  });
}

function renderOrderProgressTrack(order) {
  return renderSharedProgressTrack(order, {
    prefix: "client-order-progress",
    statusLabel: getStatusLabel(order.status),
    escapeHtml
  });
}

function renderOrderCard(order) {
  const tone = getOrderStatusTone(order.status);
  const technician = getTechnicianDirectoryEntry(order.technicianId);
  const technicianName = technician?.fullName || getTechnicianDisplayName(order.technicianId);
  const technicianSpecialty = technician?.specialty || "Sin especialidad registrada";
  const timingBadge = getOrderTimingBadge(order);
  const durationMinutes = getOrderDurationMinutes(order);
  const servicesCount = (order.items || []).length;
  const unitsCount = getOrderUnitsCount(order.items);
  const hasSchedule = Boolean(order.scheduledStartAtUtc) && !Number.isNaN(new Date(order.scheduledStartAtUtc).getTime());
  const canDownloadReceipt = tone === "finalized" || tone === "closed";

  const itemChips = (order.items || []).length > 1
    ? `<ul class="client-order-card__chips">${order.items.map((item) => `
        <li class="client-order-card__chip">
          <span>${escapeHtml(item.serviceName)}</span>
          <strong>x${escapeHtml(String(item.quantity))}</strong>
        </li>
      `).join("")}</ul>`
    : "";

  const exceptionBlock = order.exceptionReason
    ? `<div class="client-order-card__exception">
        <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
        <div>
          <strong>Motivo de la excepcion</strong>
          <p>${escapeHtml(order.exceptionReason)}</p>
        </div>
      </div>`
    : "";

  return `
    <article class="appointment-item client-order-card is-${escapeHtml(tone)}" data-order-id="${escapeHtml(order.id)}">
      <div class="client-order-card__header">
        <div class="client-order-card__identity">
          <h4 class="client-order-card__title">${escapeHtml(getOrderTitle(order))}</h4>
          <p class="client-order-card__meta">
            <span class="client-order-card__ref">#${escapeHtml(String(order.id).slice(0, 8))}</span>
            <span>${escapeHtml(`${servicesCount} servicio${servicesCount === 1 ? "" : "s"}${unitsCount > servicesCount ? ` (${unitsCount} unidades)` : ""}`)}</span>
            ${order.createdAtUtc ? `<span>Solicitada el ${escapeHtml(formatArgentinaDate(order.createdAtUtc, { weekday: undefined, day: "2-digit", month: "2-digit", year: "2-digit" }))}</span>` : ""}
          </p>
        </div>
        <div class="client-order-card__badges">
          <span class="client-order-card__status">
            <i class="fas ${escapeHtml(getOrderStatusIcon(order.status))}" aria-hidden="true"></i>
            ${escapeHtml(getStatusLabel(order.status))}
          </span>
          ${timingBadge ? `
            <span class="client-order-card__timing is-${escapeHtml(timingBadge.tone)}">
              <i class="fas ${escapeHtml(timingBadge.icon)}" aria-hidden="true"></i>
              ${escapeHtml(timingBadge.label)}
            </span>` : ""}
        </div>
      </div>

      <div class="client-order-card__grid">
        <div class="client-order-card__item is-primary">
          <span class="client-order-card__label"><i class="fas fa-calendar-day" aria-hidden="true"></i> Visita programada</span>
          ${hasSchedule ? `
            <strong>${escapeHtml(formatArgentinaDate(order.scheduledStartAtUtc, { weekday: "long", day: "2-digit", month: "long" }))}</strong>
            <span class="client-order-card__value-sub">
              ${escapeHtml(formatArgentinaTime(order.scheduledStartAtUtc, { hourCycle: "h23" }))} a ${escapeHtml(formatArgentinaTime(order.scheduledEndAtUtc, { hourCycle: "h23" }))}
              ${durationMinutes ? ` &middot; ${escapeHtml(formatCompactDuration(durationMinutes))}` : ""}
            </span>` : `
            <strong>Sin fecha asignada</strong>
            <span class="client-order-card__value-sub">La agenda se confirma cuando se aprueba la orden.</span>`}
        </div>

        <div class="client-order-card__item">
          <span class="client-order-card__label"><i class="fas fa-user-gear" aria-hidden="true"></i> Tecnico asignado</span>
          <div class="client-order-card__technician">
            <span class="client-order-card__avatar" aria-hidden="true">${escapeHtml(getInitials(technicianName))}</span>
            <span>
              <strong>${escapeHtml(technicianName)}</strong>
              <span class="client-order-card__value-sub">${escapeHtml(technicianSpecialty)}</span>
            </span>
          </div>
        </div>

        <div class="client-order-card__item">
          <span class="client-order-card__label"><i class="fas fa-location-dot" aria-hidden="true"></i> Direccion del servicio</span>
          <strong>${escapeHtml(order.address || "Sin direccion registrada")}</strong>
          ${order.address ? "" : '<span class="client-order-card__value-sub">Podes indicarla al solicitar el servicio.</span>'}
        </div>

        <div class="client-order-card__item is-amount">
          <span class="client-order-card__label"><i class="fas fa-receipt" aria-hidden="true"></i> Total de la orden</span>
          <strong>${escapeHtml(formatCurrency(order.totalAmount))}</strong>
          <span class="client-order-card__value-sub">${escapeHtml(getOrderSummary(order.items) || "Sin items cargados")}</span>
        </div>
      </div>

      ${renderOrderProgressTrack(order)}
      ${exceptionBlock}

      <div class="client-order-card__footer">
        ${itemChips}
        ${canDownloadReceipt ? `
          <button type="button" class="btn btn-secondary client-order-card__receipt" data-order-id="${escapeHtml(order.id)}">
            <i class="fas fa-file-pdf" aria-hidden="true"></i>
            Comprobante
          </button>` : ""}
        <button type="button" class="btn btn-secondary view-order-detail-btn" data-order-id="${escapeHtml(order.id)}">
          <i class="fas fa-eye" aria-hidden="true"></i>
          Ver detalle
        </button>
      </div>
    </article>
  `;
}

function filterOrdersByStatus(orders, filterValue) {
  if (!filterValue) return orders;

  return orders.filter((order) => {
    const statusValue = getStatusValue(order.status);
    return String(statusValue ?? order.status) === String(filterValue)
      || String(order.status) === String(filterValue)
      || getStatusLabel(order.status) === filterValue;
  });
}

function sortOrdersBySchedule(orders, direction = "asc") {
  const factor = direction === "asc" ? 1 : -1;

  return orders.slice().sort((left, right) => {
    const leftTime = new Date(left.scheduledStartAtUtc || left.createdAtUtc).getTime();
    const rightTime = new Date(right.scheduledStartAtUtc || right.createdAtUtc).getTime();
    const safeLeft = Number.isNaN(leftTime) ? 0 : leftTime;
    const safeRight = Number.isNaN(rightTime) ? 0 : rightTime;
    return (safeLeft - safeRight) * factor;
  });
}

function renderOrdersStats(activeOrders) {
  const container = document.getElementById("clientOrdersStats");
  if (!container) return;

  const inProgressCount = activeOrders.filter((order) => getOrderStatusTone(order.status) === "progress").length;
  const upcomingOrder = sortOrdersBySchedule(
    activeOrders.filter((order) => (getDayOffsetFromToday(order.scheduledStartAtUtc) ?? -1) >= 0),
    "asc"
  )[0];
  const lateCount = activeOrders.filter((order) => (getDayOffsetFromToday(order.scheduledStartAtUtc) ?? 0) < 0).length;
  const committedAmount = activeOrders.reduce((total, order) => total + Number(order.totalAmount || 0), 0);

  const stats = [
    {
      icon: "fa-clipboard-check",
      label: activeOrders.length === 1 ? "Orden activa" : "Ordenes activas",
      value: String(activeOrders.length)
    },
    {
      icon: "fa-spray-can",
      label: "En ejecucion",
      value: String(inProgressCount)
    },
    {
      icon: "fa-calendar-day",
      label: "Proxima visita",
      value: upcomingOrder
        ? `${formatArgentinaDate(upcomingOrder.scheduledStartAtUtc, { weekday: "short", day: "2-digit", month: "short" })} &middot; ${formatArgentinaTime(upcomingOrder.scheduledStartAtUtc, { hourCycle: "h23" })}`
        : "Sin visitas agendadas",
      raw: true
    },
    {
      icon: "fa-wallet",
      label: "Monto comprometido",
      value: formatCurrency(committedAmount)
    }
  ];

  if (lateCount > 0) {
    stats.push({
      icon: "fa-triangle-exclamation",
      label: lateCount === 1 ? "Visita vencida" : "Visitas vencidas",
      value: String(lateCount),
      tone: "late"
    });
  }

  container.innerHTML = stats.map((stat) => `
    <div class="client-orders-stat ${stat.tone ? `is-${escapeHtml(stat.tone)}` : ""}">
      <i class="fas ${escapeHtml(stat.icon)}" aria-hidden="true"></i>
      <span>
        <strong>${stat.raw ? stat.value : escapeHtml(stat.value)}</strong>
        <small>${escapeHtml(stat.label)}</small>
      </span>
    </div>
  `).join("");
}

function renderHistoryStats(historyOrders) {
  const container = document.getElementById("clientHistoryStats");
  if (!container) return;

  const finalizedCount = historyOrders.filter((order) => getOrderStatusTone(order.status) === "finalized").length;
  const exceptionCount = historyOrders.filter((order) => getOrderStatusTone(order.status) === "exception").length;
  const totalSpent = historyOrders.reduce((total, order) => total + Number(order.totalAmount || 0), 0);
  const lastOrder = sortOrdersBySchedule(historyOrders, "desc")[0];

  const stats = [
    { icon: "fa-clock-rotate-left", label: historyOrders.length === 1 ? "Servicio cerrado" : "Servicios cerrados", value: String(historyOrders.length) },
    { icon: "fa-flag-checkered", label: "Finalizados", value: String(finalizedCount) },
    {
      icon: "fa-calendar-check",
      label: "Ultimo servicio",
      value: lastOrder
        ? formatArgentinaDate(lastOrder.scheduledStartAtUtc, { weekday: "short", day: "2-digit", month: "short" })
        : "Sin registros",
      raw: false
    },
    { icon: "fa-wallet", label: "Total historico", value: formatCurrency(totalSpent) }
  ];

  if (exceptionCount > 0) {
    stats.push({
      icon: "fa-triangle-exclamation",
      label: exceptionCount === 1 ? "Con excepcion" : "Con excepciones",
      value: String(exceptionCount),
      tone: "late"
    });
  }

  container.innerHTML = stats.map((stat) => `
    <div class="client-orders-stat ${stat.tone ? `is-${escapeHtml(stat.tone)}` : ""}">
      <i class="fas ${escapeHtml(stat.icon)}" aria-hidden="true"></i>
      <span>
        <strong>${escapeHtml(stat.value)}</strong>
        <small>${escapeHtml(stat.label)}</small>
      </span>
    </div>
  `).join("");
}

function renderOrders() {
  // Inicio es un resumen de tres items por lista: filtrarlo por estado con un
  // segundo select, ademas confundia porque afectaba a las dos listas a la vez
  // con estados que solo aplican a una. El unico filtro vive en "Mis ordenes".
  const ordersFilter = document.getElementById("orders-status-filter")?.value || "";
  const historyFilter = document.getElementById("history-status-filter")?.value || "";

  const overviewActive = sortOrdersBySchedule(currentOrders.filter((order) => !isClosedOrderStatus(order.status)), "asc");
  const overviewHistory = sortOrdersBySchedule(currentOrders.filter((order) => isClosedOrderStatus(order.status)), "desc");

  const routeOrders = filterOrdersByStatus(currentOrders, ordersFilter);
  const routeActive = sortOrdersBySchedule(routeOrders.filter((order) => !isClosedOrderStatus(order.status)), "asc");
  const routeHistory = sortOrdersBySchedule(
    filterOrdersByStatus(currentOrders.filter((order) => isClosedOrderStatus(order.status)), historyFilter),
    "desc"
  );

  const activeEmptyState = {
    icon: "fa-calendar-plus",
    title: ordersFilter ? "Sin ordenes para ese estado" : "No tenes ordenes activas",
    message: ordersFilter
      ? "Proba con otro estado o limpia el filtro para ver todas tus ordenes en curso."
      : "Cuando solicites un servicio vas a seguir aca cada visita, su tecnico asignado y el estado en tiempo real.",
    actionLabel: ordersFilter ? "" : "Solicitar servicio",
    actionSection: "nuevo-servicio"
  };

  const historyEmptyState = {
    icon: historyFilter ? "fa-filter-circle-xmark" : "fa-clock-rotate-left",
    title: historyFilter ? "Sin resultados" : "Todavia no hay servicios cerrados",
    message: historyFilter
      ? "Ninguna orden de tu historial coincide con ese estado."
      : "Aca vas a encontrar las ordenes finalizadas o cerradas, con su evidencia y comprobante."
  };

  renderOrderCollection("appointments-list", overviewActive.slice(0, 3), activeEmptyState);
  renderOrderCollection("history-list-inicio", overviewHistory.slice(0, 3), historyEmptyState);
  renderOrderCollection("clientOrdersList", routeActive, activeEmptyState);
  renderOrderCollection("clientHistoryList", routeHistory, historyEmptyState);
  renderOrdersStats(currentOrders.filter((order) => !isClosedOrderStatus(order.status)));
  renderHistoryStats(currentOrders.filter((order) => isClosedOrderStatus(order.status)));
  renderClientProfile();
}

function renderOrdersError(message) {
  ["appointments-list", "history-list-inicio", "clientOrdersList", "clientHistoryList"].forEach((containerId) => {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = `<p class="request-empty-text client-order-card__error">${escapeHtml(message)}</p>`;
    }
  });
}

async function loadOrders() {
  const clientId = currentClientProfile?.id ?? currentClientProfile?.Id;
  if (!isGuid(clientId)) {
    currentOrders = [];
    renderOrders();
    updateSummaryCards();
    return;
  }

  const orders = await FrontGateway.order.getOrdersByClient(clientId);
  currentOrders = orders.map(normalizeOrder);
  await loadTechnicianDirectoryForOrders();
  renderOrders();
  renderClientProfile();
  updateSummaryCards();
}

async function downloadEvidenceFile(orderId, evidenceId, fallbackFileName = "evidencia.bin") {
  const result = await FrontGateway.order.downloadEvidenceFile(orderId, evidenceId);
  downloadBlob(result.blob, result.fileName || fallbackFileName);
}

async function handleCreateOrder(event) {
  event.preventDefault();

  if (!currentClientProfile) {
    throw new Error("No se pudo obtener el perfil del cliente.");
  }

  if (currentOrderItems.length === 0) {
    throw new Error("Agrega al menos un item a la orden.");
  }

  if (!currentSelectedSlot) {
    throw new Error("Selecciona un dia y horario disponible antes de crear la orden.");
  }

  const clientId = currentClientProfile.id ?? currentClientProfile.Id;
  const providerEntityId = currentClientProfile.providerEntityId ?? currentClientProfile.ProviderEntityId;

  if (!isGuid(clientId) || !isGuid(providerEntityId)) {
    throw new Error("El perfil del cliente no tiene datos validos para crear la orden.");
  }

  const addressValue = document.getElementById("request-address")?.value?.trim() || null;

  const createdFlow = await FrontGateway.scheduling.createReservationWithOrder({
    clientId,
    providerEntityId,
    startAtUtc: currentSelectedSlot.startAtUtc,
    items: currentOrderItems,
    address: addressValue
  });

  const createdOrderId = createdFlow.orderId ?? createdFlow.OrderId;
  if (!isGuid(createdOrderId)) {
    throw new Error("SchedulingMS no devolvio un identificador valido para la orden creada.");
  }

  currentOrderDetail = null;

  currentOrderItems = [];
  currentSuggestedSlots = [];
  resetOrderSelection();
  renderOrderItems();
  renderSuggestedSlots();
  const addressInput = document.getElementById("request-address");
  if (addressInput) addressInput.value = "";
  showRequestFeedback("");
  await loadOrders();
  showAppFeedback("La orden se creo correctamente y ya podes revisar su detalle.", {
    type: "success",
    title: "Orden creada"
  });
  try {
    await openOrderDetail(createdOrderId);
  } catch {
    showOrderDetailSection();
    renderOrderDetail();
  }
}

function registerEvents() {
  const form = document.getElementById("appointment-form");
  const addItemButton = document.getElementById("add-service-item");
  const ordersStatusFilter = document.getElementById("orders-status-filter");
  const refreshRecentHistoryButton = document.getElementById("refreshRecentHistory");
  const refreshOrdersSectionButton = document.getElementById("refreshOrdersSection");
  const refreshHistorySectionButton = document.getElementById("refreshHistorySection");
  const refreshSuggestedSlotsButton = document.getElementById("refreshSuggestedSlots");
  const requestDateInput = document.getElementById("request-date");
  const refreshOrders = () => {
    clearAppFeedback();
    Promise.all([loadOrders(), loadMembershipContext()])
      .then(() => {
        renderClientProfile();
        updateSummaryCards();
      })
      .catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudieron actualizar tus ordenes."), {
          type: "error",
          title: "Actualizacion incompleta"
        });
      });
  };

  addItemButton?.addEventListener("click", addSelectedItem);

  // Preview de precio y duración al seleccionar un servicio
  const serviceSelect = document.getElementById("service-offering");
  const servicePreview = document.getElementById("service-preview");
  const previewPrice = document.getElementById("service-preview-price");
  const previewDuration = document.getElementById("service-preview-duration");
  const previewTotal = document.getElementById("service-preview-total");
  const quantityInput = document.getElementById("service-quantity");

  function updateServicePreview() {
    const option = serviceSelect?.selectedOptions?.[0];
    const price = Number(option?.dataset?.price || 0);
    const duration = Number(option?.dataset?.durationMinutes || 0);
    const qty = Number(quantityInput?.value || 1);

    if (!serviceSelect?.value || price <= 0) {
      servicePreview?.classList.add("hidden");
      return;
    }

    if (previewPrice) previewPrice.textContent = `${formatCurrency(price)} c/u`;
    if (previewDuration) previewDuration.textContent = formatDurationMinutes(duration);
    if (previewTotal) previewTotal.textContent = `Total: ${formatCurrency(price * qty)}`;
    servicePreview?.classList.remove("hidden");
  }

  let suggestedSlotsRefreshTimer = null;
  const scheduleSuggestedSlotsRefresh = (delayMs = 400) => {
    if (suggestedSlotsRefreshTimer) clearTimeout(suggestedSlotsRefreshTimer);
    suggestedSlotsRefreshTimer = setTimeout(() => {
      refreshSuggestedSlots().catch((error) => showRequestFeedback(error.message, "error"));
    }, delayMs);
  };

  serviceSelect?.addEventListener("change", () => {
    updateServicePreview();
    if (serviceSelect.value) {
      scheduleSuggestedSlotsRefresh(0);
    }
  });
  quantityInput?.addEventListener("input", () => {
    updateServicePreview();
    scheduleSuggestedSlotsRefresh();
  });
  ordersStatusFilter?.addEventListener("change", renderOrders);
  document.getElementById("history-status-filter")?.addEventListener("change", renderOrders);
  refreshRecentHistoryButton?.addEventListener("click", refreshOrders);
  refreshOrdersSectionButton?.addEventListener("click", refreshOrders);
  refreshHistorySectionButton?.addEventListener("click", refreshOrders);
  refreshSuggestedSlotsButton?.addEventListener("click", () => {
    refreshSuggestedSlots().catch((error) => showRequestFeedback(error.message, "error"));
  });
  requestDateInput?.addEventListener("change", () => {
    refreshSuggestedSlots().catch((error) => showRequestFeedback(error.message, "error"));
  });
  form?.addEventListener("submit", (event) => {
    handleCreateOrder(event).catch((error) => {
      showAppFeedback(getErrorMessage(error, "No se pudo crear la orden."), {
        type: "error",
        title: "No pudimos crear la orden"
      });
    });
  });
}

async function bootstrap() {
  await ensureAuthorizedPage(["Client"]);
  setupUserMenu();
  setupSidebar();
  setWelcomeMessage();
  registerEvents();
  ensureRequestDateValue();
  renderOrderItems();
  renderSuggestedSlots();
  updateSelectedSlotSummary();
  renderOrderDetail();

  await loadClientContext();
  await loadMembershipContext();
  renderClientProfile();

  const results = await Promise.allSettled([
    loadServiceOptions(),
    loadOrders()
  ]);

  if (results[0]?.status === "rejected") {
    console.error("No se pudieron cargar los servicios del catalogo.", results[0].reason);
    currentServiceOfferings = [];
    const select = document.getElementById("service-offering");
    if (select) {
      select.innerHTML = '<option value="">Catalogo no disponible</option>';
    }
    showRequestFeedback(`No se pudieron cargar los servicios: ${getErrorMessage(results[0].reason, "Error desconocido.")}`, "error");
  }

  if (results[1]?.status === "rejected") {
    console.error("No se pudieron cargar las ordenes del cliente.", results[1].reason);
    currentOrders = [];
    renderOrdersError(`No se pudieron cargar las ordenes: ${getErrorMessage(results[1].reason, "Error desconocido.")}`);
    updateSummaryCards();
  }

  isClientBootstrapComplete = true;
  if (!window.location.hash) {
    updateClientRoute({ section: "inicio" }, { replace: true });
  }
  await handleClientRouteChange();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    bootstrap().catch((error) => {
      if (isAuthRedirectError(error)) return;
      console.error(error);
      showAppFeedback(getErrorMessage(error, "Verifica AuthMS, DirectoryMS, CatalogMS y OrderMS."), {
        type: "error",
        title: "No pudimos iniciar el panel cliente",
        timeout: 0
      });
    });
  });
} else {
  bootstrap().catch((error) => {
    if (isAuthRedirectError(error)) return;
    console.error(error);
    showAppFeedback(getErrorMessage(error, "Verifica AuthMS, DirectoryMS, CatalogMS y OrderMS."), {
      type: "error",
      title: "No pudimos iniciar el panel cliente",
      timeout: 0
    });
  });
}
