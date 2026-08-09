import { FrontGateway } from "../api.js";
import { getInitials } from "../utils/order-presentation.js";
import {
  argentinaDateTimeToUtcIso,
  formatArgentinaDate,
  formatArgentinaDateTime,
  getArgentinaDateInputValue,
  shiftArgentinaDate
} from "../utils/argentina-time.js";
import {
  clearAppFeedback,
  confirmAppAction,
  setActiveNavItems,
  showAppFeedback,
  syncMenuExpandedState
} from "../utils/app-shell-ui.js";
import { ensureAuthorizedPage, isAuthRedirectError } from "../utils/session-guard.js";

const ROUTE_SECTIONS = {
  inicio: "adminDashboardSection",
  solicitudes: "adminRequestsSection",
  membresias: "adminMembershipsSection",
  operaciones: "adminOperationsSection",
  proveedores: "adminProvidersSection",
  usuarios: "adminUsersSection"
};

const REQUEST_STATUS_LABELS = {
  Pending: "Pendiente",
  Approved: "Aprobada",
  Rejected: "Rechazada",
  1: "Pendiente",
  2: "Aprobada",
  3: "Rechazada"
};

const OPERATION_STATUS_LABELS = {
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
  providers: [],
  users: [],
  usersById: new Map(),
  clients: [],
  clientsById: new Map(),
  clientsByProviderId: new Map(),
  technicians: [],
  techniciansById: new Map(),
  techniciansByProviderId: new Map(),
  providerAdminsByProviderId: new Map(),
  providerChangeRequests: [],
  selectedProviderId: null,
  membership: {
    // Panorama por entidad: el backend solo expone la membresia activa de un
    // cliente puntual, asi que la vista arma el listado pidiendo cliente por
    // cliente y cachea el resultado en byClientId.
    byClientId: new Map(),
    loadedProviderId: null,
    isLoading: false,
    needsManualLoad: false,
    filter: "todos",
    search: "",
    openClientId: null,
    movements: [],
    formProviderId: null,
    formClientId: null
  },
  operations: {
    filters: {
      providerEntityId: "",
      orderStatus: "",
      reservationStatus: ""
    },
    orders: [],
    orderStatusCounts: [],
    reservations: [],
    reservationStatusCounts: []
  }
};

let isAdminBootstrapComplete = false;

function isGuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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
  return fullName || user?.email || "Administrador";
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

function formatCurrency(amount) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0
  }).format(Number(amount || 0));
}

function getRequestStatusLabel(status) {
  return REQUEST_STATUS_LABELS[status] || String(status || "Sin estado");
}

function getRequestStatusClass(status) {
  const normalized = Number(status);
  if (normalized === 2 || status === "Approved") return "is-approved";
  if (normalized === 3 || status === "Rejected") return "is-rejected";
  return "is-pending";
}

function normalizeProvider(provider) {
  return {
    id: provider.id ?? provider.Id,
    name: provider.name ?? provider.Name ?? "Entidad sin nombre",
    isEnabled: provider.isEnabled ?? provider.IsEnabled ?? false,
    createdAtUtc: provider.createdAtUtc ?? provider.CreatedAtUtc,
    updatedAtUtc: provider.updatedAtUtc ?? provider.UpdatedAtUtc
  };
}

function normalizeUser(user) {
  return {
    id: user.id ?? user.Id,
    firstName: user.firstName ?? user.FirstName ?? "",
    lastName: user.lastName ?? user.LastName ?? "",
    email: user.email ?? user.Email ?? "",
    phoneNumber: user.phoneNumber ?? user.PhoneNumber ?? "",
    role: user.role ?? user.Role ?? "User",
    // El snapshot lo trae y la vista lo ignoraba: para auditoria importa saber
    // si la cuenta esta activa.
    isActive: user.isActive ?? user.IsActive ?? null,
    createdAtUtc: user.createdAtUtc ?? user.CreatedAtUtc,
    updatedAtUtc: user.updatedAtUtc ?? user.UpdatedAtUtc
  };
}

function normalizeClient(client) {
  return {
    id: client.id ?? client.Id,
    authUserId: client.authUserId ?? client.AuthUserId,
    providerEntityId: client.providerEntityId ?? client.ProviderEntityId,
    fullName: client.fullName ?? client.FullName ?? "Cliente",
    createdAtUtc: client.createdAtUtc ?? client.CreatedAtUtc,
    updatedAtUtc: client.updatedAtUtc ?? client.UpdatedAtUtc
  };
}

function normalizeProviderAdmin(profile) {
  return {
    id: profile.id ?? profile.Id,
    authUserId: profile.authUserId ?? profile.AuthUserId,
    providerEntityId: profile.providerEntityId ?? profile.ProviderEntityId,
    fullName: profile.fullName ?? profile.FullName ?? "Administrador",
    createdAtUtc: profile.createdAtUtc ?? profile.CreatedAtUtc,
    updatedAtUtc: profile.updatedAtUtc ?? profile.UpdatedAtUtc
  };
}

function normalizeTechnician(profile, publicProfile = null) {
  return {
    id: profile.id ?? profile.Id,
    authUserId: profile.authUserId ?? profile.AuthUserId,
    providerEntityId: profile.providerEntityId ?? profile.ProviderEntityId,
    specialty: profile.specialty ?? profile.Specialty ?? "",
    status: profile.status ?? profile.Status,
    createdAtUtc: profile.createdAtUtc ?? profile.CreatedAtUtc,
    updatedAtUtc: profile.updatedAtUtc ?? profile.UpdatedAtUtc,
    fullName: publicProfile?.fullName
      ?? publicProfile?.FullName
      ?? [publicProfile?.firstName ?? publicProfile?.FirstName, publicProfile?.lastName ?? publicProfile?.LastName]
        .filter(Boolean)
        .join(" ")
        .trim()
      ?? ""
  };
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
    items: Array.isArray(items) ? items : []
  };
}

function normalizeReservation(rawReservation) {
  return {
    id: rawReservation.id ?? rawReservation.Id,
    clientId: rawReservation.clientId ?? rawReservation.ClientId,
    providerEntityId: rawReservation.providerEntityId ?? rawReservation.ProviderEntityId,
    serviceId: rawReservation.serviceId ?? rawReservation.ServiceId,
    technicianId: rawReservation.technicianId ?? rawReservation.TechnicianId,
    startAtUtc: rawReservation.startAtUtc ?? rawReservation.StartAtUtc,
    endAtUtc: rawReservation.endAtUtc ?? rawReservation.EndAtUtc,
    status: rawReservation.status ?? rawReservation.Status,
    createdAtUtc: rawReservation.createdAtUtc ?? rawReservation.CreatedAtUtc
  };
}

