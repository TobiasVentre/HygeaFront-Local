// ===================================
// FUMIGATOR CORE - Estado y Utilidades
// ===================================

// Constantes
export const DEFAULT_AVATAR_URL = "https://icons.veryicon.com/png/o/internet--web/prejudice/user-128.png";

// Estado global del fumigator
export const fumigatorState = {
    currentUser: null,
    currentFumigatorData: null,
    autoRefreshInterval: null,
    currentPrescriptionData: null,
    allClientsList: []
};

// ===================================
// FUNCIONES DE UTILIDAD
// ===================================

/**
 * Normaliza un objeto para que tenga tanto propiedades camelCase como PascalCase
 */
export function normalizeObject(obj, fields) {
    if (!obj) return obj;
    fields.forEach(field => {
        const camel = field.charAt(0).toLowerCase() + field.slice(1);
        const pascal = field.charAt(0).toUpperCase() + field.slice(1);
        obj[camel] = obj[camel] ?? obj[pascal];
        obj[pascal] = obj[pascal] ?? obj[camel];
    });
    return obj;
}

/**
 * Obtiene un valor de un objeto probando múltiples claves
 */
export function getValue(obj, ...keys) {
    for (const key of keys) {
        if (obj?.[key] !== undefined && obj?.[key] !== null) return obj[key];
    }
    return null;
}

/**
 * Obtiene el ID de un objeto probando múltiples variantes
 */
export function getId(obj, ...keys) {
    return getValue(obj, ...keys) || getValue(obj, ...keys.map(k => k.charAt(0).toUpperCase() + k.slice(1)));
}

/**
 * Formatea una fecha en español
 */
export function formatDate(date, options = {}) {
    if (!date) return 'Fecha no disponible';
    try {
        const d = date instanceof Date ? date : new Date(date);
        if (isNaN(d.getTime())) return 'Fecha inválida';
        return d.toLocaleDateString('es-AR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            ...options
        });
    } catch {
        return 'Fecha no disponible';
    }
}

/**
 * Formatea una hora
 */
export function formatTime(date, options = {}) {
    if (!date) return '';
    try {
        const d = date instanceof Date ? date : new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
            ...options
        });
    } catch {
        return '';
    }
}

/**
 * Formatea un TimeSpan a string HH:mm
 */
