/**
 * API Gateway FrontEnd
 * --------------------
 * Capa centralizada para el consumo de microservicios.
 * - Maneja headers, autenticaciÃ³n y tokens JWT
 * - Renueva accessToken automÃ¡ticamente usando refreshToken
 * - Implementa keep-alive para evitar expiraciÃ³n por inactividad
 * - Reintenta requests ante 401 de forma transparente
 * - Permite fallback entre mÃºltiples base URLs por servicio
 *
 * Este archivo asume que el AuthMS expone un endpoint de refresh
 * y que los tokens se almacenan en localStorage.
 */


import { SERVICE_BASE_URLS } from "./config/services.config.js";

const DIRECTORY_API_BASE_URLS = SERVICE_BASE_URLS.directory;
const AUTH_API_BASE_URLS = SERVICE_BASE_URLS.auth;
const CATALOG_API_BASE_URLS = SERVICE_BASE_URLS.catalog;
const SCHEDULING_API_BASE_URLS = SERVICE_BASE_URLS.scheduling;
const ORDER_API_BASE_URLS = SERVICE_BASE_URLS.order;
const CLINICAL_API_BASE_URLS = SERVICE_BASE_URLS.clinical;
const HL7GATEWAY_API_BASE_URLS = SERVICE_BASE_URLS.hl7Gateway;

// Flag para evitar mÃºltiples intentos de refresh simultÃ¡neos
let isRefreshing = false;
let refreshSubscribers = [];
let keepAliveInterval = null;

// Mantener la sesiÃ³n activa haciendo ping cada 10 minutos
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
      console.log("ðŸ”„ Keep-alive: renovando token para evitar timeout de inactividad");
      try {
        await refreshAccessToken();
      } catch (error) {
        console.error("âŒ Error en keep-alive:", error);
        console.warn("âš ï¸ SesiÃ³n expirada, redirigiendo al login...");
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
  
  console.log("âœ… Keep-alive programado para ejecutarse cada 10 minutos");
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
    
    if (!exp) return false; // Si no tiene exp, asumimos que no estÃ¡ expirado
    
    const now = Math.floor(Date.now() / 1000);
    const isExpired = exp < now;
    
    if (isExpired) {
      console.warn("âš ï¸ Token expirado detectado", {
        expira: new Date(exp * 1000).toLocaleString(),
        ahora: new Date(now * 1000).toLocaleString()
      });
    }
    
    return isExpired;
  } catch (e) {
    console.error("Error al verificar expiraciÃ³n del token:", e);
    return true; // Si no se puede parsear, asumimos que estÃ¡ expirado
  }
}

async function ensureValidToken() {
  const token = localStorage.getItem("token");
  const refreshToken = localStorage.getItem("refreshToken");
  
  // Si no hay access token, no hay sesion valida que revisar
  if (!token) {
    return null;
  }

  // Si el access token sigue vigente, permitir continuar incluso si falta refresh token
  if (!isTokenExpired(token)) {
    return token;
  }

  // Si el token expiro y no hay refresh token, limpiar la sesion
  if (!refreshToken) {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");

    if (window.location.pathname !== '/login.html' && window.location.pathname !== '/') {
      window.location.href = "/login.html";
    }

    throw new Error("Sesion expirada");
  }
  
  console.log("ðŸ”„ Token expirado detectado al inicio, renovando...");
  try {
    const newToken = await refreshAccessToken();
    return newToken;
  } catch (error) {
    console.error("âŒ No se pudo renovar el token inicial:", error);
    
    // Limpiar y redirigir
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    
    if (window.location.pathname !== '/login.html' && window.location.pathname !== '/') {
      window.location.href = "/login.html";
    }
    
    throw new Error("SesiÃ³n expirada");
  }
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

  console.log("ðŸ”„ Intentando renovar el token...");
  console.log("ðŸ”‘ Refresh token:", refreshToken.substring(0, 30) + "...");
  console.log("ðŸ”‘ Access token expirado:", expiredAccessToken.substring(0, 30) + "...");

  for (const baseUrl of AUTH_API_BASE_URLS) {
    try {
      console.log("ðŸ“¡ Probando refresh en:", baseUrl);
      
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

      console.log("ðŸ“¥ Respuesta del refresh:", response.status, response.statusText);

      if (response.ok) {
        const data = await response.json();
        console.log("ðŸ“¦ Datos recibidos:", data);
        
        if (data.accessToken) {
          localStorage.setItem("token", data.accessToken);
          console.log("ðŸ’¾ Nuevo access token guardado:", data.accessToken.substring(0, 30) + "...");
          
          if (data.refreshToken) {
            localStorage.setItem("refreshToken", data.refreshToken);
            console.log("ðŸ’¾ Nuevo refresh token guardado");
          }
          
          console.log("âœ… Token renovado exitosamente");
          return data.accessToken;
        } else {
          console.warn("âš ï¸ La respuesta no contiene accessToken");
        }
      } else {
        const errorText = await response.text().catch(() => 'No se pudo leer el error');
        console.error("âŒ Error en refresh:", response.status, errorText);
      }
    } catch (err) {
      console.warn(`âš ï¸ Error al intentar refresh con ${baseUrl}:`, err.message);
      continue;
    }
  }
  
  throw new Error("No se pudo renovar el token");
}

