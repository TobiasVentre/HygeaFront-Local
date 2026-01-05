/**
 * API Gateway FrontEnd
 * --------------------
 * Capa centralizada para el consumo de microservicios.
 * - Maneja headers, autenticación y tokens JWT
 * - Renueva accessToken automáticamente usando refreshToken
 * - Implementa keep-alive para evitar expiración por inactividad
 * - Reintenta requests ante 401 de forma transparente
 * - Permite fallback entre múltiples base URLs por servicio
 *
 * Este archivo asume que el AuthMS expone un endpoint de refresh
 * y que los tokens se almacenan en localStorage.
 */


const defaultHostnames = [window.location.hostname || "localhost", "localhost", "127.0.0.1"];


const DIRECTORY_API_BASE_URLS = [
  "http://localhost:9000/directory/api"
];


const AUTH_API_BASE_URLS = [
  "http://localhost:5093/api/v1"
];



const SCHEDULING_API_BASE_URLS = [
  `http://127.0.0.1:8083/api/v1`,  // Docker con /v1 - explícito para desarrollo local
  `http://localhost:8083/api/v1`,  // Docker con /v1 - localhost
  ...defaultHostnames.flatMap(host => [
    `http://${host}:8083/api/v1`,  // Docker con /v1
    `http://${host}:34372/api/v1`, // IIS Express con /v1
    `http://${host}:5140/api/v1`   // Development con /v1
  ])
].filter((value, index, self) => self.indexOf(value) === index);

// ClinicalMS: puertos Docker (8084) e IIS Express (27124), Development (5073)
const CLINICAL_API_BASE_URLS = [
  "http://localhost:9000/clinical/api"
];

// Hl7Gateway: puerto 5000 (API REST)
const HL7GATEWAY_API_BASE_URLS = [
  "http://localhost:9000/hl7gateway/api/v1"
];

// Flag para evitar múltiples intentos de refresh simultáneos
let isRefreshing = false;
let refreshSubscribers = [];
let keepAliveInterval = null;

// Mantener la sesión activa haciendo ping cada 10 minutos
function startKeepAlive() {
  // Limpiar intervalo previo si existe
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }

  // NO ejecutar inmediatamente, esperar el primer intervalo
  // Hacer ping cada 10 minutos (antes del timeout de 15 minutos del backend)
  keepAliveInterval = setInterval(async () => {
    const token = localStorage.getItem("token");
    const refreshToken = localStorage.getItem("refreshToken");
    
    if (token && refreshToken) {
      console.log("🔄 Keep-alive: renovando token para evitar timeout de inactividad");
      try {
        await refreshAccessToken();
      } catch (error) {
        console.error("❌ Error en keep-alive:", error);
        console.warn("⚠️ Sesión expirada, redirigiendo al login...");
        stopKeepAlive();
        
        // Limpiar tokens y redirigir
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("user");
        
        if (window.location.pathname !== '/login.html' && window.location.pathname !== '/') {
          window.location.href = "/login.html";
        }
      }
    } else {
      stopKeepAlive();
    }
  }, 10 * 60 * 1000); // 10 minutos
  
  console.log("✅ Keep-alive programado para ejecutarse cada 10 minutos");
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

function onRefreshed(token) {
  refreshSubscribers.forEach(callback => callback(token));
  refreshSubscribers = [];
}

function subscribeTokenRefresh(callback) {
  refreshSubscribers.push(callback);
}

function buildHeaders() {
  const headers = { "Content-Type": "application/json" };
  try {
    const token = localStorage.getItem("token");
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  } catch (error) {
    console.warn("No se pudo acceder al token almacenado", error);
  }
  return headers;
}

function isTokenExpired(token) {
  if (!token) return true;
  
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const exp = payload.exp;
    
    if (!exp) return false; // Si no tiene exp, asumimos que no está expirado
    
    const now = Math.floor(Date.now() / 1000);
    const isExpired = exp < now;
    
    if (isExpired) {
      console.warn("⚠️ Token expirado detectado", {
        expira: new Date(exp * 1000).toLocaleString(),
        ahora: new Date(now * 1000).toLocaleString()
      });
    }
    
    return isExpired;
  } catch (e) {
    console.error("Error al verificar expiración del token:", e);
    return true; // Si no se puede parsear, asumimos que está expirado
  }
}

