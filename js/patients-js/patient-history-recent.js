// ============================================
// PATIENT HISTORY RECENT - VERSION DEBUG
// ============================================

import { appState, getAuthenticatedUser } from './patient-state.js';
import { normalizePatient } from './patient-utils.js';

/**
 * Carga historial médico reciente (3 últimas consultas para inicio)
 */
export async function loadRecentPatientHistory() {
    const historyList = document.getElementById("history-list-inicio");
    if (!historyList) {
        console.warn('⚠️ Contenedor history-list-inicio no encontrado');
        return;
    }

    try {
        const patientId = appState.currentPatient?.patientId;
        if (!patientId) {
            console.warn('⚠️ No hay patientId disponible');
            historyList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-medical"></i>
                    <p>No hay historial médico disponible</p>
                </div>`;
            return;
        }

        const { ApiClinical, Api } = await import('../api.js');

        const now = new Date();
        const from = new Date(now.getFullYear() - 1, 0, 1);

        console.log('🔍 Cargando historial reciente para patientId:', patientId);
        console.log('📅 Rango de fechas:', from.toISOString(), 'hasta', now.toISOString());

        const response = await ApiClinical.get(
            `v1/Encounter?patientId=${patientId}&from=${from.toISOString()}&to=${now.toISOString()}`
        );

        const encounters = Array.isArray(response) ? response : response?.value || [];

        console.log('✅ Encounters recibidos del backend:', encounters.length);
        
        // 🔍 DEBUG: Mostrar todos los encounters recibidos
        console.log('📋 Datos completos de encounters:', encounters);

        if (!encounters.length) {
            historyList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-medical"></i>
                    <p>No hay consultas recientes</p>
                </div>`;
            return;
        }

        // ============================================
        // 🔥 SIMPLIFICADO: Mostrar todas las consultas (sin filtrar por fecha pasada)
        // ============================================
        const validEncounters = encounters.filter(e => {
            // Obtener la fecha del encounter (PRIMERO Date con mayúscula)
            const dateValue = e.Date || e.date;
            
            if (!dateValue) {
                console.warn('⚠️ Encounter sin fecha:', e);
                return false;
            }

            const encounterDate = new Date(dateValue);
            
            // Verificar que sea una fecha válida
            if (isNaN(encounterDate.getTime())) {
                console.warn('⚠️ Fecha inválida:', dateValue, 'en encounter:', e);
                return false;
            }

            console.log('✅ Encounter válido con fecha:', encounterDate.toLocaleDateString('es-AR'), e);
            return true;
        });

        console.log("📉 Consultas con fecha válida:", validEncounters.length);

        if (!validEncounters.length) {
            historyList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-medical"></i>
                    <p>No hay consultas con fecha válida</p>
                </div>`;
            return;
        }

        // Ordenar por fecha descendente y tomar solo 3
        const lastThree = validEncounters
            .sort((a, b) => {
                const dateA = new Date(a.Date || a.date).getTime();
                const dateB = new Date(b.Date || b.date).getTime();
                return dateB - dateA; // Orden descendente (más reciente primero)
            })
            .slice(0, 3);

        console.log('📊 Últimas 3 consultas seleccionadas:', lastThree.map(e => ({
            encounterId: e.EncounterId || e.encounterId,
            date: new Date(e.Date || e.date).toLocaleString('es-AR'),
            assessment: e.Assessment || e.assessment
        })));

        // Obtener info de doctores
        const doctorIds = [...new Set(lastThree.map(e => e.DoctorId || e.doctorId))];
        const doctorsMap = new Map();

        console.log('👨‍⚕️ Cargando información de', doctorIds.length, 'doctores');

        for (const id of doctorIds) {
            try {
                const d = await Api.get(`v1/Doctor/${id}`);
                const fullName = `Dr. ${d.firstName || d.FirstName || ''} ${d.lastName || d.LastName || ''}`.trim();
                doctorsMap.set(id, fullName || `Dr. ${id}`);
            } catch (err) {
                console.warn(`⚠️ Error al cargar doctor ${id}:`, err);
                doctorsMap.set(id, `Dr. ${id}`);
            }
        }

        // Renderizar últimas 3 consultas
        historyList.innerHTML = lastThree
            .map(enc => {
                // IMPORTANTE: Usar primero las propiedades con mayúscula (como vienen de la BD)
                const encounterId = enc.EncounterId || enc.encounterId;
                const appointmentId = enc.AppointmentId || enc.appointmentId;
                const patientId = enc.PatientId || enc.patientId;
                const date = new Date(enc.Date || enc.date);
                const doctorName = doctorsMap.get(enc.DoctorId || enc.doctorId) || 'Dr. Desconocido';
                const assessment = enc.Assessment || enc.assessment || 'Sin diagnóstico';
                
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}`;

                return `
                    <div class="history-compact-card">
                        <div class="history-compact-content">
                            <div class="history-compact-left">
                                <div class="history-compact-date">
                                    <i class="fas fa-calendar-alt"></i>
                                    ${dateStr}
                                    <span class="history-doctor-separator">|</span>
                                    <i class="fas fa-user-md"></i>
                                    ${doctorName}
                                </div>
                                <div class="history-compact-reason"><strong>Diagnóstico: </strong>${assessment}</div>
                            </div>
                        </div>
                        <button class="btn-history-view" onclick="viewPrescription(${encounterId || 'null'}, ${appointmentId || 'null'}, ${patientId || 'null'})">
                            <i class="fas fa-file-prescription"></i>
                            Ver Receta
                        </button>
                    </div>
                `;
            })
            .join("");

        console.log('✅ Historial reciente renderizado exitosamente');

    } catch (error) {
        console.error('❌ Error cargando historial médico reciente:', error);
        historyList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error cargando historial médico</p>
            </div>`;
    }
}

// Botón de refresh
export function initializeRefreshButton() {
    const refreshBtn = document.getElementById('refreshRecentHistory');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            console.log('🔄 Refresh manual activado');
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
            
            await loadRecentPatientHistory();
            
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Actualizar';
            
            showNotification('Historial actualizado', 'success');
        });
    }
}

window.initializeRefreshButton = initializeRefreshButton;