function normalizeChangeRequest(request) {
  return {
    id: request.id ?? request.Id,
    technicianProfileId: request.technicianProfileId ?? request.TechnicianProfileId,
    currentProviderEntityId: request.currentProviderEntityId ?? request.CurrentProviderEntityId,
    requestedProviderEntityId: request.requestedProviderEntityId ?? request.RequestedProviderEntityId,
    status: request.status ?? request.Status,
    requestedByAuthUserId: request.requestedByAuthUserId ?? request.RequestedByAuthUserId ?? null,
    note: request.note ?? request.Note ?? null,
    requestedAtUtc: request.requestedAtUtc ?? request.RequestedAtUtc,
    reviewedByUserId: request.reviewedByUserId ?? request.ReviewedByUserId ?? null,
    resolutionNote: request.resolutionNote ?? request.ResolutionNote ?? null,
    reviewedAtUtc: request.reviewedAtUtc ?? request.ReviewedAtUtc ?? null
  };
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

function getProviderName(providerEntityId) {
  return state.providers.find((provider) => provider.id === providerEntityId)?.name || `Entidad ${String(providerEntityId || "").slice(0, 8)}`;
}

function getClientName(clientId) {
  return state.clientsById.get(clientId)?.fullName || `Cliente ${String(clientId || "").slice(0, 8)}`;
}

function getTechnicianName(technicianId) {
  const technician = state.techniciansById.get(technicianId);
  if (!technician) return `Tecnico ${String(technicianId || "").slice(0, 8)}`;
  return technician.fullName || `Tecnico ${String(technicianId || "").slice(0, 8)}`;
}

function getOperationStatusLabel(status) {
  return OPERATION_STATUS_LABELS[status] || String(status || "Sin estado");
}

// La vista mostraba el valor crudo del backend ("ProviderAdmin", "Technician").
function getUserRoleLabel(role) {
  switch (String(role || "").toLowerCase()) {
    case "admin": return "Admin global";
    case "provideradmin": return "Admin de entidad";
    case "technician": return "Tecnico";
    case "client": return "Cliente";
    default: return String(role || "Usuario");
  }
}

function getUserRoleBadgeClass(role) {
  const normalized = String(role || "").toLowerCase();
  return `is-${normalized}`;
}

function getTechnicianStatusLabel(status) {
  return TECHNICIAN_STATUS_LABELS[status] || String(status || "Sin estado");
}

function getTechnicianStatusValue(status) {
  if (typeof status === "number") return status;
  if (status === "Active") return 1;
  if (status === "Restricted") return 2;
  if (status === "Inactive") return 3;
  return null;
}

function getOperationStatusValue(status) {
  if (typeof status === "number") return status;
  if (status === "Created") return 1;
  if (status === "Confirmed") return 2;
  if (status === "InProgress") return 3;
  if (status === "Finalized") return 4;
  if (status === "Exception") return 5;
  if (status === "Closed") return 6;
  if (status === "Approved") return 7;
  return null;
}

function getOperationBadgeClass(status) {
  const value = getOperationStatusValue(status);
  if (value === 5) return "is-rejected";
  if (value === 4 || value === 6 || value === 7) return "is-approved";
  return "is-pending";
}

function canAdminReassignOrder(order) {
  return ![4, 6, "Finalized", "Closed"].includes(order.status) && isGuid(order.reservationId);
}

function getMembershipDaysLeft(membership) {
  if (!membership?.validToUtc) return null;
  const diffMs = new Date(membership.validToUtc).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function isMembershipExpiringSoon(membership) {
  const daysLeft = getMembershipDaysLeft(membership);
  return daysLeft !== null && daysLeft <= 7;
}

/**
 * Estado operativo de un cliente frente a su membresia. Es lo que decide el tono
 * de la tarjeta y el contador del filtro, asi que vive en un solo lugar.
 */
function getMembershipStatus(membership) {
  if (membership?.failed) return "error";
  if (!membership) return "sin-membresia";

  const daysLeft = getMembershipDaysLeft(membership);
  if (!membership.isActive || (daysLeft !== null && daysLeft < 0)) return "vencida";
  if (Number(membership.availableCredits) <= 0) return "sin-credito";
  if (daysLeft !== null && daysLeft <= 30) return "por-vencer";
  return "vigente";
}

const MEMBERSHIP_STATUS_META = {
  vigente: { label: "Vigente", tone: "is-active", icon: "fa-circle-check" },
  "por-vencer": { label: "Por vencer", tone: "is-warning", icon: "fa-hourglass-half" },
  "sin-credito": { label: "Sin credito", tone: "is-empty", icon: "fa-battery-empty" },
  vencida: { label: "Vencida", tone: "is-expired", icon: "fa-circle-xmark" },
  "sin-membresia": { label: "Sin membresia", tone: "is-none", icon: "fa-minus" },
  error: { label: "No se pudo consultar", tone: "is-expired", icon: "fa-triangle-exclamation" }
};

const MEMBERSHIP_FILTERS = {
  todos: () => true,
  vigentes: (status) => status === "vigente" || status === "por-vencer",
  "por-vencer": (status) => status === "por-vencer",
  "sin-credito": (status) => status === "sin-credito",
  "sin-membresia": (status) => status === "sin-membresia" || status === "vencida"
};

/** Arriba de este numero de clientes el panorama no se carga solo: son N pedidos. */
const MEMBERSHIP_AUTOLOAD_LIMIT = 30;

function getMembershipRows() {
  return getClientsForSelectedProvider().map((client) => {
    const membership = state.membership.byClientId.get(client.id) ?? null;
    return { client, membership, status: getMembershipStatus(membership) };
  });
}

function getVisibleMembershipRows() {
  const search = state.membership.search.trim().toLowerCase();
  const matchesFilter = MEMBERSHIP_FILTERS[state.membership.filter] ?? MEMBERSHIP_FILTERS.todos;

  return getMembershipRows().filter(({ client, membership, status }) => {
    if (!matchesFilter(status)) return false;
    if (!search) return true;
    return `${client.fullName} ${membership?.planName ?? ""}`.toLowerCase().includes(search);
  });
}

function getUserName(authUserId, fallback = "Usuario") {
  const user = state.usersById.get(authUserId);
  if (!user) return fallback;
  const fullName = `${user.firstName} ${user.lastName}`.trim();
  return fullName || user.email || fallback;
}

function getClientsForSelectedProvider() {
  if (!isGuid(state.selectedProviderId)) return [];
  return state.clientsByProviderId.get(state.selectedProviderId) || [];
}

function getClientById(clientId) {
  return state.clients.find((client) => client.id === clientId) || null;
}

function getClientsForMembershipForm() {
  if (!isGuid(state.membership.formProviderId)) return [];
  return state.clientsByProviderId.get(state.membership.formProviderId) || [];
}

function parseAdminRoute() {
  const rawHash = window.location.hash.replace(/^#/, "").trim();
  const section = rawHash || "inicio";
  return Object.prototype.hasOwnProperty.call(ROUTE_SECTIONS, section) ? section : "inicio";
}

function updateAdminRoute(section, { replace = false } = {}) {
  const nextHash = `#${section || "inicio"}`;
  if (window.location.hash === nextHash) return;

  if (replace) {
    window.history.replaceState(null, "", nextHash);
    return;
  }

  window.location.hash = nextHash;
}

function setSection(section) {
  Object.entries(ROUTE_SECTIONS).forEach(([key, elementId]) => {
    document.getElementById(elementId)?.classList.toggle("hidden", key !== section);
  });

  const navItems = [...document.querySelectorAll(".nav-item[data-section]")];
  setActiveNavItems(navItems, section);
}

async function handleAdminRouteChange() {
  if (!isAdminBootstrapComplete) return;

  const section = parseAdminRoute();
  setSection(section);

  // El panorama de membresias cuesta un pedido por cliente: se arma recien
  // cuando la seccion se abre, no en el arranque del panel.
  if (section === "membresias") {
    await loadMembershipOverview();
    renderMembershipSection();
  }
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

  logoutBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    window.location.href = "login.html";
  });
}

function setAdminModalOpen(modalId, isOpen) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  modal.classList.toggle("hidden", !isOpen);
  modal.setAttribute("aria-hidden", isOpen ? "false" : "true");
  document.body.classList.toggle("admin-modal-open", isOpen);

  if (isOpen) {
    modal.querySelector("input, select, textarea")?.focus();
  }
}

