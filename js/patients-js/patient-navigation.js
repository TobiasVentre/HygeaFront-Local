// ============================================
// NAVEGACIÓN DEL SIDEBAR
// ============================================

import { applyStylesForSection } from './patient-ui.js';

/**
 * Inicializa la navegación del sidebar
 */
export function initializeSidebarNavigation() {
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            
            navItems.forEach(navItem => navItem.classList.remove('active'));
            this.classList.add('active');
            
            const section = this.getAttribute('data-section');
            handleSectionNavigation(section);
        });
    });
}

/**
 * Maneja la navegación entre secciones
 */
export async function handleSectionNavigation(section) {
    const dashboardContent = document.querySelector('.dashboard-content');
    if (!dashboardContent) return;
    
    // Limpiar vistas previas
    const fullHistory = dashboardContent.querySelectorAll('.history-full-section');
    fullHistory.forEach(h => h.remove());
    const fullPrescriptions = dashboardContent.querySelectorAll('.prescriptions-full-section');
     fullPrescriptions.forEach(h => h.remove());
    
    const allSections = dashboardContent.querySelectorAll('.dashboard-section, .welcome-section, .summary-cards');
    allSections.forEach(sec => {
        if (!sec.classList.contains('profile-section')) {
            sec.style.display = 'none';
        }
    });
    
    const existingProfiles = dashboardContent.querySelectorAll('.profile-section');
    existingProfiles.forEach(profile => profile.remove());
    
    const comingSoon = dashboardContent.querySelector('.coming-soon-section');
    if (comingSoon) comingSoon.remove();
    
    switch(section) {
        case 'inicio':
            allSections.forEach(sec => {
                if (!sec.classList.contains('profile-section') && !sec.classList.contains('coming-soon-section')) {
                    sec.style.display = '';
                }
            });
            // Cargar datos de inicio
            const { loadPatientData } = await import('./patient-data.js');
            const { loadPatientAppointments } = await import('./patient-appointments.js');
            const { loadRecentPatientHistory } = await import('./patient-history-recent.js');
            
            await loadPatientData();
            await loadPatientAppointments();
            await loadRecentPatientHistory();
            
            // ✅ Aplicar estilos después de cargar
            applyStylesForSection('inicio');
            break;
            
        case 'perfil':
            const { loadPatientProfile } = await import('./patient-profile.js');
            await loadPatientProfile();
            
            // No aplica estilos en perfil
            applyStylesForSection('perfil');
            break;
            
        case 'turnos':
            const turnosSection = dashboardContent.querySelector('.dashboard-section');
            if (turnosSection) {
                turnosSection.style.display = '';
            }
            const { loadPatientAppointments: loadAppointmentsFull } = await import('./patient-appointments.js');
            await loadAppointmentsFull();
            
            // ✅ Aplicar estilos después de cargar
            applyStylesForSection('turnos');
            break;
            
        case 'historial':
            allSections.forEach(sec => {
                if (sec.classList.contains('history-full-section')) {
                    sec.style.display = '';
                } else if (!sec.classList.contains('profile-section') && !sec.classList.contains('coming-soon-section')) {
                    sec.style.display = 'none';
                }
            });
            
            let historyFullSection = dashboardContent.querySelector('.history-full-section');
            if (!historyFullSection) {
                historyFullSection = document.createElement('div');
                historyFullSection.className = 'dashboard-section history-full-section';
                historyFullSection.innerHTML = `
                    <div class="section-header">
                        <div>
                            <h3>Historial Médico Completo</h3>
                            <p>Todas tus consultas realizadas</p>
                        </div>
                    </div>
                    <div class="history-list" id="history-list-full">
                        <div class="loading-spinner">
                            <i class="fas fa-spinner fa-spin"></i>
                            <p>Cargando historial médico...</p>
                        </div>
                    </div>
                `;
                dashboardContent.appendChild(historyFullSection);
            } else {
                historyFullSection.style.display = '';
            }
            
            const { loadPatientHistoryFull } = await import('./patient-history.js');
            await loadPatientHistoryFull();
            
            // No aplica estilos en historial
            applyStylesForSection('historial');
            break;

        case 'recetas':
            // Ocultar todas las secciones excepto la de recetas
            allSections.forEach(sec => {
                if (sec.classList.contains('prescriptions-full-section')) {
                    sec.style.display = '';
                } else if (!sec.classList.contains('profile-section') && !sec.classList.contains('coming-soon-section')) {
                    sec.style.display = 'none';
                }
            });
            
            // Crear o mostrar sección de recetas
            let prescriptionsFullSection = dashboardContent.querySelector('.prescriptions-full-section');
            if (!prescriptionsFullSection) {
                prescriptionsFullSection = document.createElement('div');
                prescriptionsFullSection.className = 'dashboard-section prescriptions-full-section';
                prescriptionsFullSection.innerHTML = `
                    <div class="section-header">
                        <div>
                            <h3>Mis Recetas Médicas</h3>
                            <p>Todas tus recetas y prescripciones médicas</p>
                        </div>
                        <div class="section-header-actions">
                            <button class="btn btn-secondary" id="refreshPrescriptions">
                                <i class="fas fa-sync-alt"></i>
                                Actualizar
                            </button>
                        </div>
                    </div>
                    <div class="prescriptions-list" id="prescriptions-list-full">
                        <div class="loading-spinner">
                            <i class="fas fa-spinner fa-spin"></i>
                            <p>Cargando recetas médicas...</p>
                        </div>
                    </div>
                `;
                dashboardContent.appendChild(prescriptionsFullSection);
                
                // Agregar evento al botón de actualizar
                setTimeout(() => {
                    const refreshBtn = document.getElementById('refreshPrescriptions');
                    if (refreshBtn) {
                        refreshBtn.addEventListener('click', async () => {
                            const { loadPatientPrescriptions } = await import('./patient-prescriptions-list.js');
                            await loadPatientPrescriptions();
                        });
                    }
                }, 100);
            } else {
                prescriptionsFullSection.style.display = '';
            }
            
            // Cargar las recetas
            const { loadPatientPrescriptions } = await import('./patient-prescriptions-list.js');
            await loadPatientPrescriptions();
            
            // No aplica estilos en recetas
            applyStylesForSection('recetas');
            break;    
            
        default:
            allSections.forEach(sec => {
                if (!sec.classList.contains('profile-section') && !sec.classList.contains('coming-soon-section')) {
                    sec.style.display = '';
                }
            });
            
            applyStylesForSection('default');
    }
}