async function ensureValidToken() {
  const token = localStorage.getItem("token");
  const refreshToken = localStorage.getItem("refreshToken");
  
  // Si no hay tokens, no hacer nada
  if (!token || !refreshToken) {
    return null;
  }
  
  // Si el token está expirado, intentar renovarlo AHORA
  if (isTokenExpired(token)) {
    console.log("🔄 Token expirado detectado al inicio, renovando...");
    try {
      const newToken = await refreshAccessToken();
      return newToken;
    } catch (error) {
      console.error("❌ No se pudo renovar el token inicial:", error);
      
      // Limpiar y redirigir
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
      
      if (window.location.pathname !== '/login.html' && window.location.pathname !== '/') {
        window.location.href = "/login.html";
      }
      
      throw new Error("Sesión expirada");
    }
  }
  
  return token;
}

function fetchWithTimeout(resource, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(resource, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("refreshToken");
  const expiredAccessToken = localStorage.getItem("token");
  
  if (!refreshToken) {
    throw new Error("No hay refresh token disponible");
  }
  
  if (!expiredAccessToken) {
    throw new Error("No hay access token para renovar");
  }

  console.log("🔄 Intentando renovar el token...");
  console.log("🔑 Refresh token:", refreshToken.substring(0, 30) + "...");
  console.log("🔑 Access token expirado:", expiredAccessToken.substring(0, 30) + "...");

  for (const baseUrl of AUTH_API_BASE_URLS) {
    try {
      console.log("📡 Probando refresh en:", baseUrl);
      
      const response = await fetchWithTimeout(
        `${baseUrl}/Auth/RefreshToken`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            expiredAccessToken,
            refreshToken 
          })
        },
        7000
      );

      console.log("📥 Respuesta del refresh:", response.status, response.statusText);

      if (response.ok) {
        const data = await response.json();
        console.log("📦 Datos recibidos:", data);
        
        if (data.accessToken) {
          localStorage.setItem("token", data.accessToken);
          console.log("💾 Nuevo access token guardado:", data.accessToken.substring(0, 30) + "...");
          
          if (data.refreshToken) {
            localStorage.setItem("refreshToken", data.refreshToken);
            console.log("💾 Nuevo refresh token guardado");
          }
          
          console.log("✅ Token renovado exitosamente");
          return data.accessToken;
        } else {
          console.warn("⚠️ La respuesta no contiene accessToken");
        }
      } else {
        const errorText = await response.text().catch(() => 'No se pudo leer el error');
        console.error("❌ Error en refresh:", response.status, errorText);
      }
    } catch (err) {
      console.warn(`⚠️ Error al intentar refresh con ${baseUrl}:`, err.message);
      continue;
    }
  }
  
  throw new Error("No se pudo renovar el token");
}

