// doctor-navigation.js
// Módulo para gestión de navegación y cambio entre secciones

/**
 * Inicializa la navegación del sidebar
 */
export async function initializeSidebarNavigation() {
    console.log('🔧 Inicializando navegación del sidebar');
    
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    
    // Limpiar event listeners previos para evitar duplicados
    navItems.forEach(item => {
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);
    });
    
    // Volver a obtener los elementos después de clonar
    const freshNavItems = document.querySelectorAll('.sidebar-nav .nav-item');
    
    freshNavItems.forEach(item => {
        item.addEventListener('click', async function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            // Obtener la sección
            const section = this.getAttribute('data-section');
            console.log('🖱️ Navegación clickeada:', section);
            
            if (!section) {
                console.warn('⚠️ No se encontró data-section en el elemento clickeado');
                return;
            }
            
            setActiveNav(section);
            await handleSectionNavigation(section);
        });
    });

    // Establecer inicio como activo por defecto
    setActiveNav('inicio');
    await handleSectionNavigation('inicio');
    
    console.log('✅ Navegación del sidebar inicializada');
}

/**
 * Maneja la navegación entre secciones
 */
export async function handleSectionNavigation(section) {
    console.log('🔀 Navegando a sección:', section);
    
    const dashboardContent = document.querySelector('.dashboard-content');
    if (!dashboardContent) {
        console.error('❌ No se encontró .dashboard-content');
        return;
    }
    
    // Limpiar secciones dinámicas
    clearDynamicSections(dashboardContent);
    
    const mainDashboard = document.getElementById('mainDashboardSection');
    const profileSection = document.getElementById('doctorProfileSection');

    // Ocultar todas las secciones principales por defecto
    if (mainDashboard) {
        mainDashboard.style.display = 'none';
    }

    if (profileSection) {
        profileSection.style.display = 'none';
        profileSection.classList.add('hidden');
    }

    // Navegar a la sección correspondiente
    try {
        switch (section) {
            case 'inicio':
                await showMainDashboard(mainDashboard, profileSection);
                break;
            case 'perfil':
                await showProfileSection(mainDashboard, profileSection);
                break;
            case 'consultas':
                await loadConsultasSection();
                break;
            case 'historia':
                await loadHistoriaSection();
                break;
            case 'recetas':
                await loadRecetasSection();
                break;
            case 'agenda':
                await loadAgendaSection();
                break;
            case 'pacientes':
                await loadPacientesSection();
                break;
            default:
                console.warn('⚠️ Sección desconocida:', section);
                await showMainDashboard(mainDashboard, profileSection);
        }
        try {
            const { initializeAttendButtons, initializeDoctorRescheduleModal } = 
                await import('./doctor-appointments.js');

            initializeAttendButtons();
            initializeDoctorRescheduleModal();
        } catch (e) {
            console.warn("⚠ No se pudieron inicializar botones de reprogramación:", e);
        }
        console.log('✅ Navegación completada a:', section);
    } catch (error) {
        console.error('❌ Error al navegar a', section, ':', error);
        showNotificationError(`Error al cargar la sección: ${error.message}`);
    }

}

/**
 * Limpia las secciones dinámicas del dashboard
 */
function clearDynamicSections(dashboardContent) {
    const dynamicSections = [
        '.agenda-section',
        '.coming-soon-section',
        '.patients-section',
        '.consultas-section',
        '.prescriptions-section',
        '.clinical-history-section',
        '.patient-profile-section'
    ];
    
    dynamicSections.forEach(selector => {
        const sections = dashboardContent.querySelectorAll(selector);
        sections.forEach(section => section.remove());
    });
}

/**
 * Muestra el dashboard principal
 */
async function showMainDashboard(mainDashboard, profileSection) {
    console.log('🏠 Mostrando dashboard principal');
    
    if (mainDashboard) {
        mainDashboard.style.display = 'block';
        mainDashboard.classList.remove('hidden');
        console.log('✅ mainDashboard.style.display =', mainDashboard.style.display);
    }
    if (profileSection) {
        profileSection.style.display = 'none';
        profileSection.classList.add('hidden');
    }
    
    // Recargar estadísticas
    try {
        const { loadDoctorStats } = await import('./doctor-main.js');
        await loadDoctorStats();
    } catch (error) {
        console.warn('⚠️ Error al cargar estadísticas:', error);
    }
}

/**
 * Muestra la sección de perfil
 */
async function showProfileSection(mainDashboard, profileSection) {
    console.log('👤 Mostrando sección de perfil');
    
    if (mainDashboard) {
        mainDashboard.style.display = 'none';
    }
    
    if (profileSection) {
        try {
            const { state } = await import('../state.js');
            const currentDoctorData = state.doctorData;
            
            if (!currentDoctorData) {
                const { loadDoctorData } = await import('./doctor-core.js');
                await loadDoctorData();
            }
            
            const { updateDoctorProfileSection, setProfileFormEditable } = await import('./doctor-ui.js');
            updateDoctorProfileSection(currentDoctorData);
            profileSection.classList.remove('hidden');
            profileSection.style.display = '';
            
            setProfileFormEditable(false);
        } catch (error) {
            console.error('❌ Error al cargar perfil:', error);
            showNotificationError('Error al cargar el perfil');
        }
    }
}