function setupAdminModals() {
  const triggers = [
    ["adminOpenProviderModal", "admin-provider-modal"],
    ["adminOpenProviderAdminModal", "admin-provider-admin-modal"],
    [null, "admin-membership-modal"]
  ];

  triggers.forEach(([triggerId, modalId]) => {
    document.getElementById(triggerId)?.addEventListener("click", () => setAdminModalOpen(modalId, true));

    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.querySelectorAll("[data-admin-modal-close]").forEach((button) => {
      button.addEventListener("click", () => setAdminModalOpen(modalId, false));
    });

    modal.addEventListener("click", (event) => {
      if (event.target === modal) setAdminModalOpen(modalId, false);
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    triggers.forEach(([, modalId]) => setAdminModalOpen(modalId, false));
  });
}

function setupNavigation() {
  document.querySelectorAll('.nav-item[data-section]').forEach((item) => {
    item.addEventListener("click", () => {
      const section = item.dataset.section || "inicio";
      updateAdminRoute(section);
    });
  });

  window.addEventListener("hashchange", () => {
    handleAdminRouteChange().catch((error) => {
      console.error("No se pudo resolver la navegacion admin.", error);
    });
  });
}

function setWelcomeMessage() {
  const welcomeName = document.getElementById("welcome-name");
  const welcomeMessage = document.getElementById("welcome-message");
  if (welcomeName) welcomeName.textContent = "Control operativo transversal";
  if (welcomeMessage) welcomeMessage.textContent = `${getUserDisplayName()}: resuelve solicitudes inter-entidad, supervisa la red de proveedores y administra membresias desde un solo lugar.`;
}

function setMembershipFeedback(message, type = "") {
  const feedback = document.getElementById("adminMembershipFeedback");
  if (!feedback) return;
  feedback.textContent = message || "";
  feedback.className = `admin-inline-feedback${type ? ` is-${type}` : ""}`;
}

async function loadAdminSnapshot() {
  const snapshot = await FrontGateway.directory.getAdminSnapshot();

  state.providers = (snapshot.providers ?? snapshot.Providers ?? [])
    .map(normalizeProvider)
    .sort((left, right) => left.name.localeCompare(right.name, "es"));

  state.users = (snapshot.users ?? snapshot.Users ?? [])
    .map(normalizeUser)
    .sort((left, right) => `${left.firstName} ${left.lastName}`.localeCompare(`${right.firstName} ${right.lastName}`, "es"));
  state.usersById = new Map(state.users.map((user) => [user.id, user]));

  const providerAdmins = (snapshot.providerAdminProfiles ?? snapshot.ProviderAdminProfiles ?? [])
    .map(normalizeProviderAdmin);
  const clients = (snapshot.clientProfiles ?? snapshot.ClientProfiles ?? [])
    .map(normalizeClient);
  const rawTechnicians = (snapshot.technicianProfiles ?? snapshot.TechnicianProfiles ?? []);
  const changeRequests = (snapshot.technicianProviderChangeRequests ?? snapshot.TechnicianProviderChangeRequests ?? [])
    .map(normalizeChangeRequest);

  const techniciansWithProfiles = await Promise.all(rawTechnicians.map(async (technician) => {
    const normalizedTechnician = normalizeTechnician(technician);
    try {
      const publicProfile = await FrontGateway.auth.getTechnicianPublicProfile(normalizedTechnician.authUserId);
      return normalizeTechnician(technician, publicProfile);
    } catch {
      return normalizedTechnician;
    }
  }));

  state.clients = clients
    .sort((left, right) => left.fullName.localeCompare(right.fullName, "es"));
  state.clientsById = new Map(state.clients.map((client) => [client.id, client]));
  state.clientsByProviderId = new Map(state.providers.map((provider) => [provider.id, clients.filter((client) => client.providerEntityId === provider.id)]));
  state.providerAdminsByProviderId = new Map(state.providers.map((provider) => [provider.id, providerAdmins.filter((profile) => profile.providerEntityId === provider.id)]));
  state.technicians = techniciansWithProfiles
    .sort((left, right) => `${left.fullName || left.id}`.localeCompare(`${right.fullName || right.id}`, "es"));
  state.techniciansById = new Map(state.technicians.map((technician) => [technician.id, technician]));
  state.techniciansByProviderId = new Map(state.providers.map((provider) => [provider.id, techniciansWithProfiles.filter((technician) => technician.providerEntityId === provider.id)]));

  const dedupedRequests = new Map();
  changeRequests.forEach((request) => {
    dedupedRequests.set(request.id, request);
  });

  state.providerChangeRequests = [...dedupedRequests.values()]
    .sort((left, right) => new Date(right.requestedAtUtc) - new Date(left.requestedAtUtc));

  if (!isGuid(state.selectedProviderId) || !state.providers.some((provider) => provider.id === state.selectedProviderId)) {
    state.selectedProviderId = state.providers[0]?.id ?? null;
  }

  if (!isGuid(state.membership.formProviderId) || !state.providers.some((provider) => provider.id === state.membership.formProviderId)) {
    state.membership.formProviderId = state.selectedProviderId;
  }
}

/** Marca el panorama como viejo sin pedir nada: se recarga al abrir la seccion. */
function invalidateMembershipOverview() {
  state.membership.byClientId.clear();
  state.membership.loadedProviderId = null;
  state.membership.needsManualLoad = false;
}

async function fetchClientMembership(clientId) {
  try {
    return normalizeMembership(await FrontGateway.order.getActiveMembershipByClient(clientId));
  } catch (error) {
    // 404 es la respuesta normal para un cliente sin plan; cualquier otra cosa
    // se marca como fallida para no mostrarla como "sin membresia".
    if (error?.status === 404) return null;
    console.error("No se pudo consultar la membresia del cliente", clientId, error);
    return { failed: true };
  }
}

/**
 * Consulta la membresia de cada cliente de la entidad elegida, de a tandas para
 * no disparar decenas de pedidos simultaneos.
 */
async function loadMembershipOverview({ force = false } = {}) {
  const providerId = state.selectedProviderId;
  const clients = getClientsForSelectedProvider();

  if (!isGuid(providerId) || !clients.length) {
    state.membership.loadedProviderId = providerId;
    state.membership.needsManualLoad = false;
    return;
  }

  if (!force && state.membership.loadedProviderId === providerId) return;

  if (!force && clients.length > MEMBERSHIP_AUTOLOAD_LIMIT) {
    state.membership.needsManualLoad = true;
    return;
  }

  state.membership.isLoading = true;
  state.membership.needsManualLoad = false;
  renderMembershipOverview();

  const pending = [...clients];
  const workers = Array.from({ length: Math.min(6, pending.length) }, async () => {
    while (pending.length) {
      const client = pending.shift();
      const membership = await fetchClientMembership(client.id);
      // La entidad pudo cambiar mientras cargabamos: descartamos lo viejo.
      if (state.selectedProviderId !== providerId) return;
      state.membership.byClientId.set(client.id, membership);
    }
  });

  try {
    await Promise.all(workers);
  } finally {
    state.membership.isLoading = false;
  }

  if (state.selectedProviderId !== providerId) return;
  state.membership.loadedProviderId = providerId;
}

async function loadClientMovements(clientId) {
  if (!isGuid(clientId)) {
    state.membership.movements = [];
    return;
  }

  try {
    const movements = await FrontGateway.order.getCreditMovementsByClient(clientId);
    state.membership.movements = movements
      .map(normalizeCreditMovement)
      .sort((left, right) => new Date(right.occurredAtUtc) - new Date(left.occurredAtUtc));
  } catch (error) {
    if (error?.status === 404) {
      state.membership.movements = [];
    } else {
      throw error;
    }
  }
}

async function loadOperationsSnapshot() {
  const providerFilter = isGuid(state.operations.filters.providerEntityId) ? state.operations.filters.providerEntityId : null;

  const [ordersOverview, reservationsOverview] = await Promise.all([
    FrontGateway.order.getOrdersOverview({
      providerEntityId: providerFilter,
      status: state.operations.filters.orderStatus || null
    }),
    FrontGateway.scheduling.getReservationsOverview({
      providerEntityId: providerFilter,
      status: state.operations.filters.reservationStatus || null
    })
  ]);

  const rawOrders = ordersOverview?.items ?? ordersOverview?.Items ?? [];
  const rawOrderCounts = ordersOverview?.statusCounts ?? ordersOverview?.StatusCounts ?? [];
  const rawReservations = reservationsOverview?.items ?? reservationsOverview?.Items ?? [];
  const rawReservationCounts = reservationsOverview?.statusCounts ?? reservationsOverview?.StatusCounts ?? [];

  state.operations.orders = Array.isArray(rawOrders)
    ? rawOrders.map(normalizeOrder).sort((left, right) => new Date(right.scheduledStartAtUtc) - new Date(left.scheduledStartAtUtc))
    : [];
  state.operations.orderStatusCounts = Array.isArray(rawOrderCounts) ? rawOrderCounts : [];
  state.operations.reservations = Array.isArray(rawReservations)
    ? rawReservations.map(normalizeReservation).sort((left, right) => new Date(right.startAtUtc) - new Date(left.startAtUtc))
    : [];
  state.operations.reservationStatusCounts = Array.isArray(rawReservationCounts) ? rawReservationCounts : [];
}

function renderSummaryCards() {
  const pendingRequests = state.providerChangeRequests.filter((request) => Number(request.status) === 1 || request.status === "Pending").length;

  const setValue = (elementId, value) => {
    const element = document.getElementById(elementId);
    if (element) element.textContent = String(value);
  };

  setValue("adminProvidersCount", state.providers.length);
  setValue("adminUsersCount", state.users.length);
  setValue("adminClientsCount", state.clients.length);
  setValue("adminPendingRequestsCount", pendingRequests);
}

function renderDashboardPendingRequests() {
  const container = document.getElementById("adminDashboardPendingRequests");
  if (!container) return;

  const pendingRequests = state.providerChangeRequests.filter((request) => Number(request.status) === 1 || request.status === "Pending");
  if (!pendingRequests.length) {
    container.innerHTML = '<p class="request-empty-text">No hay solicitudes pendientes para revisar.</p>';
    return;
  }

  container.innerHTML = pendingRequests.slice(0, 4).map(renderChangeRequestCard).join("");
  bindChangeRequestActions(container);
}

function renderRequestsList() {
  const container = document.getElementById("adminRequestsList");
  if (!container) return;

  if (!state.providerChangeRequests.length) {
    container.innerHTML = '<p class="request-empty-text">Todavia no hay solicitudes de cambio de entidad registradas.</p>';
    return;
  }

  container.innerHTML = state.providerChangeRequests.map(renderChangeRequestCard).join("");
  bindChangeRequestActions(container);
}

function renderChangeRequestCard(request) {
  // Si la solicitud no trae el usuario que la creo, se resuelve por el perfil
  // tecnico en vez de mostrarle un hash al admin.
  const technicianProfile = state.technicians.find((technician) => technician.id === request.technicianProfileId);
  const fallbackName = technicianProfile?.fullName
    || (technicianProfile?.authUserId ? getUserName(technicianProfile.authUserId, "") : "")
    || `Tecnico ${String(request.technicianProfileId).slice(0, 8)}`;
  const technicianName = request.requestedByAuthUserId
    ? getUserName(request.requestedByAuthUserId, fallbackName)
    : fallbackName;
  const currentProvider = getProviderName(request.currentProviderEntityId);
  const requestedProvider = getProviderName(request.requestedProviderEntityId);
  const isPending = Number(request.status) === 1 || request.status === "Pending";

  return `
    <article class="admin-request-card">
      <div class="admin-request-head">
        <div>
          <h4>${escapeHtml(technicianName)}</h4>
          <p>${escapeHtml(currentProvider)} &rarr; ${escapeHtml(requestedProvider)}</p>
        </div>
        <span class="admin-status-badge ${getRequestStatusClass(request.status)}">${escapeHtml(getRequestStatusLabel(request.status))}</span>
      </div>
      <div class="admin-meta-grid">
        <div class="admin-meta-item">
          <strong>Solicitada</strong>
          <span>${escapeHtml(formatDateTime(request.requestedAtUtc))}</span>
        </div>
        <div class="admin-meta-item">
          <strong>Entidad destino</strong>
          <span>${escapeHtml(requestedProvider)}</span>
        </div>
        <div class="admin-meta-item">
          <strong>Entidad actual</strong>
          <span>${escapeHtml(currentProvider)}</span>
        </div>
      </div>
      ${request.note ? `<p>${escapeHtml(request.note)}</p>` : ""}
      ${request.reviewedAtUtc ? `<p>Resuelta ${escapeHtml(formatDateTime(request.reviewedAtUtc))}${request.resolutionNote ? ` · ${escapeHtml(request.resolutionNote)}` : ""}</p>` : ""}
      ${isPending ? `
        <div class="admin-request-actions">
          <button type="button" class="btn btn-primary admin-approve-request" data-request-id="${escapeHtml(request.id)}">Aprobar</button>
          <button type="button" class="btn btn-secondary admin-reject-request" data-request-id="${escapeHtml(request.id)}">Rechazar</button>
        </div>` : ""}
    </article>
  `;
}

function bindChangeRequestActions(container) {
  container.querySelectorAll(".admin-approve-request").forEach((button) => {
    button.addEventListener("click", () => {
      resolveChangeRequest(button.dataset.requestId, 2).catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudo aprobar la solicitud."), {
          type: "error",
          title: "Solicitud no resuelta"
        });
      });
    });
  });

  container.querySelectorAll(".admin-reject-request").forEach((button) => {
    button.addEventListener("click", () => {
      resolveChangeRequest(button.dataset.requestId, 3).catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudo rechazar la solicitud."), {
          type: "error",
          title: "Solicitud no resuelta"
        });
      });
    });
  });
}