async function apiRequestFirstOk(baseUrls, endpoint, method = "GET", body = null, serviceName = "servicio", retryWithRefresh = true) {
  const options = { method, headers: buildHeaders() };
  if (body) options.body = JSON.stringify(body);

  let lastError;
  for (const baseUrl of baseUrls) {
    // Asegurar que el endpoint no empiece con / para evitar doble slash
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
    const fullUrl = `${baseUrl}/${cleanEndpoint}`;
    
    try {
      console.log(`🔍 [${serviceName}] Intentando: ${method} ${fullUrl}`);
      const response = await fetchWithTimeout(fullUrl, options, 10000);
      
      // Log de respuesta exitosa
      if (response.ok) {
        console.log(`✅ [${serviceName}] Respuesta exitosa: ${response.status} ${fullUrl}`);
      }
      
      // Si es 401 y no es una petición de auth, intentar refresh
      if (response.status === 401 && retryWithRefresh && !endpoint.includes('Auth/')) {
        console.warn("⚠️ Token expirado (401), intentando renovar...");
        console.log('🔍 Endpoint que falló:', endpoint);
        console.log('🔍 Base URL:', baseUrl);
        
        // Si ya se está refrescando, esperar
        if (isRefreshing) {
          console.log('⏳ Esperando a que termine el refresh en curso...');
          return new Promise((resolve, reject) => {
            subscribeTokenRefresh(async (token) => {
              try {
                console.log('🔄 Reintentando con token recién renovado...');
                // Reintentar con el nuevo token - buildHeaders() lo tomará automáticamente
                const retryResponse = await fetchWithTimeout(fullUrl, { 
                  method, 
                  headers: buildHeaders(),
                  body: body ? JSON.stringify(body) : undefined
                }, 10000);
                
                if (!retryResponse.ok) {
                  throw new Error(`Error ${retryResponse.status}: ${retryResponse.statusText}`);
                }
                
                resolve(await retryResponse.json().catch(() => ({ ok: true })));
              } catch (err) {
                reject(err);
              }
            });
          });
        }

        isRefreshing = true;
        
        try {
          const newToken = await refreshAccessToken();
          isRefreshing = false;
          onRefreshed(newToken);
          
          // IMPORTANTE: Reconstruir headers completamente con el nuevo token
          // NO reutilizar el objeto options anterior
          console.log('🔄 Reintentando petición con token renovado...');
          return apiRequestFirstOk(baseUrls, endpoint, method, body, serviceName, false);
        } catch (refreshError) {
          isRefreshing = false;
          console.error("❌ No se pudo renovar el token:", refreshError);
          
          // Limpiar tokens y redirigir al login
          localStorage.removeItem("token");
          localStorage.removeItem("refreshToken");
          localStorage.removeItem("user");
          
          if (window.location.pathname !== '/login.html' && window.location.pathname !== '/') {
            window.location.href = "/login.html";
          }
          
          throw new Error("Sesión expirada. Por favor, inicia sesión nuevamente.");
        }
      }
      
      if (!response.ok) {
        let message = "Error en la solicitud";
        let errorDetails = null;
        let errorBody = null;
        try { 
          errorBody = await response.text();
          console.error(`❌ [${serviceName}] Error response body:`, errorBody);
          try {
            const errorData = JSON.parse(errorBody);
            message = errorData.message || errorData.title || errorData.error || message;
            errorDetails = errorData.errors || errorData.details || null;
          } catch (_) {
            // Si no es JSON, usar el texto como mensaje
            message = errorBody || message;
          }
        } catch (_) {}
        
        console.error(`❌ [${serviceName}] Error ${response.status} ${response.statusText}:`, {
          status: response.status,
          statusText: response.statusText,
          message: message,
          details: errorDetails,
          body: errorBody
        });
        
        const error = new Error(message);
        error.status = response.status;
        error.statusText = response.statusText;
        error.details = errorDetails;
        error.body = errorBody;
        throw error;
      }
      
      try { 
        return await response.json(); 
      } catch (_) { 
        return { ok: true }; 
      }
    } catch (err) {
      lastError = err;
      console.error(`❌ [${serviceName}] Error de red en ${fullUrl}:`, {
        message: err.message || err,
        name: err.name,
        status: err.status,
        statusText: err.statusText,
        stack: err.stack,
        error: err
      });
      
      // Si es un error de cliente (4xx) que no es 401, no intentar siguiente URL
      if (err.status && err.status >= 400 && err.status < 500 && err.status !== 401) {
        throw err;
      }
    }
  }
  throw lastError || new Error(`No se pudo contactar al servicio ${serviceName}`);
}

export const Api = {
  get: (endpoint) => apiRequestFirstOk(DIRECTORY_API_BASE_URLS, endpoint, "GET", null, "DirectoryMS"),
  post: (endpoint, data) => apiRequestFirstOk(DIRECTORY_API_BASE_URLS, endpoint, "POST", data, "DirectoryMS"),
  put: (endpoint, data) => apiRequestFirstOk(DIRECTORY_API_BASE_URLS, endpoint, "PUT", data, "DirectoryMS"),
  patch: (endpoint, data) => apiRequestFirstOk(DIRECTORY_API_BASE_URLS, endpoint, "PATCH", data, "DirectoryMS"),
};

