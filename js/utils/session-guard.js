import { ensureValidToken } from "../api.js";

const ROLE_TARGETS = {
  provideradmin: "provider.html",
  technician: "fumigator.html",
  client: "client.html",
  admin: "admin.html"
};

export function getRoleLandingPage(role, fallback = "login.html") {
  return ROLE_TARGETS[normalizeRole(role)] || fallback;
}

function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64).split("").map((character) => `%${(`00${character.charCodeAt(0).toString(16)}`).slice(-2)}`).join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function getClaimValue(payload, keys) {
  if (!payload) return null;

  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value) && value.length > 0) return value[0];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }

  return null;
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("user");
}

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function buildRedirectError(message) {
  const error = new Error(message);
  error.authRedirect = true;
  return error;
}

export function isAuthRedirectError(error) {
  return Boolean(error?.authRedirect);
}

export function getSessionContext() {
  const token = localStorage.getItem("token");
  const storedUser = getStoredUser();
  const payload = token ? parseJwt(token) : null;

  const role = storedUser?.role
    || storedUser?.Role
    || getClaimValue(payload, [
      "role",
      "Role",
      "roles",
      "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"
    ])
    || "";

  const userId = storedUser?.userId
    || storedUser?.UserId
    || getClaimValue(payload, [
      "sub",
      "userId",
      "UserId",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"
    ]);

  return {
    token,
    role,
    normalizedRole: normalizeRole(role),
    userId: typeof userId === "string" ? userId.trim() : null,
    email: storedUser?.email
      || storedUser?.Email
      || getClaimValue(payload, [
        "email",
        "Email",
        "userEmail",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
      ])
      || "",
    firstName: storedUser?.firstName
      || storedUser?.FirstName
      || getClaimValue(payload, [
        "given_name",
        "firstName",
        "FirstName",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"
      ])
      || "",
    lastName: storedUser?.lastName
      || storedUser?.LastName
      || getClaimValue(payload, [
        "family_name",
        "lastName",
        "LastName",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"
      ])
      || ""
  };
}

function redirectTo(path) {
  window.location.replace(path);
}

export async function ensureAuthorizedPage(allowedRoles, { loginPath = "login.html" } = {}) {
  try {
    await ensureValidToken();
  } catch {
    clearSession();
    redirectTo(loginPath);
    throw buildRedirectError("La sesion no es valida.");
  }

  const context = getSessionContext();
  if (!context.token || !context.normalizedRole) {
    clearSession();
    redirectTo(loginPath);
    throw buildRedirectError("No hay una sesion valida para esta vista.");
  }

  const normalizedAllowedRoles = allowedRoles.map((role) => normalizeRole(role));
  if (!normalizedAllowedRoles.includes(context.normalizedRole)) {
    const target = getRoleLandingPage(context.normalizedRole, loginPath);
    redirectTo(target);
    throw buildRedirectError(`La sesion actual no corresponde a esta vista (${context.role}).`);
  }

  return context;
}
