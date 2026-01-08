// ============================================
// CLIENT MAIN - ARCHIVO PRINCIPAL
// ============================================

// Imports de módulos core
import { appState, getAuthenticatedUser, setupUserMenu } from './client-state.js';
import { loadClientData } from './client-data.js';

// Imports de módulos compartidos
import { showNotification } from './client-notifications.js';
import { initializeSidebarNavigation } from './client-navigation.js';

// Imports de módulos de inicio
import { updateWelcomeBanner, loadClientStats } from './client-dashboard.js';
import { loadClientAppointments } from './client-appointments.js';
import { loadRecentClientHistory } from './client-history-recent.js';

// Imports de módulos de turnos
import { initializeModals } from './client-appointment-form.js';

// Imports de módulos de prescripciones
import { initializePrescriptionModal } from './client-prescriptions.js';
import { loadClientPrescriptions } from './client-prescriptions-list.js';

// Imports de filtros
import { initializeFilters } from './client-filters.js';

// ✅ NUEVO: Imports para estilos y notificaciones
import { initializeUIObserver, forceStyleUpdate } from './client-ui.js';

// Imports de videollamadas
import { startVideoCallMonitoring, stopVideoCallMonitoring } from './client-video-call.js';

/**
 * Carga el contexto del usuario
 */
async function loadUserContext() {
    appState.currentUser = await getAuthenticatedUser();

    if (!appState.currentUser) {
        window.location.href = 'login.html';
        return;
    }
}

/**
 * Inicializa el panel del cliente
 */
async function initializeClientPanel() {
    await loadUserContext();
    
    // Mostrar nombre apenas carga
    updateWelcomeBanner();

    setupUserMenu();
    initializeSidebarNavigation();
    initializeModals();
    
    // ✅ NUEVO: Inicializar observer de UI para estilos
    initializeUIObserver();

    // Carga inicial
    await loadClientData();
    
    // ✅ Inicializar monitoreo de videollamadas DESPUÉS de cargar los datos del cliente
    // Esto asegura que appState.currentClient esté disponible
    if (appState.currentClient) {
        console.log('📹 Iniciando monitoreo de videollamadas después de cargar datos del cliente...');
        startVideoCallMonitoring();
    } else {
        console.warn('⚠️ No se pudo iniciar el monitoreo de videollamadas: currentClient no está disponible');
    }
    
    await loadClientStats();
    await loadClientAppointments();
    await loadRecentClientHistory();
    await initializeFilters();
    
    // ✅ NUEVO: Forzar aplicación de estilos después de cargar
    setTimeout(() => {
        forceStyleUpdate();
    }, 500);
    
    // Cargar recetas recientes (solo si el contenedor existe en el HTML)
    const prescriptionsHomeContainer = document.getElementById('prescriptions-home-list');
    if (prescriptionsHomeContainer) {
        // await renderPrescriptionsHome(); // Si tienes esta función
    }

    // Auto refresco cada 10 segundos
    if (appState.autoRefreshInterval) {
        clearInterval(appState.autoRefreshInterval);
    }

    appState.autoRefreshInterval = setInterval(async () => {
        console.log('🔄 Auto-refresh ejecutándose...');
        
        await loadClientData();
        await loadClientAppointments();
        await loadClientStats();
        await loadRecentClientHistory();
        
        // ✅ NUEVO: Re-aplicar estilos después del refresh
        setTimeout(() => {
            forceStyleUpdate();
        }, 300);
        
        // Refrescar recetas en home si existe el contenedor
        const prescriptionsHomeContainer = document.getElementById('prescriptions-home-list');
        if (prescriptionsHomeContainer) {
            // await renderPrescriptionsHome();
        }
        
        console.log('✅ Auto-refresh completado');
    }, 10000);
}

// Inicialización cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', async () => {
    await initializeClientPanel();
});

// Exportar para uso global si es necesario
window.ClientPanel = {
    loadClientData,
    loadClientStats,
    loadClientAppointments,
    loadRecentClientHistory,
    initializeFilters
};