function renderMembershipSelectors() {
  const providerOptions = (selectedId) => (state.providers.length
    ? state.providers.map((provider) => `<option value="${escapeHtml(provider.id)}" ${provider.id === selectedId ? "selected" : ""}>${escapeHtml(provider.name)}</option>`).join("")
    : '<option value="">Sin entidades</option>');

  const browseSelect = document.getElementById("adminMembershipProviderSelect");
  if (browseSelect) browseSelect.innerHTML = providerOptions(state.selectedProviderId);

  const formProviderSelect = document.getElementById("adminMembershipFormProviderSelect");
  if (formProviderSelect) formProviderSelect.innerHTML = providerOptions(state.membership.formProviderId);

  const clientSelect = document.getElementById("adminMembershipClientSelect");
  if (clientSelect) {
    const clients = getClientsForMembershipForm();
    clientSelect.innerHTML = clients.length
      ? clients.map((client) => `<option value="${escapeHtml(client.id)}" ${client.id === state.membership.formClientId ? "selected" : ""}>${escapeHtml(client.fullName)}</option>`).join("")
      : '<option value="">Sin clientes para la entidad seleccionada</option>';

    if (clients.length && !clients.some((client) => client.id === state.membership.formClientId)) {
      state.membership.formClientId = clients[0].id;
      clientSelect.value = clients[0].id;
    }
  }

  renderMembershipFormWarning();
}

/** Avisa si el cliente elegido en el formulario ya tiene un plan vigente. */
function renderMembershipFormWarning() {
  const warning = document.getElementById("adminMembershipFormWarning");
  if (!warning) return;

  const current = state.membership.byClientId.get(state.membership.formClientId);
  if (!current || current.failed || getMembershipStatus(current) === "vencida") {
    warning.classList.add("hidden");
    warning.textContent = "";
    return;
  }

  const daysLeft = getMembershipDaysLeft(current);
  warning.classList.remove("hidden");
  warning.innerHTML = `
    <i class="fas fa-circle-info"></i>
    <span>Este cliente ya tiene <strong>${escapeHtml(current.planName)}</strong> con ${escapeHtml(String(current.availableCredits))} creditos disponibles${daysLeft !== null && daysLeft >= 0 ? ` y ${escapeHtml(String(daysLeft))} dias de vigencia` : ""}. La nueva membresia se suma a la existente.</span>
  `;
}

function renderMembershipStats() {
  const container = document.getElementById("adminMembershipStats");
  if (!container) return;

  const rows = getMembershipRows();
  if (!rows.length || state.membership.loadedProviderId !== state.selectedProviderId) {
    container.innerHTML = "";
    return;
  }

  const counts = rows.reduce((accumulator, row) => {
    accumulator[row.status] = (accumulator[row.status] ?? 0) + 1;
    return accumulator;
  }, {});
  const availableCredits = rows.reduce((total, row) => total + (row.membership?.failed ? 0 : Number(row.membership?.availableCredits ?? 0)), 0);
  const withoutPlan = (counts["sin-membresia"] ?? 0) + (counts.vencida ?? 0);

  const tiles = [
    { icon: "fa-users", value: rows.length, label: "Clientes" },
    { icon: "fa-circle-check", value: counts.vigente ?? 0, label: "Con plan vigente" },
    { icon: "fa-hourglass-half", value: counts["por-vencer"] ?? 0, label: "Vencen en 30 dias", tone: (counts["por-vencer"] ?? 0) > 0 ? "is-late" : "" },
    { icon: "fa-battery-empty", value: counts["sin-credito"] ?? 0, label: "Sin credito", tone: (counts["sin-credito"] ?? 0) > 0 ? "is-late" : "" },
    { icon: "fa-user-slash", value: withoutPlan, label: "Sin plan vigente" },
    { icon: "fa-coins", value: availableCredits, label: "Creditos disponibles" }
  ];

  container.innerHTML = tiles.map((tile) => `
    <div class="admin-stat ${tile.tone || ""}">
      <i class="fas ${tile.icon}"></i>
      <div>
        <strong>${escapeHtml(String(tile.value))}</strong>
        <small>${escapeHtml(tile.label)}</small>
      </div>
    </div>
  `).join("");
}

