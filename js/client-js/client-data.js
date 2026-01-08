// ============================================
// GESTIÓN DE DATOS DEL CLIENTE
// ============================================

import { appState } from './client-state.js';
import { normalizeClient } from './client-utils.js';
import { showNotification } from './client-notifications.js';
import { updateWelcomeBanner } from './client-dashboard.js';

/**
 * Carga datos del cliente desde el backend
 */
export async function loadClientData() {
    try {
        if (!appState.currentUser) {
            const { getAuthenticatedUser } = await import('./client-state.js');
            appState.currentUser = await getAuthenticatedUser();
            if (!appState.currentUser) {
                window.location.href = 'login.html';
                return;
            }
        }

        // RUTA CORREGIDA: api.js está en js/
        const { Api } = await import('../api.js');
        const clientResponse = await Api.get(`v1/Client/User/${appState.currentUser.userId}`);
        
        console.log("=== CLIENTE OBTENIDO DEL BACKEND ===");
        console.log("Respuesta completa:", clientResponse);
        
        appState.currentClient = normalizeClient(clientResponse);
        
        console.log("=== CLIENTE NORMALIZADO ===");
        console.log("Datos completos:", appState.currentClient);

        updateWelcomeBanner();

        const profileSection = document.querySelector('.profile-section');
        if (profileSection && !profileSection.classList.contains('hidden')) {
            const { loadClientProfile } = await import('./client-profile.js');
            loadClientProfile();
        }

    } catch (error) {
        console.error('Error al cargar datos del cliente:', error);
        showNotification('No pudimos cargar tus datos. Revisa tu conexión e intenta nuevamente.', 'error');
    }
}