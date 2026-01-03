// ============================================
// PATIENT MAIN - ARCHIVO PRINCIPAL
// ============================================

// Imports de módulos core
import { appState, getAuthenticatedUser, setupUserMenu } from './patient-state.js';
import { loadPatientData } from './patient-data.js';

// Imports de módulos compartidos
import { showNotification } from './patient-notifications.js';
import { initializeSidebarNavigation } from './patient-navigation.js';

// Imports de módulos de inicio
import { updateWelcomeBanner, loadPatientStats } from './patient-dashboard.js';
import { loadPatientAppointments } from './patient-appointments.js';
import { loadRecentPatientHistory } from './patient-history-recent.js';

// Imports de módulos de turnos
import { initializeModals } from './patient-appointment-form.js';

// Imports de módulos de prescripciones
import { initializePrescriptionModal } from './patient-prescriptions.js';
import { loadPatientPrescriptions } from './patient-prescriptions-list.js';

// Imports de filtros
import { initializeFilters } from './patient-filters.js';

// ✅ NUEVO: Imports para estilos y notificaciones
import { initializeUIObserver, forceStyleUpdate } from './patient-ui.js';

// Imports de videollamadas
import { startVideoCallMonitoring, stopVideoCallMonitoring } from './patient-video-call.js';

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
 * Inicializa el panel del paciente
 */
async function initializePatientPanel() {
    await loadUserContext();
    
    // Mostrar nombre apenas carga
    updateWelcomeBanner();

    setupUserMenu();
    initializeSidebarNavigation();
    initializeModals();
    
    // ✅ NUEVO: Inicializar observer de UI para estilos
    initializeUIObserver();

    // Carga inicial
    await loadPatientData();
    
    // ✅ Inicializar monitoreo de videollamadas DESPUÉS de cargar los datos del paciente
    // Esto asegura que appState.currentPatient esté disponible
    if (appState.currentPatient) {
        console.log('📹 Iniciando monitoreo de videollamadas después de cargar datos del paciente...');
        startVideoCallMonitoring();
    } else {
        console.warn('⚠️ No se pudo iniciar el monitoreo de videollamadas: currentPatient no está disponible');
    }
    
    await loadPatientStats();
    await loadPatientAppointments();
    await loadRecentPatientHistory();
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
        
        await loadPatientData();
        await loadPatientAppointments();
        await loadPatientStats();
        await loadRecentPatientHistory();
        
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
    await initializePatientPanel();
});

// Exportar para uso global si es necesario
window.PatientPanel = {
    loadPatientData,
    loadPatientStats,
    loadPatientAppointments,
    loadRecentPatientHistory,
    initializeFilters
};