/**
 * Carga la sección de consultas
 */
async function loadConsultasSection() {
    console.log('📋 Cargando sección de consultas');
    
    try {
        const { loadTodayConsultationsView } = await import('./doctor-appointments.js');
        await loadTodayConsultationsView();
    } catch (error) {
        console.error('❌ Error al cargar consultas:', error);
        showNotificationError('Error al cargar las consultas');
    }
}

/**
 * Carga la sección de historia clínica
 */
async function loadHistoriaSection() {
    console.log('📊 Cargando sección de historia clínica');
    
    try {
        const { loadClinicalHistoryView } = await import('./doctor-clinical.js');
        await loadClinicalHistoryView();
    } catch (error) {
        console.error('❌ Error al cargar historia clínica:', error);
        showNotificationError('Error al cargar la historia clínica');
    }
}

/**
 * Carga la sección de recetas
 */
async function loadRecetasSection() {
    console.log('💊 Cargando sección de recetas');
    
    try {
        const { loadPrescriptionsView } = await import('./doctor-prescriptions.js');
        await loadPrescriptionsView();
    } catch (error) {
        console.error('❌ Error al cargar recetas:', error);
        showNotificationError('Error al cargar las recetas');
    }
}

/**
 * Carga la sección de agenda
 */
async function loadAgendaSection() {
    console.log('📅 Cargando sección de agenda');
    
    try {
        const { loadAgendaView } = await import('./doctor-schedule.js');
        await loadAgendaView();
    } catch (error) {
        console.error('❌ Error al cargar agenda:', error);
        showNotificationError('Error al cargar la agenda');
    }
}

/**
 * Carga la sección de pacientes
 */
async function loadPacientesSection() {
    console.log('👥 Cargando sección de pacientes');
    
    try {
        const { loadPatientsView } = await import('./doctor-appointments.js');
        await loadPatientsView();
    } catch (error) {
        console.error('❌ Error al cargar pacientes:', error);
        showNotificationError('Error al cargar los pacientes');
    }
}

/**
 * Establece la navegación activa
 */
export function setActiveNav(section) {
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
    navItems.forEach(item => {
        const itemSection = item.getAttribute('data-section');
        if (itemSection === section) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

/**
 * Inicializa acciones rápidas
 */
export function initializeQuickActions() {
    console.log('⚡ Inicializando acciones rápidas');
    
    const emitPrescriptionBtn = document.getElementById('emitPrescription');
    const viewPatientsBtn = document.getElementById('viewPatients');
    const manageScheduleBtn = document.getElementById('manageSchedule');
    
    if (emitPrescriptionBtn) {
        // Remover listener previo
        const newBtn = emitPrescriptionBtn.cloneNode(true);
        emitPrescriptionBtn.parentNode.replaceChild(newBtn, emitPrescriptionBtn);
        
        newBtn.addEventListener('click', async function() {
            console.log('💊 Abriendo modal de receta');
            try {
                const { openPrescriptionModal } = await import('./doctor-prescriptions.js');
                openPrescriptionModal();
            } catch (error) {
                console.error('❌ Error al abrir modal de receta:', error);
            }
        });
    }
    
    if (viewPatientsBtn) {
        const newBtn = viewPatientsBtn.cloneNode(true);
        viewPatientsBtn.parentNode.replaceChild(newBtn, viewPatientsBtn);
        
        newBtn.addEventListener('click', function() {
            console.log('👥 Navegando a pacientes');
            setActiveNav('pacientes');
            handleSectionNavigation('pacientes');
        });
    }
    
    if (manageScheduleBtn) {
        const newBtn = manageScheduleBtn.cloneNode(true);
        manageScheduleBtn.parentNode.replaceChild(newBtn, manageScheduleBtn);
        
        newBtn.addEventListener('click', async function() {
            console.log('📅 Abriendo gestor de agenda');
            try {
                const { openScheduleManager } = await import('./doctor-schedule.js');
                await openScheduleManager();
            } catch (error) {
                console.error('❌ Error al abrir gestor de agenda:', error);
            }
        });
    }
}

/**
 * Navega a una sección específica (función pública para uso externo)
 */
export async function navigateToSection(section) {
    setActiveNav(section);
    await handleSectionNavigation(section);
}

/**
 * Muestra una notificación de error
 */
function showNotificationError(message) {
    try {
        const { showNotification } = require('./doctor-ui.js');
        showNotification(message, 'error');
    } catch {
        console.error('❌', message);
        alert(message);
    }
}