function renderMembershipFilters() {
  const container = document.getElementById("adminMembershipFilters");
  if (!container) return;

  container.querySelectorAll("[data-membership-filter]").forEach((chip) => {
    const isActive = chip.dataset.membershipFilter === state.membership.filter;
    chip.classList.toggle("is-active", isActive);
    chip.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function renderMembershipCard({ client, membership, status }) {
  const meta = MEMBERSHIP_STATUS_META[status] ?? MEMBERSHIP_STATUS_META["sin-membresia"];
  // La entidad no se repite en cada tarjeta: el listado ya esta filtrado por ella.
  const head = `
    <div class="admin-membership-card__head">
      <span class="admin-user-avatar" aria-hidden="true">${escapeHtml(getInitials(client.fullName))}</span>
      <div class="admin-membership-card__identity">
        <strong>${escapeHtml(client.fullName)}</strong>
      </div>
      <span class="admin-membership-badge">
        <i class="fas ${meta.icon}" aria-hidden="true"></i>
        ${escapeHtml(meta.label)}
      </span>
    </div>
  `;

  if (status === "error") {
    return `
      <article class="admin-membership-card ${meta.tone}">
        ${head}
        <p class="admin-membership-card__empty">No pudimos leer la membresia de este cliente. Proba con Actualizar.</p>
      </article>
    `;
  }

  if (!membership) {
    return `
      <article class="admin-membership-card ${meta.tone}">
        ${head}
        <p class="admin-membership-card__empty">Todavia no tiene creditos para reservar servicios.</p>
        <div class="admin-membership-card__actions">
          <button type="button" class="btn btn-primary" data-membership-create="${escapeHtml(client.id)}">
            <i class="fas fa-plus-circle"></i>
            Crear membresia
          </button>
          <button type="button" class="btn btn-secondary" data-membership-movements="${escapeHtml(client.id)}">
            Ver movimientos
          </button>
        </div>
      </article>
    `;
  }

  const total = Math.max(Number(membership.totalCredits) || 0, 0);
  const available = Math.max(Number(membership.availableCredits) || 0, 0);
  const used = Math.max(total - available, 0);
  const percentage = total > 0 ? Math.min(Math.round((available / total) * 100), 100) : 0;
  const daysLeft = getMembershipDaysLeft(membership);
  // formatArgentinaDate agrega el dia de la semana por defecto: en una tarjeta
  // densa el rango se lee mejor en formato corto.
  const shortDate = (value) => formatArgentinaDate(value, { weekday: undefined, day: "2-digit", month: "2-digit", year: "2-digit" });
  const validity = `${shortDate(membership.validFromUtc)} a ${shortDate(membership.validToUtc)}`;

  let validityNote = "";
  if (daysLeft !== null && daysLeft < 0) validityNote = `Vencio hace ${Math.abs(daysLeft)} dias`;
  else if (daysLeft === 0) validityNote = "Vence hoy";
  else if (daysLeft !== null) validityNote = `Vence en ${daysLeft} dias`;

  return `
    <article class="admin-membership-card ${meta.tone}">
      ${head}
      <p class="admin-membership-card__plan">${escapeHtml(membership.planName)}</p>
      <div class="admin-membership-card__credits">
        <div class="admin-membership-card__credits-head">
          <strong>${escapeHtml(String(available))}</strong>
          <span>de ${escapeHtml(String(total))} creditos</span>
        </div>
        <div class="admin-membership-card__bar" role="img" aria-label="${escapeHtml(`${available} de ${total} creditos disponibles`)}">
          <span style="width: ${percentage}%"></span>
        </div>
        <small>${escapeHtml(used === 1 ? "1 credito consumido" : `${used} creditos consumidos`)}</small>
      </div>
      <dl class="admin-membership-card__facts">
        <div>
          <dt>Vigencia</dt>
          <dd>${escapeHtml(validity)}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>${escapeHtml(validityNote || (membership.isActive ? "Activa" : "Inactiva"))}</dd>
        </div>
      </dl>
      <div class="admin-membership-card__actions">
        <button type="button" class="btn btn-secondary" data-membership-movements="${escapeHtml(client.id)}">
          <i class="fas fa-list-ul"></i>
          Ver movimientos
        </button>
        <button type="button" class="btn btn-secondary" data-membership-renew="${escapeHtml(client.id)}">
          Renovar
        </button>
      </div>
    </article>
  `;
}

function renderMembershipOverview() {
  const container = document.getElementById("adminMembershipOverview");
  if (!container) return;

  if (!state.providers.length) {
    container.innerHTML = '<p class="request-empty-text">Todavia no hay entidades proveedoras cargadas.</p>';
    return;
  }

  const clients = getClientsForSelectedProvider();
  if (!clients.length) {
    container.innerHTML = '<p class="request-empty-text">Esta entidad no tiene clientes asociados.</p>';
    return;
  }

  // Sin panorama cargado la cache esta vacia: mostrar tarjetas ahora diria
  // "sin membresia" para todos, que es justo lo contrario de lo que sabemos.
  const isStale = state.membership.loadedProviderId !== state.selectedProviderId && !state.membership.needsManualLoad;
  if (state.membership.isLoading || isStale) {
    container.innerHTML = `
      <div class="loading-spinner">
        <i class="fas fa-spinner fa-spin"></i>
        <p>Consultando membresias de ${escapeHtml(String(clients.length))} clientes...</p>
      </div>
    `;
    return;
  }

  if (state.membership.needsManualLoad) {
    container.innerHTML = `
      <div class="admin-membership-prompt">
        <i class="fas fa-layer-group" aria-hidden="true"></i>
        <strong>${escapeHtml(String(clients.length))} clientes en esta entidad</strong>
        <p>El saldo se consulta cliente por cliente, asi que para listas grandes lo pedimos a mano.</p>
        <button type="button" class="btn btn-primary" id="adminMembershipLoadOverview">
          <i class="fas fa-cloud-arrow-down"></i>
          Cargar panorama
        </button>
      </div>
    `;
    return;
  }

  const rows = getVisibleMembershipRows();
  if (!rows.length) {
    container.innerHTML = '<p class="request-empty-text">Ningun cliente coincide con el filtro o la busqueda.</p>';
    return;
  }

  container.innerHTML = rows.map(renderMembershipCard).join("");
}

function renderMembershipMovements() {
  const panel = document.getElementById("adminMembershipMovementsPanel");
  const container = document.getElementById("adminMembershipMovements");
  const subtitle = document.getElementById("adminMembershipMovementsSubtitle");
  if (!panel || !container) return;

  const client = getClientById(state.membership.openClientId);
  panel.classList.toggle("hidden", !client);
  if (!client) return;

  if (subtitle) subtitle.textContent = `Consumos y recargas de ${client.fullName}.`;

  if (!state.membership.movements.length) {
    container.innerHTML = '<p class="request-empty-text">Todavia no hay movimientos de creditos para este cliente.</p>';
    return;
  }

  container.innerHTML = state.membership.movements.map((movement) => `
    <article class="admin-credit-movement ${movement.creditsDelta < 0 ? "is-consumption" : "is-credit"}">
      <div class="admin-credit-movement__head">
        <strong>${escapeHtml(movement.movementType)}</strong>
        <span>${escapeHtml(movement.creditsDelta > 0 ? `+${movement.creditsDelta}` : String(movement.creditsDelta))} creditos</span>
      </div>
      <div class="admin-credit-movement__meta">
        <span>${escapeHtml(formatDateTime(movement.occurredAtUtc))}</span>
        ${movement.serviceOrderId ? `<span>Orden ${escapeHtml(String(movement.serviceOrderId).slice(0, 8))}</span>` : ""}
      </div>
      ${movement.note ? `<p>${escapeHtml(movement.note)}</p>` : ""}
    </article>
  `).join("");
}

function renderProvidersList() {
  const container = document.getElementById("adminProvidersList");
  if (!container) return;

  if (!state.providers.length) {
    container.innerHTML = '<p class="request-empty-text">No se encontraron entidades proveedoras para mostrar.</p>';
    return;
  }

  container.innerHTML = state.providers.map((provider) => {
    const clients = state.clientsByProviderId.get(provider.id) || [];
    const providerAdmins = state.providerAdminsByProviderId.get(provider.id) || [];
    const technicians = state.techniciansByProviderId.get(provider.id) || [];
    const pendingRequests = state.providerChangeRequests.filter((request) => request.requestedProviderEntityId === provider.id && (Number(request.status) === 1 || request.status === "Pending")).length;

    return `
      <article class="admin-provider-card">
        <div class="admin-provider-card__head">
          <div>
            <h4>${escapeHtml(provider.name)}</h4>
            <p>Creada ${escapeHtml(formatDateTime(provider.createdAtUtc))}</p>
          </div>
          <span class="admin-provider-state ${provider.isEnabled ? "is-enabled" : "is-disabled"}">${escapeHtml(provider.isEnabled ? "Habilitada" : "Deshabilitada")}</span>
        </div>
        <div class="admin-meta-grid">
          <div class="admin-meta-item">
            <strong>Clientes</strong>
            <span>${escapeHtml(String(clients.length))}</span>
          </div>
          <div class="admin-meta-item">
            <strong>Admins de entidad</strong>
            <span>${escapeHtml(String(providerAdmins.length))}</span>
          </div>
          <div class="admin-meta-item">
            <strong>Tecnicos</strong>
            <span>${escapeHtml(String(technicians.length))}</span>
          </div>
          <div class="admin-meta-item">
            <strong>Solicitudes pendientes</strong>
            <span>${escapeHtml(String(pendingRequests))}</span>
          </div>
          <div class="admin-meta-item">
            <strong>Ultima actualizacion</strong>
            <span>${escapeHtml(formatDateTime(provider.updatedAtUtc))}</span>
          </div>
        </div>
        <form class="admin-provider-edit-form" data-provider-edit-form="${escapeHtml(provider.id)}">
          <label>
            <span>Nombre visible</span>
            <input type="text" data-provider-name value="${escapeHtml(provider.name)}" maxlength="120">
          </label>
          <label class="admin-checkbox-row">
            <input type="checkbox" data-provider-enabled ${provider.isEnabled ? "checked" : ""}>
            <span>Entidad habilitada</span>
          </label>
          <div class="admin-provider-edit-actions">
            <button type="submit" class="btn btn-secondary">Guardar cambios</button>
          </div>
        </form>
        <div class="admin-provider-admins">
          <h5>Admins de entidad</h5>
          <div class="admin-provider-people-list">
            ${providerAdmins.length
              ? providerAdmins.map((profile) => `
                  <div class="admin-provider-people-item">
                    <strong>${escapeHtml(profile.fullName)}</strong>
                    <span>${escapeHtml(formatDateTime(profile.createdAtUtc))}</span>
                  </div>
                `).join("")
              : '<p class="request-empty-text">Todavia no hay admins asociados.</p>'}
          </div>
        </div>
        <div class="admin-provider-technicians">
          <h5>Tecnicos</h5>
          <div class="admin-provider-people-list">
            ${technicians.length
              ? technicians.map((technician) => `
                  <div class="admin-provider-people-item">
                    <strong>${escapeHtml(technician.fullName || `Tecnico ${String(technician.id).slice(0, 8)}`)}</strong>
                    <span>${escapeHtml(technician.specialty || "Sin especialidad")}</span>
                    <div class="admin-operation-reassign__actions">
                      <span class="admin-provider-pill is-technician">${escapeHtml(getTechnicianStatusLabel(technician.status))}</span>
                      <select data-technician-status-select="${escapeHtml(technician.id)}">
                        <option value="1" ${getTechnicianStatusValue(technician.status) === 1 ? "selected" : ""}>Activo</option>
                        <option value="2" ${getTechnicianStatusValue(technician.status) === 2 ? "selected" : ""}>Restringido</option>
                        <option value="3" ${getTechnicianStatusValue(technician.status) === 3 ? "selected" : ""}>Inactivo</option>
                      </select>
                      <button type="button" class="btn btn-secondary admin-update-technician-status" data-technician-id="${escapeHtml(technician.id)}">Actualizar estado</button>
                    </div>
                  </div>
                `).join("")
              : '<p class="request-empty-text">No hay tecnicos cargados para esta entidad.</p>'}
          </div>
        </div>
      </article>
    `;
  }).join("");

  bindProviderActions(container);
}

function renderProviderSelectors() {
  const providerSelect = document.getElementById("adminProviderAdminProviderSelect");
  const operationsProviderSelect = document.getElementById("adminOperationsProviderFilter");

  const providerOptions = state.providers.length
    ? state.providers.map((provider) => `<option value="${escapeHtml(provider.id)}">${escapeHtml(provider.name)}</option>`).join("")
    : '<option value="">Sin entidades</option>';

  if (providerSelect) {
    providerSelect.innerHTML = providerOptions;
  }

  if (operationsProviderSelect) {
    operationsProviderSelect.innerHTML = ['<option value="">Todas</option>', ...state.providers.map((provider) => `<option value="${escapeHtml(provider.id)}" ${provider.id === state.operations.filters.providerEntityId ? "selected" : ""}>${escapeHtml(provider.name)}</option>`)].join("");
  }
}

function renderUsersList() {
  const container = document.getElementById("adminUsersList");
  if (!container) return;

  const roleFilter = (document.getElementById("adminUsersRoleFilter")?.value || "").trim().toLowerCase();
  const searchValue = (document.getElementById("adminUsersSearch")?.value || "").trim().toLowerCase();

  const users = state.users.filter((user) => {
    const matchesRole = !roleFilter || String(user.role || "").toLowerCase() === roleFilter;
    const haystack = `${user.firstName} ${user.lastName} ${user.email}`.toLowerCase();
    const matchesSearch = !searchValue || haystack.includes(searchValue);
    return matchesRole && matchesSearch;
  });

  if (!users.length) {
    container.innerHTML = '<p class="request-empty-text">No hay usuarios que coincidan con los filtros actuales.</p>';
    return;
  }

  container.innerHTML = users.map((user) => {
    const fullName = `${user.firstName} ${user.lastName}`.trim() || user.email;

    return `
    <article class="admin-user-card ${user.isActive === false ? "is-inactive" : ""}">
      <div class="admin-user-card__head">
        <span class="admin-user-avatar" aria-hidden="true">${escapeHtml(getInitials(fullName))}</span>
        <div class="admin-user-card__identity">
          <strong>${escapeHtml(fullName)}</strong>
          <p>${escapeHtml(user.email)}</p>
        </div>
        <span class="admin-user-role-badge ${getUserRoleBadgeClass(user.role)}">${escapeHtml(getUserRoleLabel(user.role))}</span>
      </div>
      <div class="admin-user-card__meta">
        ${user.isActive === false ? '<span class="admin-user-flag">Cuenta inactiva</span>' : ""}
        ${user.phoneNumber ? `<span>${escapeHtml(user.phoneNumber)}</span>` : ""}
        <span>Alta ${escapeHtml(formatDateTime(user.createdAtUtc))}</span>
      </div>
    </article>
  `;
  }).join("");
}

function renderUsersStats() {
  const container = document.getElementById("adminUsersStats");
  if (!container) return;

  const countByRole = (role) => state.users.filter((user) => String(user.role || "").toLowerCase() === role).length;

  const stats = [
    { icon: "fa-users", label: "Usuarios", value: String(state.users.length) },
    { icon: "fa-user", label: "Clientes", value: String(countByRole("client")) },
    { icon: "fa-user-gear", label: "Tecnicos", value: String(countByRole("technician")) },
    { icon: "fa-user-shield", label: "Admins de entidad", value: String(countByRole("provideradmin")) }
  ];

  const inactive = state.users.filter((user) => user.isActive === false).length;
  if (inactive > 0) {
    stats.push({ icon: "fa-user-slash", label: inactive === 1 ? "Cuenta inactiva" : "Cuentas inactivas", value: String(inactive), tone: "late" });
  }

  container.innerHTML = stats.map((stat) => `
    <div class="admin-stat ${stat.tone ? `is-${escapeHtml(stat.tone)}` : ""}">
      <i class="fas ${escapeHtml(stat.icon)}" aria-hidden="true"></i>
      <span>
        <strong>${escapeHtml(stat.value)}</strong>
        <small>${escapeHtml(stat.label)}</small>
      </span>
    </div>
  `).join("");
}

function renderOperationsSummary() {
  const container = document.getElementById("adminOperationsSummary");
  if (!container) return;

  const orders = state.operations.orders;
  const reservations = state.operations.reservations;
  const exceptionOrders = orders.filter((order) => String(order.status) === "Exception" || Number(order.status) === 5).length;
  const activeOrders = orders.filter((order) => ![4, 5, 6, "Finalized", "Exception", "Closed"].includes(order.status)).length;
  const pendingReservations = reservations.filter((reservation) => [1, 2, 7, "Created", "Confirmed", "Approved"].includes(reservation.status)).length;

  container.innerHTML = `
    <div class="admin-meta-item">
      <strong>Ordenes cargadas</strong>
      <span>${escapeHtml(String(orders.length))}</span>
    </div>
    <div class="admin-meta-item">
      <strong>Ordenes activas</strong>
      <span>${escapeHtml(String(activeOrders))}</span>
    </div>
    <div class="admin-meta-item">
      <strong>Excepciones</strong>
      <span class="admin-operations-summary-pill">${escapeHtml(String(exceptionOrders))}</span>
    </div>
    <div class="admin-meta-item">
      <strong>Reservas pendientes</strong>
      <span>${escapeHtml(String(pendingReservations))}</span>
    </div>
  `;
}

function renderOrdersList() {
  const container = document.getElementById("adminOrdersList");
  if (!container) return;

  if (!state.operations.orders.length) {
    container.innerHTML = '<p class="request-empty-text">No hay ordenes para los filtros seleccionados.</p>';
    return;
  }

  const technicianOptions = state.technicians
    .filter((technician) => getTechnicianStatusValue(technician.status) === 1)
    .map((technician) => `<option value="${escapeHtml(technician.id)}">${escapeHtml(technician.fullName || `Tecnico ${String(technician.id).slice(0, 8)}`)} · ${escapeHtml(getProviderName(technician.providerEntityId))}</option>`)
    .join("");

  container.innerHTML = state.operations.orders.slice(0, 18).map((order) => `
    <article class="admin-operation-card ${String(order.status) === "Exception" || Number(order.status) === 5 ? "is-exception" : "is-attention"}">
      <div class="admin-operation-card__head">
        <div>
          <strong>Orden ${escapeHtml(String(order.id).slice(0, 8))}</strong>
          <p>${escapeHtml(getClientName(order.clientId))} · ${escapeHtml(getProviderName(order.providerEntityId))}</p>
        </div>
        <span class="admin-status-badge ${getOperationBadgeClass(order.status)}">${escapeHtml(getOperationStatusLabel(order.status))}</span>
      </div>
      <div class="admin-operation-card__meta">
        <span>Tecnico actual: ${escapeHtml(getTechnicianName(order.technicianId))}</span>
        <span>Agenda: ${escapeHtml(formatDateTime(order.scheduledStartAtUtc))}</span>
        <span>Total: ${escapeHtml(formatCurrency(order.totalAmount))}</span>
        ${order.exceptionReason ? `<span>Motivo: ${escapeHtml(order.exceptionReason)}</span>` : ""}
      </div>
      ${canAdminReassignOrder(order) ? `
        <div class="admin-operation-reassign">
          <select data-admin-order-technician="${escapeHtml(order.id)}">
            <option value="">Seleccionar tecnico</option>
            ${technicianOptions}
          </select>
          <div class="admin-operation-reassign__actions">
            <button type="button" class="btn btn-secondary admin-reassign-order" data-order-id="${escapeHtml(order.id)}">Reasignar orden y reserva</button>
          </div>
        </div>` : '<p class="request-empty-text">La reasignacion administrativa no esta disponible para este estado.</p>'}
    </article>
  `).join("");

  bindOperationsActions(container);
}

function renderReservationsList() {
  const container = document.getElementById("adminReservationsList");
  if (!container) return;

  if (!state.operations.reservations.length) {
    container.innerHTML = '<p class="request-empty-text">No hay reservas para los filtros seleccionados.</p>';
    return;
  }

  container.innerHTML = state.operations.reservations.slice(0, 18).map((reservation) => `
    <article class="admin-operation-card ${String(reservation.status) === "Exception" || Number(reservation.status) === 5 ? "is-exception" : "is-attention"}">
      <div class="admin-operation-card__head">
        <div>
          <strong>Reserva ${escapeHtml(String(reservation.id).slice(0, 8))}</strong>
          <p>${escapeHtml(getClientName(reservation.clientId))} · ${escapeHtml(getProviderName(reservation.providerEntityId))}</p>
        </div>
        <span class="admin-status-badge ${getOperationBadgeClass(reservation.status)}">${escapeHtml(getOperationStatusLabel(reservation.status))}</span>
      </div>
      <div class="admin-operation-card__meta">
        <span>Tecnico actual: ${escapeHtml(getTechnicianName(reservation.technicianId))}</span>
        <span>Inicio: ${escapeHtml(formatDateTime(reservation.startAtUtc))}</span>
        <span>Fin: ${escapeHtml(formatDateTime(reservation.endAtUtc))}</span>
      </div>
    </article>
  `).join("");
}

function bindProviderActions(container) {
  container.querySelectorAll("[data-provider-edit-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      updateProvider(form.getAttribute("data-provider-edit-form"), form).catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudo actualizar la entidad."), {
          type: "error",
          title: "Proveedor no actualizado"
        });
      });
    });
  });

  container.querySelectorAll(".admin-update-technician-status").forEach((button) => {
    button.addEventListener("click", () => {
      const technicianId = button.dataset.technicianId;
      const select = container.querySelector(`[data-technician-status-select="${technicianId}"]`);
      const status = Number(select?.value || 0);
      updateTechnicianStatusFromAdmin(technicianId, status).catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudo actualizar el estado del tecnico."), {
          type: "error",
          title: "Tecnico no actualizado"
        });
      });
    });
  });
}

