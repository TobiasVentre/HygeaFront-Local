// Importar el cliente centralizado que maneja refresh automático
import { ApiAuth } from '../api.js';

export async function login(email, password) {
    console.log('🔐 Intentando login para:', email);
    
    try {
        const result = await ApiAuth.post("Auth/Login", { email, password });
        console.log('✅ Login exitoso');
        return result;
    } catch (error) {
        console.error('❌ Error en login:', error);
        throw new Error(error.message || "Error al iniciar sesión");
    }
}

export async function registerUser(userData) {
    try {
        console.log('📝 Registrando usuario:', userData.email);
        const result = await ApiAuth.post("User", userData);
        console.log('✅ Usuario registrado exitosamente');
        return result;
    } catch (error) {
        console.error("❌ Error en registerUser:", error);
        if (error.details) {
            const validationErrors = Object.entries(error.details)
                .map(([field, errors]) => `${field}: ${Array.isArray(errors) ? errors.join(", ") : errors}`)
                .join("\n");
            throw new Error(`Errores de validación:\n${validationErrors}`);
        }
        throw error;
    }
}

export async function verifyEmail(email, verificationCode) {
    try {
        console.log('📧 Verificando código para:', email);
        const result = await ApiAuth.post("Auth/VerifyEmail", { 
            email, 
            verificationCode 
        });
        console.log('✅ Email verificado exitosamente');
        return result;
    } catch (error) {
        console.error("❌ Error en verifyEmail:", error);
        throw new Error(error.message || "Error al verificar el código");
    }
}

export async function resendVerificationEmail(email) {
    try {
        console.log('📧 Reenviando código de verificación a:', email);
        const result = await ApiAuth.post("Auth/ResendVerificationEmail", { email });
        console.log('✅ Código reenviado exitosamente');
        return result;
    } catch (error) {
        console.error("❌ Error en resendVerificationEmail:", error);
        throw new Error(error.message || "Error al reenviar el código");
    }
}

export async function requestPasswordReset(email) {
    try {
        console.log('📧 Solicitando blanqueo para:', email);
        return await ApiAuth.post("Auth/PasswordResetRequest", { email });
    } catch (error) {
        console.error("❌ Error en requestPasswordReset:", error);
        throw new Error(error.message || "Error al solicitar el blanqueo de clave");
    }
}

export async function confirmPasswordReset(email, resetCode, newPassword) {
    try {
        console.log('🔐 Confirmando blanqueo para:', email);
        return await ApiAuth.post("Auth/PasswordResetConfirm", { email, resetCode, newPassword });
    } catch (error) {
        console.error("❌ Error en confirmPasswordReset:", error);
        throw new Error(error.message || "Error al restablecer la contrasena");
    }
}

/**
 * Extrae los datos del usuario desde el JWT almacenado
 * Ya no necesita llamar al backend porque el token contiene toda la info
 */
function getUserFromToken() {
    const token = localStorage.getItem("token");
    if (!token) return null;
    
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        
        // Extraer userId (puede venir como array o string)
        let userId = payload.sub || payload.UserId || payload.userId || payload.nameid;
        if (Array.isArray(userId)) userId = userId[0];
        
        return {
            userId: userId || null,
            UserId: userId || null,
            email: payload.UserEmail || payload.email || payload.Email,
            Email: payload.UserEmail || payload.email || payload.Email,
            firstName: payload.FirstName || payload.firstName || "",
            FirstName: payload.FirstName || payload.firstName || "",
            lastName: payload.LastName || payload.lastName || "",
            LastName: payload.LastName || payload.lastName || "",
            role: payload.role || payload.Role || payload.UserRole,
            Role: payload.role || payload.Role || payload.UserRole,
            isActive: payload.IsActive === "True" || payload.IsActive === true,
            isEmailVerified: payload.IsEmailVerified === "True" || payload.IsEmailVerified === true,
        };
    } catch (e) {
        console.error("Error al parsear token:", e);
        return null;
    }
}

/**
 * Obtiene un usuario por su ID
 * Primero intenta extraer del JWT, si falla intenta el backend
 */
export async function getUserById(userId, token = null) {
    if (!userId) {
        throw new Error("Se requiere un identificador de usuario válido");
    }

    console.log('👤 Obteniendo usuario por ID:', userId);
    
    // PRIMERO: Intentar obtener del token JWT (más rápido y no falla con 401)
    const userFromToken = getUserFromToken();
    if (userFromToken && String(userFromToken.userId) === String(userId)) {
        console.log('✅ Usuario obtenido desde JWT (sin llamada al backend)');
        return userFromToken;
    }
    
    // FALLBACK: Si el ID no coincide o no hay token, intentar backend
    console.log('🔄 Intentando obtener usuario desde backend...');
    try {
        const result = await ApiAuth.get(`User/${userId}`);
        console.log('✅ Usuario obtenido desde backend');
        return result;
    } catch (error) {
        if (error.status === 401 || error.status === 403) {
            // Si falla por permisos, usar datos del token si están disponibles
            console.warn('⚠️ Sin permisos para backend, usando datos del JWT');
            if (userFromToken) {
                return userFromToken;
            }
        }
        
        console.error(`❌ Error ${error.status}:`, error.message);
        throw error;
    }
}