export const ApiAuth = {
  get: (endpoint) => apiRequestFirstOk(AUTH_API_BASE_URLS, endpoint, "GET", null, "AuthMS"),
  post: (endpoint, data) => apiRequestFirstOk(AUTH_API_BASE_URLS, endpoint, "POST", data, "AuthMS"),
  put: (endpoint, data) => apiRequestFirstOk(AUTH_API_BASE_URLS, endpoint, "PUT", data, "AuthMS"),
  patch: (endpoint, data) => apiRequestFirstOk(AUTH_API_BASE_URLS, endpoint, "PATCH", data, "AuthMS"),
};

export const ApiScheduling = {
  get: (endpoint) => apiRequestFirstOk(SCHEDULING_API_BASE_URLS, endpoint, "GET", null, "SchedulingMS"),
  post: (endpoint, data) => apiRequestFirstOk(SCHEDULING_API_BASE_URLS, endpoint, "POST", data, "SchedulingMS"),
  put: (endpoint, data) => apiRequestFirstOk(SCHEDULING_API_BASE_URLS, endpoint, "PUT", data, "SchedulingMS"),
  patch: (endpoint, data) => apiRequestFirstOk(SCHEDULING_API_BASE_URLS, endpoint, "PATCH", data, "SchedulingMS"),
  delete: (endpoint) => apiRequestFirstOk(SCHEDULING_API_BASE_URLS, endpoint, "DELETE", null, "SchedulingMS"),
};

export const ApiClinical = {
  get: (endpoint) => apiRequestFirstOk(CLINICAL_API_BASE_URLS, endpoint, "GET", null, "ClinicalMS"),
  post: (endpoint, data) => apiRequestFirstOk(CLINICAL_API_BASE_URLS, endpoint, "POST", data, "ClinicalMS"),
  put: (endpoint, data) => apiRequestFirstOk(CLINICAL_API_BASE_URLS, endpoint, "PUT", data, "ClinicalMS"),
  patch: (endpoint, data) => apiRequestFirstOk(CLINICAL_API_BASE_URLS, endpoint, "PATCH", data, "ClinicalMS"),
  delete: (endpoint) => apiRequestFirstOk(CLINICAL_API_BASE_URLS, endpoint, "DELETE", null, "ClinicalMS"),
};

export const ApiHl7Gateway = {
  get: (endpoint) => apiRequestFirstOk(HL7GATEWAY_API_BASE_URLS, endpoint, "GET", null, "Hl7Gateway"),
  post: (endpoint, data) => apiRequestFirstOk(HL7GATEWAY_API_BASE_URLS, endpoint, "POST", data, "Hl7Gateway"),
  download: async (endpoint, filename) => {
    const headers = buildHeaders();
    delete headers["Content-Type"];
    
    for (const baseUrl of HL7GATEWAY_API_BASE_URLS) {
      try {
        const response = await fetchWithTimeout(`${baseUrl}/${endpoint}`, { 
          method: "GET", 
          headers 
        }, 7000);
        
        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `resumen-hl7-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        return;
      } catch (err) {
        continue;
      }
    }
    throw new Error("No se pudo contactar al Hl7Gateway");
  }
};

// Exportar funciones de gestión de tokens para uso en módulos ES6
export { startKeepAlive, stopKeepAlive, ensureValidToken, refreshAccessToken };

// Exponer global para scripts no módulo
if (typeof window !== "undefined") {
  window.Api = Api;
  window.ApiAuth = ApiAuth;
  window.ApiScheduling = ApiScheduling;
  window.ApiClinical = ApiClinical;
  window.ApiHl7Gateway = ApiHl7Gateway;
  window.startKeepAlive = startKeepAlive;
  window.stopKeepAlive = stopKeepAlive;
  window.ensureValidToken = ensureValidToken;
  
  // Auto-iniciar keep-alive si hay tokens VÁLIDOS
  const token = localStorage.getItem("token");
  const refreshToken = localStorage.getItem("refreshToken");
  
  if (token && refreshToken) {
    // Verificar si el token está expirado antes de iniciar keep-alive
    if (!isTokenExpired(token)) {
      startKeepAlive();
      console.log("✅ Keep-alive iniciado automáticamente");
    } else {
      console.warn("⚠️ Token expirado detectado, intentando renovar...");
      ensureValidToken().catch(() => {
        console.error("❌ No se pudo renovar el token, por favor inicia sesión");
      });
    }
  }
}