function bindOperationsActions(container) {
  container.querySelectorAll(".admin-reassign-order").forEach((button) => {
    button.addEventListener("click", () => {
      reassignOrderFromAdmin(button.dataset.orderId).catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudo reasignar la orden."), {
          type: "error",
          title: "Reasignacion no completada"
        });
      });
    });
  });
}

function getErrorMessage(error, fallbackMessage) {
  if (!error) return fallbackMessage;
  if (typeof error.message === "string" && error.message.trim()) return error.message;
  if (typeof error.body === "string" && error.body.trim()) return error.body;
  return fallbackMessage;
}

function setProviderFeedback(message, type = "") {
  const feedback = document.getElementById("adminProviderFeedback");
  if (!feedback) return;
  feedback.textContent = message || "";
  feedback.className = `admin-inline-feedback${type ? ` is-${type}` : ""}`;
}

function setProviderAdminFeedback(message, type = "") {
  const feedback = document.getElementById("adminProviderAdminFeedback");
  if (!feedback) return;
  feedback.textContent = message || "";
  feedback.className = `admin-inline-feedback${type ? ` is-${type}` : ""}`;
}

function prefillMembershipRenewal(membership) {
  if (!membership) return;

  // Las fechas de los inputs son dias de Argentina: convertir con toISOString()
  // corre un dia cuando la vigencia termina de noche.
  const nextStart = shiftArgentinaDate(getArgentinaDateInputValue(membership.validToUtc), 1);

  document.getElementById("adminMembershipPlanName").value = membership.planName || "";
  document.getElementById("adminMembershipTotalCredits").value = String(membership.totalCredits || 1);
  document.getElementById("adminMembershipValidFrom").value = nextStart;
  document.getElementById("adminMembershipValidTo").value = shiftArgentinaDate(nextStart, 30);
  setMembershipFeedback("Formulario listo para renovar con el mismo plan.", "success");
}

async function createProvider(event) {
  event.preventDefault();

  const name = document.getElementById("adminProviderName")?.value?.trim() ?? "";
  const isEnabled = document.getElementById("adminProviderEnabled")?.checked ?? true;
  if (!name) throw new Error("Ingresa un nombre valido para la entidad.");

  const submitButton = document.getElementById("adminProviderSubmitBtn");
  submitButton?.setAttribute("disabled", "disabled");
  setProviderFeedback("Creando entidad proveedora...");

  try {
    await FrontGateway.directory.createProvider({ name, isEnabled });
    document.getElementById("adminProviderForm")?.reset();
    document.getElementById("adminProviderEnabled").checked = true;
    setAdminModalOpen("admin-provider-modal", false);
    await refreshAdminData();
    setProviderFeedback("Entidad proveedora creada correctamente.", "success");
    showAppFeedback("La nueva entidad ya forma parte de la red global y puede recibir admins, clientes y tecnicos.", {
      type: "success",
      title: "Entidad creada"
    });
  } finally {
    submitButton?.removeAttribute("disabled");
  }
}

