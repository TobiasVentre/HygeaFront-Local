/**
 * Login Controller (FrontEnd)
 * ---------------------------
 * Este archivo gestiona el flujo completo de inicio de sesión:
 * - Manejo del formulario y validaciones básicas
 * - Llamada al Auth Microservice para autenticar credenciales
 * - Persistencia de access/refresh tokens
 * - Decodificación del JWT para obtener datos del usuario
 * - Inicialización del estado global y del keep-alive de sesión
 * - Redirección según rol
 *
 * Requiere:
 * - AuthMS operativo que retorne accessToken (JWT) y refreshToken
 * - JWT con claims de rol, email e identificador de usuario
 * - api.js configurado para refresh de tokens
 */

import { login as loginApi } from "../apis/authms.js";
import { setUser } from "../state.js";

const form = document.getElementById("loginForm");
const button = document.getElementById("loginButton");
const feedback = document.getElementById("loginFeedback");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const goRegisterBtn = document.getElementById("goRegisterBtn");

const originalButtonContent = button ? button.innerHTML : "";

const showFeedback = (message, type = "error") => {
  if (!feedback) return;
  if (!message) {
    feedback.classList.remove("visible", "error", "success");
    feedback.textContent = "";
    return;
  }
  feedback.textContent = message;
  feedback.classList.remove("error", "success");
  feedback.classList.add(type === "success" ? "success" : "error", "visible");
};

const toggleLoading = (isLoading) => {
  if (!button) return;
  if (isLoading) {
    button.disabled = true;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Iniciando sesión...';
  } else {
    button.disabled = false;
    button.innerHTML = originalButtonContent || "Iniciar Sesión";
  }
};

const parseJwt = (token) => {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64).split("").map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("No se pudo parsear el token JWT", error);
    return null;
  }
};

const getClaimValue = (payload, keys) => {
  if (!payload) return null;
  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value) && value.length > 0) return value[0];
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
};

// Restaurar color del icono en los campos
document.querySelectorAll(".form-group input").forEach((input) => {
  const icon = input.parentElement?.querySelector("i");
  if (!icon) return;
  input.addEventListener("focus", () => { icon.style.color = "#2563eb"; });
  input.addEventListener("blur", () => { if (!input.value) icon.style.color = "#6b7280"; });
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showFeedback("Por favor, completa el correo y la contraseña.");
    return;
  }

  showFeedback("");
  toggleLoading(true);

  try {
    const response = await loginApi(email, password);

    if (!response?.accessToken) {
      throw new Error(response?.message || "No se recibió el token de acceso.");
    }

    // Guardar tokens PRIMERO
    localStorage.setItem("token", response.accessToken);
    if (response.refreshToken) {
      localStorage.setItem("refreshToken", response.refreshToken);
    }

    const payload = parseJwt(response.accessToken);

    const role = getClaimValue(payload, [
      "role", "Role", "roles",
      "http://schemas.microsoft.com/ws/2008/06/identity/claims/role",
    ]);

    const resolvedEmail = getClaimValue(payload, [
      "email", "Email", "userEmail",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    ]) || email;

    const userId = getClaimValue(payload, [
      "sub", "userId", "UserId",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
    ]);

    // Extraer nombre del JWT si está disponible
    const firstName = getClaimValue(payload, [
      "given_name", "firstName", "FirstName",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
    ]) || "";

    const lastName = getClaimValue(payload, [
      "family_name", "lastName", "LastName", 
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
    ]) || "";

    // Crear usuario con datos del JWT (SIN llamar al backend adicional)
    const userInfo = {
      email: resolvedEmail,
      userId: parseInt(userId),
      role,
      firstName,
      lastName,
    };

    console.log("✅ Login exitoso, usuario:", userInfo);

    // Guardar usuario en el state
    setUser(userInfo, response.accessToken);

    // Iniciar keep-alive usando la función global (más seguro)
    try {
      const { startKeepAlive } = await import('../api.js');
      startKeepAlive();
      console.log("✅ Keep-alive iniciado");
    } catch (error) {
      console.warn("⚠️ No se pudo iniciar keep-alive:", error);
    }

    // Redirigir según rol
    let target = "login.html"; // fallback seguro

    switch (role?.toLowerCase()) {
      case "fumigator":
        target = "fumigator.html";
        break;
      case "client":
        target = "client.html";
        break;
      case "admin":
        target = "admin.html"; // o futura admin.html
        break;
      default:
        console.warn("Rol desconocido, redirigiendo a login:", role);
    }
    window.location.href = target;

  } catch (error) {
    console.error("Error al iniciar sesión:", error);
    showFeedback(error.message || "Error al iniciar sesión. Intenta nuevamente.");
  } finally {
    toggleLoading(false);
  }
});

goRegisterBtn?.addEventListener("click", () => {
  window.location.href = "registro.html";
});