async function apiRequestFirstOk(baseUrls, endpoint, method = "GET", body = null, serviceName = "servicio", retryWithRefresh = true) {
  const headers = buildHeaders();
  const options = { method, headers };
  if (body instanceof FormData) {
    delete options.headers["Content-Type"];
    options.body = body;
  } else if (body !== null && body !== undefined) {
    options.body = JSON.stringify(body);
  }

  let lastError;
  for (const baseUrl of baseUrls) {
    // Asegurar que el endpoint no empiece con / para evitar doble slash
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
    const fullUrl = `${baseUrl}/${cleanEndpoint}`;
    
    try {
      console.log(`ðŸ” [${serviceName}] Intentando: ${method} ${fullUrl}`);
      const response = await fetchWithTimeout(fullUrl, options, 10000);
      
      // Log de respuesta exitosa
      if (response.ok) {
        console.log(`âœ… [${serviceName}] Respuesta exitosa: ${response.status} ${fullUrl}`);
      }
      
      // Si es 401 y no es una peticiÃ³n de auth, intentar refresh
      if (response.status === 401 && retryWithRefresh && !endpoint.includes('Auth/')) {
        console.warn("âš ï¸ Token expirado (401), intentando renovar...");
        console.log('ðŸ” Endpoint que fallÃ³:', endpoint);
        console.log('ðŸ” Base URL:', baseUrl);
        
        // Si ya se estÃ¡ refrescando, esperar
        if (isRefreshing) {
          console.log('â³ Esperando a que termine el refresh en curso...');
          return new Promise((resolve, reject) => {
            subscribeTokenRefresh(async (token) => {
              try {
                console.log('ðŸ”„ Reintentando con token reciÃ©n renovado...');
                // Reintentar con el nuevo token - buildHeaders() lo tomarÃ¡ automÃ¡ticamente
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
          console.log('ðŸ”„ Reintentando peticiÃ³n con token renovado...');
          return apiRequestFirstOk(baseUrls, endpoint, method, body, serviceName, false);
        } catch (refreshError) {
          isRefreshing = false;
          console.error("âŒ No se pudo renovar el token:", refreshError);
          
          // Limpiar tokens y redirigir al login
          localStorage.removeItem("token");
          localStorage.removeItem("refreshToken");
          localStorage.removeItem("user");
          
          if (window.location.pathname !== '/login.html' && window.location.pathname !== '/') {
            window.location.href = "/login.html";
          }
          
          throw new Error("SesiÃ³n expirada. Por favor, inicia sesiÃ³n nuevamente.");
        }
      }
      
      if (!response.ok) {
        let message = "Error en la solicitud";
        let errorDetails = null;
        let errorBody = null;
        try { 
          errorBody = await response.text();
          console.error(`âŒ [${serviceName}] Error response body:`, errorBody);
          try {
            const errorData = JSON.parse(errorBody);
            message = errorData.message || errorData.detail || errorData.title || errorData.error || message;
            errorDetails = errorData.errors || errorData.details || null;
          } catch (_) {
            // Si no es JSON, usar el texto como mensaje
            message = errorBody || message;
          }
        } catch (_) {}
        
        console.error(`âŒ [${serviceName}] Error ${response.status} ${response.statusText}:`, {
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
      
      if (response.status === 204) {
        return null;
      }

      try { 
        return await response.json(); 
      } catch (_) { 
        return null; 
      }
    } catch (err) {
      lastError = err;
      console.error(`âŒ [${serviceName}] Error de red en ${fullUrl}:`, {
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

async function apiRequestFirstOkAllowingStatuses(baseUrls, endpoint, allowedStatuses = [], serviceName = "servicio") {
  const headers = buildHeaders();
  let lastError;

  for (const baseUrl of baseUrls) {
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
    const fullUrl = `${baseUrl}/${cleanEndpoint}`;

    try {
      console.log(`🔍 [${serviceName}] Intentando: GET ${fullUrl}`);
      const response = await fetchWithTimeout(fullUrl, { method: "GET", headers }, 10000);

      if (response.ok) {
        console.log(`✅ [${serviceName}] Respuesta exitosa: ${response.status} ${fullUrl}`);
        if (response.status === 204) {
          return null;
        }

        try {
          return await response.json();
        } catch (_) {
          return null;
        }
      }

      if (allowedStatuses.includes(response.status)) {
        console.log(`ℹ️ [${serviceName}] Respuesta controlada: ${response.status} ${fullUrl}`);
        return null;
      }

      let message = "Error en la solicitud";
      let errorDetails = null;
      let errorBody = null;
      try {
        errorBody = await response.text();
        console.error(`❌ [${serviceName}] Error response body:`, errorBody);
        try {
          const errorData = JSON.parse(errorBody);
          message = errorData.message || errorData.detail || errorData.title || errorData.error || message;
          errorDetails = errorData.errors || errorData.details || null;
        } catch (_) {
          message = errorBody || message;
        }
      } catch (_) {}

      const error = new Error(message);
      error.status = response.status;
      error.statusText = response.statusText;
      error.details = errorDetails;
      error.body = errorBody;
      throw error;
    } catch (err) {
      lastError = err;
      if (err.status && err.status >= 400 && err.status < 500 && err.status !== 401) {
        throw err;
      }
    }
  }

  throw lastError || new Error(`No se pudo contactar al servicio ${serviceName}`);
}

function parseContentDispositionFileName(headerValue) {
  if (!headerValue || typeof headerValue !== "string") return null;

  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const simpleMatch = headerValue.match(/filename="?([^";]+)"?/i);
  return simpleMatch?.[1] ? simpleMatch[1] : null;
}

async function apiDownloadFirstOk(baseUrls, endpoint, serviceName = "servicio", retryWithRefresh = true) {
  const headers = buildHeaders();
  delete headers["Content-Type"];

  let lastError;
  for (const baseUrl of baseUrls) {
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint.substring(1) : endpoint;
    const fullUrl = `${baseUrl}/${cleanEndpoint}`;

    try {
      const response = await fetchWithTimeout(fullUrl, { method: "GET", headers }, 15000);

      if (response.status === 401 && retryWithRefresh && !endpoint.includes("Auth/")) {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            subscribeTokenRefresh(async () => {
              try {
                resolve(await apiDownloadFirstOk(baseUrls, endpoint, serviceName, false));
              } catch (error) {
                reject(error);
              }
            });
          });
        }

        isRefreshing = true;
        try {
          const newToken = await refreshAccessToken();
          isRefreshing = false;
          onRefreshed(newToken);
          return await apiDownloadFirstOk(baseUrls, endpoint, serviceName, false);
        } catch (refreshError) {
          isRefreshing = false;
          localStorage.removeItem("token");
          localStorage.removeItem("refreshToken");
          localStorage.removeItem("user");

          if (window.location.pathname !== "/login.html" && window.location.pathname !== "/") {
            window.location.href = "/login.html";
          }

          throw new Error("Sesion expirada. Por favor, inicia sesion nuevamente.");
        }
      }

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        const error = new Error(errorBody || `Error ${response.status}: ${response.statusText}`);
        error.status = response.status;
        error.statusText = response.statusText;
        error.body = errorBody;
        throw error;
      }

      return {
        blob: await response.blob(),
        contentType: response.headers.get("content-type") || "application/octet-stream",
        fileName: parseContentDispositionFileName(response.headers.get("content-disposition") || "")
      };
    } catch (error) {
      lastError = error;
      if (error.status && error.status >= 400 && error.status < 500 && error.status !== 401) {
        throw error;
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

export const ApiOrder = {
  get: (endpoint) => apiRequestFirstOk(ORDER_API_BASE_URLS, endpoint, "GET", null, "OrderMS"),
  getAllowingStatuses: (endpoint, allowedStatuses = []) => apiRequestFirstOkAllowingStatuses(ORDER_API_BASE_URLS, endpoint, allowedStatuses, "OrderMS"),
  post: (endpoint, data) => apiRequestFirstOk(ORDER_API_BASE_URLS, endpoint, "POST", data, "OrderMS"),
  put: (endpoint, data) => apiRequestFirstOk(ORDER_API_BASE_URLS, endpoint, "PUT", data, "OrderMS"),
  patch: (endpoint, data) => apiRequestFirstOk(ORDER_API_BASE_URLS, endpoint, "PATCH", data, "OrderMS"),
  delete: (endpoint) => apiRequestFirstOk(ORDER_API_BASE_URLS, endpoint, "DELETE", null, "OrderMS"),
  download: (endpoint) => apiDownloadFirstOk(ORDER_API_BASE_URLS, endpoint, "OrderMS"),
};


export const ApiCatalog = {
  get: (endpoint) => apiRequestFirstOk(CATALOG_API_BASE_URLS, endpoint, "GET", null, "CatalogMS"),
  post: (endpoint, data) => apiRequestFirstOk(CATALOG_API_BASE_URLS, endpoint, "POST", data, "CatalogMS"),
  put: (endpoint, data) => apiRequestFirstOk(CATALOG_API_BASE_URLS, endpoint, "PUT", data, "CatalogMS"),
  patch: (endpoint, data) => apiRequestFirstOk(CATALOG_API_BASE_URLS, endpoint, "PATCH", data, "CatalogMS"),
  delete: (endpoint) => apiRequestFirstOk(CATALOG_API_BASE_URLS, endpoint, "DELETE", null, "CatalogMS"),
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

export const FrontGateway = {
  catalog: {
    async getEnabledServiceOfferings() {
      const data = await ApiCatalog.get("service-offerings?onlyEnabled=true");
      return Array.isArray(data) ? data : [];
    }
  },
  directory: {
    async getClientProfileById(clientId) {
      if (!isGuid(clientId)) throw new Error("ClientId invalido para DirectoryMS.");
      return await Api.get(`v1/client-profiles/${clientId}`);
    },
    async getClientProfileByAuthUserId(authUserId) {
      if (!isGuid(authUserId)) throw new Error("AuthUserId invalido para DirectoryMS.");
      return await Api.get(`v1/client-profiles/by-auth-user/${authUserId}`);
    },
    async getClientProfilesByProvider(providerEntityId) {
      if (!isGuid(providerEntityId)) throw new Error("ProviderEntityId invalido para DirectoryMS.");
      const data = await Api.get(`v1/client-profiles/by-provider/${providerEntityId}`);
      return Array.isArray(data) ? data : [];
    },
    async getProviderById(providerEntityId) {
      if (!isGuid(providerEntityId)) throw new Error("ProviderEntityId invalido para DirectoryMS.");
      return await Api.get(`v1/providers/${providerEntityId}`);
    },
    async getProviders() {
      const data = await Api.get("v1/providers");
      return Array.isArray(data) ? data : [];
    },
    async createProvider({ name, isEnabled = true }) {
      if (typeof name !== "string" || !name.trim()) throw new Error("Name invalido para DirectoryMS.");
      return await Api.post("v1/providers", {
        name: name.trim(),
        isEnabled: Boolean(isEnabled)
      });
    },
    async updateProvider(providerEntityId, { name, isEnabled }) {
      if (!isGuid(providerEntityId)) throw new Error("ProviderEntityId invalido para DirectoryMS.");
      if (typeof name !== "string" || !name.trim()) throw new Error("Name invalido para DirectoryMS.");
      return await Api.put(`v1/providers/${providerEntityId}`, {
        name: name.trim(),
        isEnabled: Boolean(isEnabled)
      });
    },
    async getUsers() {
      const data = await Api.get("v1/users");
      return Array.isArray(data) ? data : [];
    },
    async getAdminSnapshot() {
      return await Api.get("v1/admin/snapshot");
    },
    async getProviderAdminProfileByAuthUserId(authUserId) {
      if (!isGuid(authUserId)) throw new Error("AuthUserId invalido para DirectoryMS.");
      return await Api.get(`v1/provider-admin-profiles/by-auth-user/${authUserId}`);
    },
    async getProviderAdminProfilesByProvider(providerEntityId) {
      if (!isGuid(providerEntityId)) throw new Error("ProviderEntityId invalido para DirectoryMS.");
      const data = await Api.get(`v1/provider-admin-profiles/by-provider/${providerEntityId}`);
      return Array.isArray(data) ? data : [];
    },
    async getTechnicianProfileById(technicianId) {
      if (!isGuid(technicianId)) throw new Error("TechnicianId invalido para DirectoryMS.");
      return await Api.get(`v1/technician-profiles/${technicianId}`);
    },
    async getTechnicianProfileByAuthUserId(authUserId) {
      if (!isGuid(authUserId)) throw new Error("AuthUserId invalido para DirectoryMS.");
      return await Api.get(`v1/technician-profiles/by-auth-user/${authUserId}`);
    },
    async getTechniciansByProvider(providerEntityId) {
      if (!isGuid(providerEntityId)) throw new Error("ProviderEntityId invalido para DirectoryMS.");
      const data = await Api.get(`v1/technician-profiles/by-provider/${providerEntityId}`);
      return Array.isArray(data) ? data : [];
    },
    async getTechniciansBySpecialty(specialty) {
      if (!specialty) return [];
      const data = await Api.get(`v1/technician-profiles/by-specialty/${encodeURIComponent(specialty)}`);
      return Array.isArray(data) ? data : [];
    },
    async changeTechnicianStatus(technicianId, status) {
      if (!isGuid(technicianId)) throw new Error("TechnicianId invalido para DirectoryMS.");

      return await Api.patch(`v1/technician-profiles/${technicianId}/status`, {
        status
      });
    },
    async getTechnicianProviderChangeRequestsByTechnician(technicianProfileId) {
      if (!isGuid(technicianProfileId)) throw new Error("TechnicianProfileId invalido para DirectoryMS.");
      const data = await Api.get(`v1/technician-provider-change-requests/technician/${technicianProfileId}`);
      return Array.isArray(data) ? data : [];
    },
    async getTechnicianProviderChangeRequestsByProvider(providerEntityId) {
      if (!isGuid(providerEntityId)) throw new Error("ProviderEntityId invalido para DirectoryMS.");
      const data = await Api.get(`v1/technician-provider-change-requests/provider/${providerEntityId}`);
      return Array.isArray(data) ? data : [];
    },
    async createTechnicianProviderChangeRequest({ technicianProfileId, requestedProviderEntityId, requestedByAuthUserId = null, note = null }) {
      if (!isGuid(technicianProfileId)) throw new Error("TechnicianProfileId invalido para DirectoryMS.");
      if (!isGuid(requestedProviderEntityId)) throw new Error("RequestedProviderEntityId invalido para DirectoryMS.");
      return await Api.post("v1/technician-provider-change-requests", {
        technicianProfileId,
        requestedProviderEntityId,
        requestedByAuthUserId: isGuid(requestedByAuthUserId) ? requestedByAuthUserId : null,
        note: typeof note === "string" && note.trim() ? note.trim() : null
      });
    },
    async resolveTechnicianProviderChangeRequest(requestId, { status, reviewedByUserId = null, note = null }) {
      if (!isGuid(requestId)) throw new Error("RequestId invalido para DirectoryMS.");
      return await Api.patch(`v1/technician-provider-change-requests/${requestId}/decision`, {
        status,
        reviewedByUserId: isGuid(reviewedByUserId) ? reviewedByUserId : null,
        note: typeof note === "string" && note.trim() ? note.trim() : null
      });
    }
  },
  scheduling: {
    async getAvailabilityByTechnician(technicianId, fromUtc, toUtc) {
      if (!isGuid(technicianId)) throw new Error("TechnicianId invalido para SchedulingMS.");
      const params = new URLSearchParams({
        fromUtc,
        toUtc
      });

      const data = await ApiScheduling.get(`availability/technician/${technicianId}?${params.toString()}`);
      return Array.isArray(data) ? data : [];
    },
    async getAbsencesByTechnician(technicianId, fromUtc, toUtc) {
      if (!isGuid(technicianId)) throw new Error("TechnicianId invalido para SchedulingMS.");
      const params = new URLSearchParams({
        fromUtc,
        toUtc
      });

      const data = await ApiScheduling.get(`absences/technician/${technicianId}?${params.toString()}`);
      return Array.isArray(data) ? data : [];
    },
    async createAbsence({ technicianId, providerEntityId, startAtUtc, endAtUtc, reason }) {
      if (!isGuid(technicianId)) throw new Error("TechnicianId invalido para SchedulingMS.");
      if (!isGuid(providerEntityId)) throw new Error("ProviderEntityId invalido para SchedulingMS.");

      return await ApiScheduling.post("absences", {
        technicianId,
        providerEntityId,
        startAtUtc,
        endAtUtc,
        reason
      });
    },
    async updateAbsence(absenceId, { startAtUtc, endAtUtc, reason }) {
      if (!isGuid(absenceId)) throw new Error("AbsenceId invalido para SchedulingMS.");

      return await ApiScheduling.put(`absences/${absenceId}`, {
        startAtUtc,
        endAtUtc,
        reason
      });
    },
    async deleteAbsence(absenceId) {
      if (!isGuid(absenceId)) throw new Error("AbsenceId invalido para SchedulingMS.");
      return await ApiScheduling.delete(`absences/${absenceId}`);
    },
    async getReservationsByTechnician(technicianId) {
      if (!isGuid(technicianId)) throw new Error("TechnicianId invalido para SchedulingMS.");
      const data = await ApiScheduling.get(`reservations/technician/${technicianId}`);
      return Array.isArray(data) ? data : [];
    },
    async getBusyPeriodsByTechnician(technicianId) {
      if (!isGuid(technicianId)) throw new Error("TechnicianId invalido para SchedulingMS.");
      const data = await ApiScheduling.get(`reservations/technician/${technicianId}/busy-periods`);
      return Array.isArray(data) ? data : [];
    },
    async getReservationById(reservationId) {
      if (!isGuid(reservationId)) throw new Error("ReservationId invalido para SchedulingMS.");
      return await ApiScheduling.get(`reservations/${reservationId}`);
    },
    async createAvailability({ technicianId, providerEntityId, startAtUtc, endAtUtc }) {
      if (!isGuid(technicianId)) throw new Error("TechnicianId invalido para SchedulingMS.");
      if (!isGuid(providerEntityId)) throw new Error("ProviderEntityId invalido para SchedulingMS.");

      return await ApiScheduling.post("availability", {
        technicianId,
        providerEntityId,
        startAtUtc,
        endAtUtc
      });
    },
    async updateAvailability(availabilityId, { startAtUtc, endAtUtc }) {
      if (!isGuid(availabilityId)) throw new Error("AvailabilityId invalido para SchedulingMS.");

      return await ApiScheduling.put(`availability/${availabilityId}`, {
        startAtUtc,
        endAtUtc
      });
    },
    async deleteAvailability(availabilityId) {
      if (!isGuid(availabilityId)) throw new Error("AvailabilityId invalido para SchedulingMS.");
      return await ApiScheduling.delete(`availability/${availabilityId}`);
    },
    async createReservation({ clientId, providerEntityId, serviceId, startAtUtc, endAtUtc }) {
      const normalizedClientId = toStableGuid(clientId);
      if (!normalizedClientId) throw new Error("ClientId invalido para SchedulingMS.");
      if (!isGuid(providerEntityId)) throw new Error("ProviderEntityId invalido para SchedulingMS.");
      if (!isGuid(serviceId)) throw new Error("ServiceId invalido para SchedulingMS.");

      const payload = {
        clientId: normalizedClientId,
        providerEntityId,
        serviceId,
        startAtUtc,
        endAtUtc
      };

      return await ApiScheduling.post("reservations", payload);
    },
    async createReservationWithOrder({ clientId, providerEntityId, startAtUtc, items }) {
      const normalizedClientId = toStableGuid(clientId);
      if (!normalizedClientId) throw new Error("ClientId invalido para SchedulingMS.");
      if (!isGuid(providerEntityId)) throw new Error("ProviderEntityId invalido para SchedulingMS.");
      if (!Array.isArray(items) || items.length === 0) throw new Error("Items invalidos para SchedulingMS.");

      return await ApiScheduling.post("reservations/with-order", {
        clientId: normalizedClientId,
        providerEntityId,
        startAtUtc,
        items: items.map((item) => ({
          serviceId: item.serviceId,
          serviceName: item.serviceName,
          unitPrice: Number(item.unitPrice),
          quantity: Number(item.quantity),
          durationMinutes: Number(item.durationMinutes)
        }))
      });
    },
    async updateReservationStatus(reservationId, { status, changedByUserId = null, note = null }) {
      if (!isGuid(reservationId)) throw new Error("ReservationId invalido para SchedulingMS.");

      return await ApiScheduling.patch(`reservations/${reservationId}/status`, {
        status,
        changedByUserId,
        note
      });
    },
    async approveReservation(reservationId, { reviewedByUserId = null, note = null } = {}) {
      if (!isGuid(reservationId)) throw new Error("ReservationId invalido para SchedulingMS.");

      return await ApiScheduling.patch(`reservations/${reservationId}/approve`, {
        note: typeof note === "string" && note.trim() ? note.trim() : null
      });
    },
    async confirmReservation(reservationId, { reviewedByUserId = null, note = null } = {}) {
      if (!isGuid(reservationId)) throw new Error("ReservationId invalido para SchedulingMS.");

      return await ApiScheduling.patch(`reservations/${reservationId}/confirm`, {
        note: typeof note === "string" && note.trim() ? note.trim() : null
      });
    },
    async reassignReservation(reservationId, { technicianId, requestedByUserId = null, reason = null, overrideByAdmin = false }) {
      if (!isGuid(reservationId)) throw new Error("ReservationId invalido para SchedulingMS.");
      if (!isGuid(technicianId)) throw new Error("TechnicianId invalido para SchedulingMS.");

      return await ApiScheduling.post(`reservations/${reservationId}/reassign`, {
        technicianId,
        requestedByUserId,
        reason,
        overrideByAdmin
      });
    },
    async getReservationsByClient(clientId) {
      const normalizedClientId = toStableGuid(clientId);
      if (!normalizedClientId) throw new Error("ClientId invalido para SchedulingMS.");
      const data = await ApiScheduling.get(`reservations/client/${normalizedClientId}`);
      return Array.isArray(data) ? data : [];
    },
    async getReservationsOverview({ clientId = null, technicianId = null, providerEntityId = null, status = null, fromUtc = null, toUtc = null } = {}) {
      const params = new URLSearchParams();
      if (isGuid(clientId)) params.set("clientId", clientId);
      if (isGuid(technicianId)) params.set("technicianId", technicianId);
      if (isGuid(providerEntityId)) params.set("providerEntityId", providerEntityId);
      if (status !== null && status !== undefined && status !== "") params.set("status", status);
      if (typeof fromUtc === "string" && fromUtc.trim()) params.set("fromUtc", fromUtc.trim());
      if (typeof toUtc === "string" && toUtc.trim()) params.set("toUtc", toUtc.trim());
      const suffix = params.size ? `?${params.toString()}` : "";
      return await ApiScheduling.get(`reservations/overview${suffix}`);
    }
  },
  order: {
    async createOrder({ reservationId, clientId, providerEntityId, technicianId, scheduledStartAtUtc, scheduledEndAtUtc, items }) {
      if (!isGuid(reservationId)) throw new Error("ReservationId invalido para OrderMS.");
      if (!isGuid(clientId)) throw new Error("ClientId invalido para OrderMS.");
      if (!isGuid(providerEntityId)) throw new Error("ProviderEntityId invalido para OrderMS.");
      if (!isGuid(technicianId)) throw new Error("TechnicianId invalido para OrderMS.");
      if (!Array.isArray(items) || items.length === 0) throw new Error("Items invalidos para OrderMS.");

      return await ApiOrder.post("service-orders", {
        reservationId,
        clientId,
        providerEntityId,
        technicianId,
        scheduledStartAtUtc,
        scheduledEndAtUtc,
        items: items.map((item) => ({
          serviceId: item.serviceId,
          serviceName: item.serviceName,
          unitPrice: item.unitPrice,
          quantity: item.quantity
        }))
      });
    },
    async getOrdersByClient(clientId) {
      if (!isGuid(clientId)) throw new Error("ClientId invalido para OrderMS.");
      const data = await ApiOrder.get(`service-orders/client/${clientId}`);
      return Array.isArray(data) ? data : [];
    },
    async getOrdersByProvider(providerEntityId) {
      if (!isGuid(providerEntityId)) throw new Error("ProviderEntityId invalido para OrderMS.");
      const data = await ApiOrder.get(`service-orders/provider/${providerEntityId}`);
      return Array.isArray(data) ? data : [];
    },
    async getOrdersByTechnician(technicianId) {
      if (!isGuid(technicianId)) throw new Error("TechnicianId invalido para OrderMS.");
      const data = await ApiOrder.get(`service-orders/technician/${technicianId}`);
      return Array.isArray(data) ? data : [];
    },
    async getOrdersOverview({ clientId = null, providerEntityId = null, technicianId = null, status = null, fromUtc = null, toUtc = null } = {}) {
      const params = new URLSearchParams();
      if (isGuid(clientId)) params.set("clientId", clientId);
      if (isGuid(providerEntityId)) params.set("providerEntityId", providerEntityId);
      if (isGuid(technicianId)) params.set("technicianId", technicianId);
      if (status !== null && status !== undefined && status !== "") params.set("status", status);
      if (typeof fromUtc === "string" && fromUtc.trim()) params.set("fromUtc", fromUtc.trim());
      if (typeof toUtc === "string" && toUtc.trim()) params.set("toUtc", toUtc.trim());
      const suffix = params.size ? `?${params.toString()}` : "";
      return await ApiOrder.get(`service-orders/overview${suffix}`);
    },
    async createMembership({ clientId, planName, totalCredits, validFromUtc, validToUtc }) {
      if (!isGuid(clientId)) throw new Error("ClientId invalido para OrderMS.");
      if (typeof planName !== "string" || !planName.trim()) throw new Error("PlanName invalido para OrderMS.");
      if (!Number.isInteger(Number(totalCredits)) || Number(totalCredits) <= 0) throw new Error("TotalCredits invalido para OrderMS.");

      return await ApiOrder.post("memberships", {
        clientId,
        planName: planName.trim(),
        totalCredits: Number(totalCredits),
        validFromUtc,
        validToUtc
      });
    },
    async getActiveMembershipByClient(clientId) {
      if (!isGuid(clientId)) throw new Error("ClientId invalido para OrderMS.");
      return await ApiOrder.getAllowingStatuses(`memberships/client/${clientId}/active`, [404]);
    },
    async getCreditMovementsByClient(clientId) {
      if (!isGuid(clientId)) throw new Error("ClientId invalido para OrderMS.");
      const data = await ApiOrder.get(`memberships/client/${clientId}/movements`);
      return Array.isArray(data) ? data : [];
    },
    async getOrderById(orderId) {
      if (!isGuid(orderId)) throw new Error("OrderId invalido para OrderMS.");
      return await ApiOrder.get(`service-orders/${orderId}`);
    },
    async getOrderDetail(orderId) {
      if (!isGuid(orderId)) throw new Error("OrderId invalido para OrderMS.");
      return await ApiOrder.get(`service-orders/${orderId}/detail`);
    },
    async getOrderHistory(orderId) {
      if (!isGuid(orderId)) throw new Error("OrderId invalido para OrderMS.");
      const data = await ApiOrder.get(`service-orders/${orderId}/history`);
      return Array.isArray(data) ? data : [];
    },
    async getOrderEvidence(orderId) {
      if (!isGuid(orderId)) throw new Error("OrderId invalido para OrderMS.");
      const data = await ApiOrder.get(`service-orders/${orderId}/evidence`);
      return Array.isArray(data) ? data : [];
    },
    async getOrderCancellationRequests(orderId) {
      if (!isGuid(orderId)) throw new Error("OrderId invalido para OrderMS.");
      const data = await ApiOrder.get(`service-orders/${orderId}/cancellation-requests`);
      return Array.isArray(data) ? data : [];
    },
    async getPendingCancellationRequestsByProvider(providerEntityId) {
      if (!isGuid(providerEntityId)) throw new Error("ProviderEntityId invalido para OrderMS.");
      const data = await ApiOrder.get(`service-orders/provider/${providerEntityId}/cancellation-requests/pending`);
      return Array.isArray(data) ? data : [];
    },
    async updateOrderStatus(orderId, { status, changedByUserId = null, note = null }) {
      if (!isGuid(orderId)) throw new Error("OrderId invalido para OrderMS.");

      return await ApiOrder.patch(`service-orders/${orderId}/status`, {
        status,
        changedByUserId,
        note
      });
    },
    async approveOrder(orderId, { reviewedByUserId = null, note = null } = {}) {
      if (!isGuid(orderId)) throw new Error("OrderId invalido para OrderMS.");

      return await ApiOrder.patch(`service-orders/${orderId}/approve`, {
        note: typeof note === "string" && note.trim() ? note.trim() : null
      });
    },
    async confirmOrder(orderId, { reviewedByUserId = null, note = null } = {}) {
      if (!isGuid(orderId)) throw new Error("OrderId invalido para OrderMS.");

      return await ApiOrder.patch(`service-orders/${orderId}/confirm`, {
        note: typeof note === "string" && note.trim() ? note.trim() : null
      });
    },
    async createCancellationRequest(orderId, { technicianId, reason, requestedByUserId = null, note = null }) {
      if (!isGuid(orderId)) throw new Error("OrderId invalido para OrderMS.");
      if (!isGuid(technicianId)) throw new Error("TechnicianId invalido para OrderMS.");
      return await ApiOrder.post(`service-orders/${orderId}/cancellation-requests`, {
        technicianId,
        reason,
        requestedByUserId: isGuid(requestedByUserId) ? requestedByUserId : null,
        note: typeof note === "string" && note.trim() ? note.trim() : null
      });
    },
    async resolveCancellationRequest(requestId, { status, reviewedByUserId = null, note = null, replacementTechnicianId = null, requestedByUserId = null, overrideByAdmin = false } = {}) {
      if (!isGuid(requestId)) throw new Error("RequestId invalido para OrderMS.");
      return await ApiOrder.patch(`service-orders/cancellation-requests/${requestId}/decision`, {
        status,
        reviewedByUserId: isGuid(reviewedByUserId) ? reviewedByUserId : null,
        note: typeof note === "string" && note.trim() ? note.trim() : null,
        replacementTechnicianId: isGuid(replacementTechnicianId) ? replacementTechnicianId : null,
        requestedByUserId: isGuid(requestedByUserId) ? requestedByUserId : null,
        overrideByAdmin: Boolean(overrideByAdmin)
      });
    },
    async addPhotoEvidence(orderId, { file, recordedByUserId = null, note = null }) {
      if (!isGuid(orderId)) throw new Error("OrderId invalido para OrderMS.");
      if (!(file instanceof File) && !(file instanceof Blob)) {
        throw new Error("Archivo de evidencia invalido.");
      }

      const formData = new FormData();
      formData.append("file", file, file.name || "evidence.bin");
      if (isGuid(recordedByUserId)) {
        formData.append("recordedByUserId", recordedByUserId);
      }
      if (typeof note === "string" && note.trim()) {
        formData.append("note", note.trim());
      }

      return await ApiOrder.post(`service-orders/${orderId}/evidence/photo`, formData);
    },
    async addDigitalCheckEvidence(orderId, { recordedByUserId = null, note = null } = {}) {
      if (!isGuid(orderId)) throw new Error("OrderId invalido para OrderMS.");

      return await ApiOrder.post(`service-orders/${orderId}/evidence/check`, {
        recordedByUserId: isGuid(recordedByUserId) ? recordedByUserId : null,
        note: typeof note === "string" && note.trim() ? note.trim() : null
      });
    },
    async downloadEvidenceFile(orderId, evidenceId) {
      if (!isGuid(orderId)) throw new Error("OrderId invalido para OrderMS.");
      if (!isGuid(evidenceId)) throw new Error("EvidenceId invalido para OrderMS.");
      return await ApiOrder.download(`service-orders/${orderId}/evidence/${evidenceId}/file`);
    },
    async downloadReceipt(orderId) {
      if (!isGuid(orderId)) throw new Error("OrderId invalido para OrderMS.");
      return await ApiOrder.download(`service-orders/${orderId}/receipt`);
    },
    async reassignTechnician(orderId, { technicianId, requestedByUserId = null, reason = null, overrideByAdmin = false }) {
      if (!isGuid(orderId)) throw new Error("OrderId invalido para OrderMS.");
      if (!isGuid(technicianId)) throw new Error("TechnicianId invalido para OrderMS.");

      return await ApiOrder.post(`service-orders/${orderId}/reassign`, {
        technicianId,
        requestedByUserId,
        reason,
        overrideByAdmin
      });
    }
  },
  auth: {
    async getTechnicianPublicProfile(userId) {
      if (!isGuid(userId)) throw new Error("UserId invalido para AuthMS.");
      return await ApiAuth.get(`User/technicians/${userId}`);
    },
    async createProviderAdmin({ firstName, lastName, email, dni, password, phone, providerEntityId }) {
      if (!isGuid(providerEntityId)) throw new Error("ProviderEntityId invalido para AuthMS.");
      return await ApiAuth.post("User/provider-admins", {
        firstName,
        lastName,
        email,
        dni,
        password,
        phone,
        providerEntityId
      });
    },
    async createTechnicianForProvider({ firstName, lastName, email, dni, password, phone, specialty }) {
      return await ApiAuth.post("User/provider/technicians", {
        firstName,
        lastName,
        email,
        dni,
        password,
        phone,
        specialty
      });
    }
  }
};

// Exportar funciones de gestiÃ³n de tokens para uso en mÃ³dulos ES6
export { startKeepAlive, stopKeepAlive, ensureValidToken, refreshAccessToken };

// Exponer global para scripts no mÃ³dulo
if (typeof window !== "undefined") {
  window.Api = Api;
  window.ApiAuth = ApiAuth;
  window.ApiScheduling = ApiScheduling;
  window.ApiOrder = ApiOrder;
  window.ApiCatalog = ApiCatalog;
  window.ApiClinical = ApiClinical;
  window.ApiHl7Gateway = ApiHl7Gateway;
  window.FrontGateway = FrontGateway;
  window.startKeepAlive = startKeepAlive;
  window.stopKeepAlive = stopKeepAlive;
  window.ensureValidToken = ensureValidToken;
  
  // Auto-iniciar keep-alive si hay tokens VÃLIDOS
  const token = localStorage.getItem("token");
  const refreshToken = localStorage.getItem("refreshToken");
  
  if (token && refreshToken) {
    // Verificar si el token estÃ¡ expirado antes de iniciar keep-alive
    if (!isTokenExpired(token)) {
      startKeepAlive();
      console.log("âœ… Keep-alive iniciado automÃ¡ticamente");
    } else {
      console.warn("âš ï¸ Token expirado detectado, intentando renovar...");
      ensureValidToken().catch(() => {
        console.error("âŒ No se pudo renovar el token, por favor inicia sesiÃ³n");
      });
    }
  }
}