async function updateProvider(providerId, form) {
  if (!isGuid(providerId)) throw new Error("Entidad invalida para actualizar.");

  const name = form.querySelector("[data-provider-name]")?.value?.trim() ?? "";
  const isEnabled = form.querySelector("[data-provider-enabled]")?.checked ?? false;
  if (!name) throw new Error("Ingresa un nombre valido para la entidad.");

  await FrontGateway.directory.updateProvider(providerId, { name, isEnabled });
  await refreshAdminData();
  showAppFeedback("La entidad proveedora quedo actualizada.", {
    type: "success",
    title: "Proveedor actualizado"
  });
}

async function createProviderAdmin(event) {
  event.preventDefault();

  const providerEntityId = document.getElementById("adminProviderAdminProviderSelect")?.value ?? "";
  const firstName = document.getElementById("adminProviderAdminFirstName")?.value?.trim() ?? "";
  const lastName = document.getElementById("adminProviderAdminLastName")?.value?.trim() ?? "";
  const email = document.getElementById("adminProviderAdminEmail")?.value?.trim() ?? "";
  const dni = document.getElementById("adminProviderAdminDni")?.value?.trim() ?? "";
  const phone = document.getElementById("adminProviderAdminPhone")?.value?.trim() ?? "";
  const password = document.getElementById("adminProviderAdminPassword")?.value ?? "";

  if (!isGuid(providerEntityId)) throw new Error("Selecciona una entidad valida.");
  if (!firstName || !lastName || !email || !dni || !phone || password.length < 8) {
    throw new Error("Completa correctamente los datos del admin de entidad.");
  }

  const submitButton = document.getElementById("adminProviderAdminSubmitBtn");
  submitButton?.setAttribute("disabled", "disabled");
  setProviderAdminFeedback("Creando admin de entidad...");

  try {
    await FrontGateway.auth.createProviderAdmin({ firstName, lastName, email, dni, password, phone, providerEntityId });
    document.getElementById("adminProviderAdminForm")?.reset();
    renderProviderSelectors();
    setAdminModalOpen("admin-provider-admin-modal", false);
    await refreshAdminData();
    setProviderAdminFeedback("Admin de entidad creado correctamente.", "success");
    showAppFeedback("El admin ya puede ingresar y operar la entidad asignada.", {
      type: "success",
      title: "Admin creado"
    });
  } finally {
    submitButton?.removeAttribute("disabled");
  }
}

async function updateTechnicianStatusFromAdmin(technicianId, status) {
  if (!isGuid(technicianId)) throw new Error("Tecnico invalido.");
  if (![1, 2, 3].includes(Number(status))) throw new Error("Estado tecnico invalido.");

  await FrontGateway.directory.changeTechnicianStatus(technicianId, Number(status));
  await refreshAdminData();
  showAppFeedback("El estado del tecnico quedo actualizado desde administracion global.", {
    type: "success",
    title: "Tecnico actualizado"
  });
}

async function reassignOrderFromAdmin(orderId) {
  if (!isGuid(orderId)) throw new Error("Orden invalida para reasignar.");

  const order = state.operations.orders.find((entry) => entry.id === orderId);
  if (!order) throw new Error("No se encontro la orden seleccionada.");

  const select = document.querySelector(`[data-admin-order-technician="${orderId}"]`);
  const technicianId = select?.value ?? "";
  if (!isGuid(technicianId)) throw new Error("Selecciona un tecnico valido.");
  if (technicianId === order.technicianId) throw new Error("La orden ya se encuentra asignada a ese tecnico.");

  const previousTechnicianId = order.technicianId;
  const note = "Reassigned by global admin panel.";

  if (isGuid(order.reservationId)) {
    await FrontGateway.scheduling.reassignReservation(order.reservationId, {
      technicianId,
      requestedByUserId: state.user?.userId ?? null,
      reason: note,
      overrideByAdmin: true
    });
  }

  try {
    await FrontGateway.order.reassignTechnician(order.id, {
      technicianId,
      requestedByUserId: state.user?.userId ?? null,
      reason: note,
      overrideByAdmin: true
    });
  } catch (error) {
    if (isGuid(order.reservationId)) {
      await FrontGateway.scheduling.reassignReservation(order.reservationId, {
        technicianId: previousTechnicianId,
        requestedByUserId: state.user?.userId ?? null,
        reason: "Rollback after OrderMS reassignment failure.",
        overrideByAdmin: true
      });
    }

    throw error;
  }

  await loadOperationsSnapshot();
  renderOperationsSummary();
  renderOrdersList();
  renderReservationsList();
  showAppFeedback("La orden y su reserva asociada fueron reasignadas por administracion global.", {
    type: "success",
    title: "Reasignacion completada"
  });
}

async function resolveChangeRequest(requestId, status) {
  if (!isGuid(requestId)) throw new Error("Solicitud invalida para resolver.");
  const request = state.providerChangeRequests.find((entry) => entry.id === requestId);
  if (!request) throw new Error("No se encontro la solicitud seleccionada.");

  const requestedProvider = getProviderName(request.requestedProviderEntityId);
  const technicianName = request.requestedByAuthUserId
    ? getUserName(request.requestedByAuthUserId, "Tecnico")
    : `Tecnico ${String(request.technicianProfileId).slice(0, 8)}`;

  const confirmed = await confirmAppAction({
    title: status === 2 ? "Aprobar incorporacion" : "Rechazar solicitud",
    message: status === 2
      ? `Vas a aprobar la incorporacion de ${technicianName} a ${requestedProvider}.`
      : `Vas a rechazar la solicitud de ${technicianName} dirigida a ${requestedProvider}.`,
    confirmLabel: status === 2 ? "Aprobar" : "Rechazar",
    cancelLabel: "Cancelar",
    tone: status === 2 ? "default" : "danger"
  });

  if (!confirmed) return;

  const note = status === 2
    ? "Solicitud aprobada por Administracion Global."
    : "Solicitud rechazada por Administracion Global.";

  await FrontGateway.directory.resolveTechnicianProviderChangeRequest(requestId, {
    status,
    note
  });

  await loadAdminSnapshot();
  invalidateMembershipOverview();
  await loadOperationsSnapshot();
  renderAll();
  await refreshMembershipIfVisible();

  showAppFeedback(
    status === 2 ? "La solicitud fue aprobada y la entidad del tecnico quedo actualizada." : "La solicitud fue rechazada.",
    {
      type: "success",
      title: status === 2 ? "Solicitud aprobada" : "Solicitud rechazada"
    }
  );
}

async function refreshAdminData() {
  clearAppFeedback();
  await loadAdminSnapshot();
  invalidateMembershipOverview();
  await loadOperationsSnapshot();
  renderAll();
  await refreshMembershipIfVisible();
}

function renderMembershipSection() {
  renderMembershipStats();
  renderMembershipFilters();
  renderMembershipOverview();
  renderMembershipMovements();
}

/** Tras invalidar la cache hay que rearmar el panorama si el admin lo esta mirando. */
async function refreshMembershipIfVisible() {
  if (parseAdminRoute() !== "membresias") return;
  await loadMembershipOverview();
  renderMembershipSection();
}

async function handleMembershipProviderChange() {
  state.selectedProviderId = document.getElementById("adminMembershipProviderSelect")?.value || null;
  state.membership.openClientId = null;
  state.membership.movements = [];
  state.membership.needsManualLoad = false;

  renderMembershipSection();
  await loadMembershipOverview();
  renderMembershipSection();
}

function handleMembershipFormProviderChange() {
  state.membership.formProviderId = document.getElementById("adminMembershipFormProviderSelect")?.value || null;
  state.membership.formClientId = getClientsForMembershipForm()[0]?.id ?? null;
  renderMembershipSelectors();
}

function handleMembershipFormClientChange() {
  state.membership.formClientId = document.getElementById("adminMembershipClientSelect")?.value || null;
  renderMembershipFormWarning();
}

function openMembershipModal({ clientId = null, renew = false } = {}) {
  const client = getClientById(clientId);
  if (client) {
    state.membership.formProviderId = client.providerEntityId;
    state.membership.formClientId = client.id;
  } else if (!isGuid(state.membership.formProviderId)) {
    state.membership.formProviderId = state.selectedProviderId;
    state.membership.formClientId = getClientsForMembershipForm()[0]?.id ?? null;
  }

  renderMembershipSelectors();

  const current = clientId ? state.membership.byClientId.get(clientId) : null;
  if (renew && current && !current.failed) {
    prefillMembershipRenewal(current);
  } else {
    setMembershipFeedback(client ? `Nueva membresia para ${client.fullName}.` : "Elegi el cliente y completa el plan.");
  }

  setAdminModalOpen("admin-membership-modal", true);
}

