// ============================================
// ESTADO GLOBAL DE LA APLICACIÓN
// ============================================

/**
 * Estado global de la aplicación
 */
export const appState = {
    currentUser: null,
    currentClient: null,
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
    appState.currentClient = null;
}

/**
 * Obtiene el nombre completo para mostrar
 */
export function getUserDisplayName() {
    // Prioridad 1: Nombre completo del cliente
    if (appState.currentClient) {
        const clientFirstName = appState.currentClient.name ?? appState.currentClient.firstName ?? '';
        const clientLastName = appState.currentClient.lastName ?? '';
        const clientFullName = [clientFirstName, clientLastName].filter(Boolean).join(' ').trim();
        
        if (clientFullName) {
            return clientFullName;
        }
    }

    // Prioridad 2: Nombre completo del usuario actual
    const userFirstName = appState.currentUser?.firstName ?? '';
    const userLastName = appState.currentUser?.lastName ?? '';
    const userFullName = [userFirstName, userLastName].filter(Boolean).join(' ').trim();

    if (userFullName) {
        return userFullName;
    }

    // Prioridad 3: Solo el nombre del cliente
    if (appState.currentClient?.name) {
        return appState.currentClient.name;
    }

    // Prioridad 4: Solo el nombre del usuario
    if (appState.currentUser?.firstName) {
        return appState.currentUser.firstName;
    }

    // Último recurso: Email o 'Cliente'
    if (appState.currentUser?.email) {
        return appState.currentUser.email.split('@')[0];
    }

    return 'Cliente';
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
                const { stopVideoCallMonitoring } = await import('./client-video-call.js');
                stopVideoCallMonitoring();
            } catch (error) {
                console.warn('⚠️ No se pudo detener el monitoreo de videollamadas:', error);
            }
            
            logout();
            window.location.href = 'login.html';
        });
    }
}