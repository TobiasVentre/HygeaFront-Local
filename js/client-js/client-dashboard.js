// ============================================
// DASHBOARD - PANTALLA DE INICIO
// ============================================

import { appState, getUserDisplayName } from './client-state.js';
import { showNotification } from './client-notifications.js';

/**
 * Actualiza el banner de bienvenida
 */
export function updateWelcomeBanner() {
    const welcomeNameElement = document.getElementById('welcome-name');
    const welcomeMessageElement = document.getElementById('welcome-message');
    const userMenuName = document.getElementById('userMenuName');
    const displayName = getUserDisplayName();
    
    console.log("=== ACTUALIZANDO BANNER DE BIENVENIDA ===");
    console.log("displayName:", displayName);

    if (welcomeNameElement) {
        const greeting = displayName ? `Hola, ${displayName}` : 'Hola';
        welcomeNameElement.textContent = greeting;
    }

    if (welcomeMessageElement && !welcomeMessageElement.dataset.custom) {
        welcomeMessageElement.textContent = 'Aquí está el resumen de tu atención';
    }

    if (userMenuName) {
        userMenuName.textContent = appState.currentUser?.firstName ? appState.currentUser.firstName : 'Mi cuenta';
    }
}

/**
 * Carga las estadísticas del cliente
 */
export async function loadClientStats() {
    try {
        const clientId = appState.currentClient?.clientId;
        if (!clientId) {
            console.warn('No hay clientId disponible para cargar estadísticas');
            return;
        }

        // RUTA CORREGIDA: api.js está en js/
        const { ApiScheduling, ApiClinical } = await import('../api.js');
        const now = new Date();
        
        // 1. Cargar turnos confirmados (futuros)
        let confirmedAppointmentsCount = 0;
        try {
            const appointmentsResponse = await ApiScheduling.get(`Appointments?clientId=${clientId}`);
            const appointments = Array.isArray(appointmentsResponse)
                ? appointmentsResponse
                : (appointmentsResponse?.value || appointmentsResponse || []);
            
            confirmedAppointmentsCount = appointments.filter(apt => {
                const status = (apt.status || apt.Status || '').toUpperCase();
                const startTime = new Date(apt.startTime || apt.StartTime);
                return (status === 'SCHEDULED' || status === 'CONFIRMED' || status === 'IN_PROGRESS') 
                    && startTime >= now;
            }).length;
        } catch (error) {
            console.warn('Error al cargar appointments para estadísticas:', error);
        }
        
        // 2. Cargar consultas del año actual
        let consultationsThisYear = 0;
        try {
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            const endOfYear = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
            
            const encountersResponse = await ApiClinical.get(`v1/Encounter?clientId=${clientId}&from=${startOfYear.toISOString()}&to=${endOfYear.toISOString()}`);
            const encounters = Array.isArray(encountersResponse)
                ? encountersResponse
                : (encountersResponse?.value || encountersResponse || []);
            
            consultationsThisYear = encounters.length;
        } catch (error) {
            console.warn('Error al cargar encounters para estadísticas:', error);
        }
        
        // 3. Cargar recetas/adjuntos disponibles
        let availablePrescriptions = 0;
        try {
            const attachmentsResponse = await ApiClinical.get(`v1/clients/${clientId}/attachments`);
            const attachments = Array.isArray(attachmentsResponse)
                ? attachmentsResponse
                : (attachmentsResponse?.value || attachmentsResponse || []);
            
            availablePrescriptions = attachments.length;
        } catch (error) {
            console.warn('Error al cargar attachments para estadísticas:', error);
            
            // Alternativa: usar encounters completados
            try {
                const oneYearAgo = new Date(now.getFullYear() - 1, 0, 1);
                const encountersResponse = await ApiClinical.get(`v1/Encounter?clientId=${clientId}&from=${oneYearAgo.toISOString()}&to=${now.toISOString()}`);
                const encounters = Array.isArray(encountersResponse)
                    ? encountersResponse
                    : (encountersResponse?.value || encountersResponse || []);
                
                availablePrescriptions = encounters.filter(enc => {
                    const status = (enc.status || enc.Status || '').toLowerCase();
                    return status === 'completed' || status === 'completado' || 
                           (enc.prescription || enc.Prescription) ||
                           (enc.plan || enc.Plan);
                }).length;
            } catch (err) {
                console.warn('Error al cargar encounters alternativos:', err);
            }
        }
        
        // Actualizar tarjetas de resumen
        const confirmedAppointmentsEl = document.getElementById('confirmed-appointments');
        const consultationsYearEl = document.getElementById('consultations-year');
        const activePrescriptionsEl = document.getElementById('active-prescriptions');
        
        if (confirmedAppointmentsEl) {
            confirmedAppointmentsEl.textContent = confirmedAppointmentsCount;
        }
        if (consultationsYearEl) {
            consultationsYearEl.textContent = consultationsThisYear;
        }
        if (activePrescriptionsEl) {
            activePrescriptionsEl.textContent = availablePrescriptions;
        }
        
        console.log('Estadísticas cargadas:', {
            confirmedAppointments: confirmedAppointmentsCount,
            consultationsThisYear: consultationsThisYear,
            availablePrescriptions: availablePrescriptions
        });
        
    } catch (error) {
        console.error('Error al cargar estadísticas:', error);
    }
}