async function openMembershipMovements(clientId) {
  state.membership.openClientId = clientId;
  state.membership.movements = [];
  renderMembershipMovements();

  await loadClientMovements(clientId);
  if (state.membership.openClientId !== clientId) return;

  renderMembershipMovements();
  document.getElementById("adminMembershipMovementsPanel")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function handleCreateMembership(event) {
  event.preventDefault();

  const clientId = state.membership.formClientId;
  if (!isGuid(clientId)) {
    throw new Error("Selecciona un cliente valido antes de crear la membresia.");
  }

  const planName = document.getElementById("adminMembershipPlanName")?.value?.trim() ?? "";
  const totalCredits = Number(document.getElementById("adminMembershipTotalCredits")?.value || 0);
  const validFrom = document.getElementById("adminMembershipValidFrom")?.value ?? "";
  const validTo = document.getElementById("adminMembershipValidTo")?.value ?? "";

  if (!planName) throw new Error("Ingresa un nombre de plan valido.");
  if (!Number.isInteger(totalCredits) || totalCredits <= 0) throw new Error("Ingresa una cantidad valida de creditos.");
  if (!validFrom || !validTo) throw new Error("Completa el rango de vigencia.");
  if (validTo < validFrom) throw new Error("La vigencia hasta no puede ser anterior al inicio.");

  const submitButton = document.getElementById("adminMembershipSubmitBtn");
  submitButton?.setAttribute("disabled", "disabled");
  setMembershipFeedback("Creando membresia...", "");

  try {
    await FrontGateway.order.createMembership({
      clientId,
      planName,
      totalCredits,
      validFromUtc: argentinaDateTimeToUtcIso(validFrom, "00:00"),
      validToUtc: argentinaDateTimeToUtcIso(validTo, "23:59")
    });

    state.membership.byClientId.set(clientId, await fetchClientMembership(clientId));
    renderMembershipSection();
    renderMembershipFormWarning();

    // El modal se reutiliza: sin limpiar, la proxima alta arranca con el plan anterior.
    document.getElementById("adminMembershipPlanName").value = "";
    document.getElementById("adminMembershipTotalCredits").value = "12";
    document.getElementById("adminMembershipValidFrom").value = "";
    document.getElementById("adminMembershipValidTo").value = "";
    setDefaultMembershipDates();

    setMembershipFeedback("Membresia creada correctamente.", "success");
    setAdminModalOpen("admin-membership-modal", false);
    showAppFeedback("La membresia quedo registrada y ya puede consultarse desde cliente/admin.", {
      type: "success",
      title: "Membresia creada"
    });
  } finally {
    submitButton?.removeAttribute("disabled");
  }
}

function renderAll() {
  setWelcomeMessage();
  renderSummaryCards();
  renderDashboardPendingRequests();
  renderRequestsList();
  renderMembershipSelectors();
  renderProviderSelectors();
  renderMembershipSection();
  renderOperationsSummary();
  renderOrdersList();
  renderReservationsList();
  renderProvidersList();
  renderUsersStats();
  renderUsersList();
}

function setDefaultMembershipDates() {
  const validFromInput = document.getElementById("adminMembershipValidFrom");
  const validToInput = document.getElementById("adminMembershipValidTo");
  if (validFromInput && !validFromInput.value) validFromInput.value = getArgentinaDateInputValue();
  if (validToInput && !validToInput.value) validToInput.value = shiftArgentinaDate(getArgentinaDateInputValue(), 30);
}

function registerEvents() {
  document.getElementById("refreshAdminDashboard")?.addEventListener("click", () => {
    refreshAdminData().catch((error) => {
      showAppFeedback(getErrorMessage(error, "No se pudo actualizar el panel."), {
        type: "error",
        title: "Actualizacion incompleta"
      });
    });
  });

  document.getElementById("refreshAdminRequests")?.addEventListener("click", () => {
    refreshAdminData().catch((error) => {
      showAppFeedback(getErrorMessage(error, "No se pudieron actualizar las solicitudes."), {
        type: "error",
        title: "Actualizacion incompleta"
      });
    });
  });

  document.getElementById("refreshAdminMemberships")?.addEventListener("click", () => {
    loadAdminSnapshot()
      .then(() => loadMembershipOverview({ force: true }))
      .then(loadOperationsSnapshot)
      .then(renderAll)
      .catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudo actualizar la vista de membresias."), {
          type: "error",
          title: "Actualizacion incompleta"
        });
      });
  });

  document.getElementById("refreshAdminProviders")?.addEventListener("click", () => {
    refreshAdminData().catch((error) => {
      showAppFeedback(getErrorMessage(error, "No se pudo actualizar la vista de proveedores."), {
        type: "error",
        title: "Actualizacion incompleta"
      });
    });
  });

  document.getElementById("refreshAdminOperations")?.addEventListener("click", () => {
    loadOperationsSnapshot()
      .then(() => {
        renderOperationsSummary();
        renderOrdersList();
        renderReservationsList();
      })
      .catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudo actualizar la supervision global."), {
          type: "error",
          title: "Actualizacion incompleta"
        });
      });
  });

  document.getElementById("refreshAdminUsers")?.addEventListener("click", () => {
    refreshAdminData().catch((error) => {
      showAppFeedback(getErrorMessage(error, "No se pudo actualizar la vista de usuarios."), {
        type: "error",
        title: "Actualizacion incompleta"
      });
    });
  });

  document.getElementById("adminMembershipProviderSelect")?.addEventListener("change", () => {
    handleMembershipProviderChange().catch((error) => {
      showAppFeedback(getErrorMessage(error, "No se pudo cargar el panorama de la entidad."), {
        type: "error",
        title: "Membresias"
      });
    });
  });

  document.getElementById("adminMembershipFormProviderSelect")?.addEventListener("change", handleMembershipFormProviderChange);
  document.getElementById("adminMembershipClientSelect")?.addEventListener("change", handleMembershipFormClientChange);

  document.getElementById("adminMembershipSearch")?.addEventListener("input", (event) => {
    state.membership.search = event.target.value || "";
    renderMembershipOverview();
  });

  document.getElementById("adminMembershipFilters")?.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-membership-filter]");
    if (!chip) return;
    state.membership.filter = chip.dataset.membershipFilter;
    renderMembershipFilters();
    renderMembershipOverview();
  });

  document.getElementById("adminOpenMembershipModal")?.addEventListener("click", () => openMembershipModal());

  document.getElementById("adminMembershipMovementsClose")?.addEventListener("click", () => {
    state.membership.openClientId = null;
    state.membership.movements = [];
    renderMembershipMovements();
  });

  document.getElementById("adminMembershipOverview")?.addEventListener("click", (event) => {
    const loadButton = event.target.closest("#adminMembershipLoadOverview");
    if (loadButton) {
      loadMembershipOverview({ force: true })
        .then(renderMembershipSection)
        .catch((error) => {
          showAppFeedback(getErrorMessage(error, "No se pudo cargar el panorama."), { type: "error", title: "Membresias" });
        });
      return;
    }

    const createButton = event.target.closest("[data-membership-create]");
    if (createButton) {
      openMembershipModal({ clientId: createButton.dataset.membershipCreate });
      return;
    }

    const renewButton = event.target.closest("[data-membership-renew]");
    if (renewButton) {
      openMembershipModal({ clientId: renewButton.dataset.membershipRenew, renew: true });
      return;
    }

    const movementsButton = event.target.closest("[data-membership-movements]");
    if (movementsButton) {
      openMembershipMovements(movementsButton.dataset.membershipMovements).catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudieron cargar los movimientos."), { type: "error", title: "Membresias" });
      });
    }
  });

  document.getElementById("adminMembershipForm")?.addEventListener("submit", (event) => {
    handleCreateMembership(event).catch((error) => {
      setMembershipFeedback(getErrorMessage(error, "No se pudo crear la membresia."), "error");
    });
  });

  document.getElementById("adminProviderForm")?.addEventListener("submit", (event) => {
    createProvider(event).catch((error) => {
      setProviderFeedback(getErrorMessage(error, "No se pudo crear la entidad."), "error");
    });
  });

  document.getElementById("adminProviderAdminForm")?.addEventListener("submit", (event) => {
    createProviderAdmin(event).catch((error) => {
      setProviderAdminFeedback(getErrorMessage(error, "No se pudo crear el admin de entidad."), "error");
    });
  });

  document.getElementById("adminOperationsFilterForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    state.operations.filters.providerEntityId = document.getElementById("adminOperationsProviderFilter")?.value || "";
    state.operations.filters.orderStatus = document.getElementById("adminOperationsOrderStatusFilter")?.value || "";
    state.operations.filters.reservationStatus = document.getElementById("adminOperationsReservationStatusFilter")?.value || "";

    loadOperationsSnapshot()
      .then(() => {
        renderOperationsSummary();
        renderOrdersList();
        renderReservationsList();
      })
      .catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudieron aplicar los filtros operativos."), {
          type: "error",
          title: "Filtros no aplicados"
        });
      });
  });

  document.getElementById("adminOperationsClearFilters")?.addEventListener("click", () => {
    state.operations.filters = {
      providerEntityId: "",
      orderStatus: "",
      reservationStatus: ""
    };

    document.getElementById("adminOperationsProviderFilter").value = "";
    document.getElementById("adminOperationsOrderStatusFilter").value = "";
    document.getElementById("adminOperationsReservationStatusFilter").value = "";

    loadOperationsSnapshot()
      .then(() => {
        renderProviderSelectors();
        renderOperationsSummary();
        renderOrdersList();
        renderReservationsList();
      })
      .catch((error) => {
        showAppFeedback(getErrorMessage(error, "No se pudieron limpiar los filtros operativos."), {
          type: "error",
          title: "Filtros no reiniciados"
        });
      });
  });

  document.getElementById("adminUsersRoleFilter")?.addEventListener("change", renderUsersList);
  document.getElementById("adminUsersSearch")?.addEventListener("input", renderUsersList);
}

async function bootstrap() {
  state.user = await ensureAuthorizedPage(["Admin"]);
  setupUserMenu();
  setupNavigation();
  setupAdminModals();
  setDefaultMembershipDates();
  registerEvents();

  await loadAdminSnapshot();
  invalidateMembershipOverview();
  await loadOperationsSnapshot();
  renderAll();

  isAdminBootstrapComplete = true;
  if (!window.location.hash) {
    updateAdminRoute("inicio", { replace: true });
  }
  await handleAdminRouteChange();
}

bootstrap().catch((error) => {
  if (isAuthRedirectError(error)) return;
  console.error(error);
  showAppFeedback(getErrorMessage(error, "Verifica AuthMS, DirectoryMS y OrderMS."), {
    type: "error",
    title: "No pudimos iniciar el panel administrador",
    timeout: 0
  });
});