export function formatTimeSpan(timeSpan) {
    if (!timeSpan) return '00:00';
    if (typeof timeSpan === 'string') {
        const parts = timeSpan.split(':');
        return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
    }
    const hours = (timeSpan.hours || timeSpan.Hours || 0).toString().padStart(2, '0');
    const minutes = (timeSpan.minutes || timeSpan.Minutes || 0).toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

/**
 * Calcula la edad desde una fecha de nacimiento
 */
export function calculateAge(dateOfBirth) {
    if (!dateOfBirth) return null;
    
    let birthDate;
    if (typeof dateOfBirth === 'string') {
        birthDate = new Date(dateOfBirth);
    } else if (dateOfBirth.year && dateOfBirth.month && dateOfBirth.day) {
        birthDate = new Date(dateOfBirth.year, dateOfBirth.month - 1, dateOfBirth.day);
    } else {
        return null;
    }
    
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    return age;
}

/**
 * Actualiza el contador de un elemento
 */
export function updateCounter(elementId, change) {
    const element = document.getElementById(elementId);
    if (element) {
        const currentValue = parseInt(element.textContent) || 0;
        element.textContent = Math.max(0, currentValue + change);
    }
}

// ===================================
// GESTIÓN DE USUARIO Y AUTENTICACIÓN
// ===================================

/**
 * Carga el contexto del fumigator desde el estado de autenticación
 */
export async function loadFumigatorContext() {
    console.log('🔐 Cargando contexto del fumigator...');
    
    try {
        const { state, loadUserFromStorage } = await import('../state.js');
        loadUserFromStorage();
        fumigatorState.currentUser = state.user;
        
        if (!fumigatorState.currentUser) {
            console.warn('⚠️ No hay usuario autenticado, redirigiendo a login');
            window.location.href = 'login.html';
            return;
        }
        
        console.log('✅ Usuario cargado:', fumigatorState.currentUser.email);
        
        // PASO 1: Verificar token (NO redirigir si falla, solo loguear)
        try {
            // Importar directamente desde api.js en lugar de usar window
            const { ensureValidToken } = await import('../api.js');
            await ensureValidToken();
            console.log('✅ Token validado/renovado');
        } catch (tokenError) {
            // NO redirigir inmediatamente, intentar continuar con datos locales
            console.warn('⚠️ Error con token, continuando con datos locales:', tokenError.message);
        }
        
        // PASO 2: Intentar sincronizar el perfil (OPCIONAL - no crítico)
        try {
            await ensureFumigatorProfile();
            const { state: updatedState } = await import('../state.js');
            fumigatorState.currentUser = updatedState.user;
            console.log('✅ Perfil sincronizado correctamente');
        } catch (profileError) {
            // NO redirigir por errores de perfil, continuar con datos locales
            console.warn('⚠️ No se pudo sincronizar perfil, usando datos locales:', profileError.message);
        }
        
        // Siempre continuar si tenemos datos básicos del usuario
        console.log('✅ Contexto del fumigator cargado (con datos locales si fue necesario)');
        
    } catch (error) {
        console.error('❌ Error crítico al cargar contexto:', error);
        // Solo redirigir si realmente no hay datos del usuario
        if (!fumigatorState.currentUser) {
            window.location.href = 'login.html';
        }
    }
}
/**
 * Asegura que el perfil del fumigator esté sincronizado
 */
export async function ensureFumigatorProfile() {
    const userId = fumigatorState.currentUser?.userId;
    
    if (!userId) {
        console.warn('⚠️ No se puede sincronizar perfil: falta userId');
        return;
    }
    
    try {
        console.log('🔄 Sincronizando perfil del usuario...');
        
        const { getUserById } = await import('../apis/authms.js');
        const profile = await getUserById(userId);
        
        if (!profile) {
            console.warn('⚠️ No se recibió perfil del servidor');
            return;
        }
        
        console.log('📥 Perfil recibido del servidor');
        
        // ... resto del código de actualización del perfil igual ...
        const newFirstName = getValue(profile, 'firstName', 'FirstName') ?? fumigatorState.currentUser?.firstName ?? '';
        const newLastName = getValue(profile, 'lastName', 'LastName') ?? fumigatorState.currentUser?.lastName ?? '';
        const newImageUrl = getValue(profile, 'imageUrl', 'ImageUrl') ?? fumigatorState.currentUser?.imageUrl;
        const newEmail = getValue(profile, 'email', 'Email') ?? fumigatorState.currentUser?.email;
        const newRole = getValue(profile, 'role', 'Role') ?? fumigatorState.currentUser?.role;
        
        const isDefaultImage = !newImageUrl || newImageUrl === DEFAULT_AVATAR_URL || 
                              newImageUrl.includes('icons.veryicon.com/png/o/internet--web/prejudice/user-128.png');
        
        const finalImageUrl = (newImageUrl && !isDefaultImage && newImageUrl.trim() !== '') 
            ? newImageUrl 
            : DEFAULT_AVATAR_URL;
        
        fumigatorState.currentUser = {
            ...fumigatorState.currentUser,
            firstName: newFirstName,
            FirstName: newFirstName,
            lastName: newLastName,
            LastName: newLastName,
            imageUrl: finalImageUrl,
            email: newEmail ?? fumigatorState.currentUser?.email,
            role: newRole ?? fumigatorState.currentUser?.role,
            userId: fumigatorState.currentUser?.userId ?? getValue(profile, 'userId', 'UserId') ?? userId,
        };
        
        const { state } = await import('../state.js');
        state.user = fumigatorState.currentUser;
        localStorage.setItem('user', JSON.stringify(fumigatorState.currentUser));
        
    } catch (error) {
        // NUNCA lanzar excepción, solo loguear
        console.warn('⚠️ Error al sincronizar perfil (no crítico):', error.message);
        // Continuar con datos locales
    }
}

/**
 * Obtiene la URL del avatar del fumigator
 */
export function getFumigatorAvatarUrl() {
    const candidate = fumigatorState.currentUser?.imageUrl;
    if (candidate && typeof candidate === 'string' && candidate.trim() && 
        candidate !== 'null' && candidate !== 'undefined' &&
        candidate !== DEFAULT_AVATAR_URL &&
        !candidate.includes('icons.veryicon.com/png/o/internet--web/prejudice/user-128.png')) {
        return candidate;
    }
    return DEFAULT_AVATAR_URL;
}

/**
 * Obtiene el nombre completo del fumigator para mostrar
 */
export function getFumigatorDisplayName(fumigatorInfo) {
    const info = fumigatorInfo || {};
    const fumigatorFirstName = info.firstName ?? info.FirstName ?? fumigatorState.currentUser?.firstName;
    const fumigatorLastName = info.lastName ?? info.LastName ?? fumigatorState.currentUser?.lastName;
    const fullName = [fumigatorFirstName, fumigatorLastName].filter(Boolean).join(' ').trim();

    if (fullName) {
        return fullName;
    }

    return fumigatorState.currentUser?.email || 'Profesional';
}

/**
 * Carga los datos del fumigator desde el backend
 */
export async function loadFumigatorData() {
    try {
        console.log('📋 Cargando datos del fumigator...');
        
        const { Api } = await import('../api.js');
        
        const userId = fumigatorState.currentUser?.userId;
        if (!userId) {
            console.error('❌ No hay userId disponible');
            return null;
        }
        
        let fumigator = null;
        
        // Intentar obtener fumigator por UserId
        try {
            console.log('🔍 Buscando fumigator por UserId:', userId);
            fumigator = await Api.get(`v1/Fumigator/User/${userId}`);
            console.log('✅ Fumigator encontrado por UserId');
        } catch (err) {
            console.warn('⚠️ No se encontró fumigator por UserId, buscando en lista completa...');
            
            try {
                const fumigators = await Api.get('v1/Fumigator');
                if (Array.isArray(fumigators)) {
                    fumigator = fumigators.find(d => (d.userId ?? d.UserId) === userId);
                    if (fumigator) {
                        console.log('✅ Fumigator encontrado en lista completa');
                    }
                }
            } catch (fallbackErr) {
                console.warn('⚠️ Error en búsqueda fallback:', fallbackErr.message);
            }
        }
        
        // Si no se encuentra, crear el fumigator
        if (!fumigator) {
            console.log('🆕 Fumigator no encontrado, creando nuevo perfil...');
            
            try {
                const createFumigatorRequest = {
                    UserId: parseInt(userId),
                    FirstName: fumigatorState.currentUser?.firstName ?? fumigatorState.currentUser?.FirstName ?? '',
                    LastName: fumigatorState.currentUser?.lastName ?? fumigatorState.currentUser?.LastName ?? '',
                    LicenseNumber: 'PENDING',
                    Biography: null,
                    Specialty: 'Clinico'
                };
                
                console.log('📤 Enviando solicitud de creación:', createFumigatorRequest);
                fumigator = await Api.post('v1/Fumigator', createFumigatorRequest);
                console.log('✅ Fumigator creado exitosamente');
            } catch (createErr) {
                console.error('❌ Error al crear fumigator:', createErr.message);
                
                // Mostrar notificación al usuario
                try {
                    const { showNotification } = await import('./fumigator-ui.js');
                    showNotification('No se pudo crear el perfil de fumigator. Algunas funcionalidades pueden estar limitadas.', 'warning');
                } catch (notifErr) {
                    console.warn('⚠️ No se pudo mostrar notificación');
                }
                
                // Crear objeto fumigator temporal con los datos del usuario
                fumigator = {
                    firstName: fumigatorState.currentUser?.firstName ?? fumigatorState.currentUser?.FirstName ?? '',
                    FirstName: fumigatorState.currentUser?.firstName ?? fumigatorState.currentUser?.FirstName ?? '',
                    lastName: fumigatorState.currentUser?.lastName ?? fumigatorState.currentUser?.LastName ?? '',
                    LastName: fumigatorState.currentUser?.lastName ?? fumigatorState.currentUser?.LastName ?? '',
                    userId: fumigatorState.currentUser?.userId ?? fumigatorState.currentUser?.UserId,
                    UserId: fumigatorState.currentUser?.userId ?? fumigatorState.currentUser?.UserId,
                    specialty: null,
                    Specialty: null,
                    biography: null,
                    Biography: null,
                    licenseNumber: null,
                    LicenseNumber: null
                };
            }
        }

        // Normalizar objeto fumigator
        if (fumigator) {
            normalizeObject(fumigator, ['fumigatorId', 'firstName', 'lastName', 'specialty', 'biography', 'licenseNumber', 'userId']);
        }
        
        fumigatorState.currentFumigatorData = fumigator;
        
        // Guardar en state global
        try {
            const { state } = await import('../state.js');
            state.fumigatorData = fumigator;
        } catch (stateErr) {
            console.warn('⚠️ No se pudo actualizar state global');
        }
        
        console.log('✅ Datos del fumigator cargados:', fumigator?.fumigatorId || 'sin ID');
        return fumigator;
        
    } catch (error) {
        console.error('❌ Error al cargar datos del fumigator:', error);
        return null;
    }
}