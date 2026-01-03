// ============================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ============================================

/**
 * Estado global de la aplicación
 */
export const appState = {
    currentUser: null,
    currentPatient: null,
    autoRefreshInterval: null
};

/**
 * Carga el usuario desde localStorage
 */
export function loadUserFromStorage() {
    try {
        const userData = localStorage.getItem('user');
        const token = localStorage.getItem('token');
        
        if (userData && token) {
            appState.currentUser = JSON.parse(userData);
            return appState.currentUser;
        }
    } catch (error) {
        console.error('Error al cargar usuario:', error);
    }
    return null;
}

/**
 * Obtiene el usuario autenticado
 */
export async function getAuthenticatedUser() {
    if (appState.currentUser) {
        return appState.currentUser;
    }
    return loadUserFromStorage();
}

/**
 * Cierra sesión
 */
export function logout() {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    appState.currentUser = null;
    appState.currentPatient = null;
}

/**
 * Obtiene el nombre completo para mostrar
 */
export function getUserDisplayName() {
    // Prioridad 1: Nombre completo del paciente
    if (appState.currentPatient) {
        const patientFirstName = appState.currentPatient.name ?? appState.currentPatient.firstName ?? '';
        const patientLastName = appState.currentPatient.lastName ?? '';
        const patientFullName = [patientFirstName, patientLastName].filter(Boolean).join(' ').trim();
        
        if (patientFullName) {
            return patientFullName;
        }
    }

    // Prioridad 2: Nombre completo del usuario actual
    const userFirstName = appState.currentUser?.firstName ?? '';
    const userLastName = appState.currentUser?.lastName ?? '';
    const userFullName = [userFirstName, userLastName].filter(Boolean).join(' ').trim();

    if (userFullName) {
        return userFullName;
    }

    // Prioridad 3: Solo el nombre del paciente
    if (appState.currentPatient?.name) {
        return appState.currentPatient.name;
    }

    // Prioridad 4: Solo el nombre del usuario
    if (appState.currentUser?.firstName) {
        return appState.currentUser.firstName;
    }

    // Último recurso: Email o 'Paciente'
    if (appState.currentUser?.email) {
        return appState.currentUser.email.split('@')[0];
    }

    return 'Paciente';
}

/**
 * Configura el menú de usuario
 */
export function setupUserMenu() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (event) => {
            event.preventDefault();
            
            // Detener el monitoreo de videollamadas antes de cerrar sesión
            try {
                const { stopVideoCallMonitoring } = await import('./patient-video-call.js');
                stopVideoCallMonitoring();
            } catch (error) {
                console.warn('⚠️ No se pudo detener el monitoreo de videollamadas:', error);
            }
            
            logout();
            window.location.href = 'login.html';
        });
    }
}