// doctor-main.js
// Módulo principal para inicializar el panel del doctor

import { 
    doctorState,
    loadDoctorContext, 
    loadDoctorData,
    getId,
    getValue,
    formatTime
} from './doctor-core.js';

import { 
    updateDoctorHeader 
} from './doctor-ui.js';

import { 
    initializeSidebarNavigation, 
    initializeQuickActions 
} from './doctor-navigation.js';

import { 
    initializeConsultationDateFilter,
    createConsultationItemElement,
    initializeDoctorRescheduleModal
} from './doctor-appointments.js';

import { 
    initializeProfileEditing 
} from './doctor-profile.js';

import { 
    initializePrescriptionModal 
} from './doctor-prescriptions.js';

/**
 * Inicializa el panel del doctor
 */
export async function initializeDoctorPanel() {
    console.log('🚀 Inicializando panel del doctor...');
    
    try {
        // 1. Cargar contexto del usuario
        await loadDoctorContext();
        
        // 2. Esperar un momento si los datos no están listos
        if (!doctorState.currentUser?.firstName || !doctorState.currentUser?.lastName) {
            await new Promise(resolve => setTimeout(resolve, 500));
            const { state } = await import('../state.js');
            doctorState.currentUser = state.user;
        }
        
        // 3. Cargar datos del doctor
        const doctorData = await loadDoctorData();
        
        // 4. Actualizar header
        updateDoctorHeader(doctorData);
        
        // 5. Inicializar navegación del sidebar
        await initializeSidebarNavigation();
        
        // 6. Inicializar acciones rápidas
        initializeQuickActions();
        
        // 7. Inicializar modal de receta
        initializePrescriptionModal();
        
        // 8. Inicializar funcionalidad de editar perfil
        initializeProfileEditing();

        // 9. Inicializar modal de reagendamiento de cita
        initializeDoctorRescheduleModal();
        
        // 10. Inicializar filtro de fecha para historial de consultas
        initializeConsultationDateFilter();
        
        // 11. Cargar estadísticas y datos del dashboard inicial
        await loadDoctorStats();
        await loadTodayConsultationsForDashboard();
        await loadWeeklySchedule();
        initializeDoctorRescheduleModal();

        // 12. Cargar datos periódicamente (cada 30 segundos)
        setInterval(async () => {
            await loadDoctorData();
            await loadDoctorStats();
            await loadTodayConsultationsForDashboard();
            await loadWeeklySchedule();
        }, 30000);
        
        console.log('✅ Panel del doctor inicializado correctamente');
        
    } catch (error) {
        console.error('❌ Error en la inicialización del panel del doctor:', error);
        updateDoctorHeader(null);
    }
}

/**
 * Carga las estadísticas del doctor
 */
export async function loadDoctorStats() {
    try {
        const doctorId = doctorState.currentDoctorData?.doctorId;
        if (!doctorId) {
            console.warn('No hay doctorId disponible para cargar estadísticas');
            return;
        }

        const { ApiScheduling } = await import('../api.js');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);
        
        const todayAppointmentsResponse = await ApiScheduling.get(
            `Appointments?doctorId=${doctorId}&startTime=${today.toISOString()}&endTime=${tomorrow.toISOString()}`
        );
        
        const todayAppointments = todayAppointmentsResponse?.filter(a => {
            const status = a.status || a.Status;
            return status === 'SCHEDULED' || status === 'CONFIRMED' || status === 'IN_PROGRESS';
        }) || [];
        
        const weekAppointments = await ApiScheduling.get(
            `Appointments?doctorId=${doctorId}&startTime=${today.toISOString()}&endTime=${nextWeek.toISOString()}`
        );
        
        // Actualizar tarjetas de resumen
        const patientsToday = document.getElementById('patients-today');
        const weeklyAppointments = document.getElementById('weekly-appointments');
        const activeConsultation = document.getElementById('active-consultation');
        const prescriptionsToday = document.getElementById('prescriptions-today');
        
        if (patientsToday) {
            patientsToday.textContent = todayAppointments?.length || 0;
        }
        
        if (weeklyAppointments) {
            weeklyAppointments.textContent = weekAppointments?.length || 0;
        }
        
        const activeConsultations = todayAppointments.filter(a => (a.status || a.Status) === 'IN_PROGRESS');
        if (activeConsultation) {
            activeConsultation.textContent = activeConsultations.length;
        }
        
        // Cargar prescripciones del día
        try {
            const { ApiClinical } = await import('../api.js');
            const prescriptionsResponse = await ApiClinical.get(`v1/Prescription/doctor/${doctorId}`).catch(() => []);
            const todayPrescriptions = Array.isArray(prescriptionsResponse) ? prescriptionsResponse.filter(p => {
                const prescDate = new Date(p.prescriptionDate || p.PrescriptionDate);
                return prescDate >= today && prescDate < tomorrow;
            }) : [];
            
            if (prescriptionsToday) {
                prescriptionsToday.textContent = todayPrescriptions.length;
            }
        } catch (err) {
            if (prescriptionsToday) {
                prescriptionsToday.textContent = '0';
            }
        }
        
    } catch (error) {
        console.error('Error al cargar estadísticas:', error);
    }
}

/**
 * Carga las consultas del día para el dashboard principal
 */
async function loadTodayConsultationsForDashboard() {
    const consultationsList = document.getElementById('consultations-list');
    if (!consultationsList) return;
    
    try {
        const doctorId = getId(doctorState.currentDoctorData, 'doctorId');
        if (!doctorId) {
            consultationsList.innerHTML = '<p style="color: #6b7280; padding: 2rem; text-align: center;">No se pudo identificar al médico</p>';
            return;
        }
        
        const { ApiScheduling } = await import('../api.js');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        console.log('📅 Cargando consultas del día para dashboard');
        
        const appointments = await ApiScheduling.get(
            `Appointments?doctorId=${doctorId}&startTime=${today.toISOString()}&endTime=${tomorrow.toISOString()}`
        );
        
        // Filtrar consultas completadas, canceladas y no show
        const allAppointments = Array.isArray(appointments) 
            ? appointments.filter(apt => {
                const status = apt.status || apt.Status;
                return status !== 'COMPLETED' && status !== 'CANCELLED' && status !== 'NO_SHOW';
            })
            : [];
        
        console.log('✅ Consultas activas encontradas:', allAppointments.length);
        
        // Cargar nombres de pacientes
        const { Api } = await import('../api.js');
        for (const apt of allAppointments) {
            // Si ya viene el nombre desde el backend → lo usamos tal cual
            if (apt.patientName && apt.patientName.trim() !== '') {
                continue;
            }

            const patientId = apt.patientId || apt.PatientId;
            if (!patientId) {
                apt.patientName = 'Paciente sin ID';
                continue;
            }

            // Como fallback, recién ahí pedimos el patient
            try {
                const patient = await Api.get(`v1/Patient/${patientId}`);
                apt.patientName = `${patient.Name || patient.name || ''} ${patient.lastName || patient.LastName || ''}`.trim() || 'Paciente sin nombre';
            } catch (err) {
                console.warn('Error al cargar paciente:', err);
                apt.patientName = 'Paciente desconocido';
            }
        }
        
        // Renderizar lista
        consultationsList.innerHTML = '';
        
        if (allAppointments && allAppointments.length > 0) {
            allAppointments.forEach(apt => {
                const consultationItem = createConsultationItemElement(apt);
                consultationsList.appendChild(consultationItem);
            });
        } else {
            const today = new Date();
            const dateStr = today.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
            consultationsList.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #6b7280;">
                    <i class="fas fa-check-circle" style="font-size: 3rem; margin-bottom: 1rem; color: #10b981; opacity: 0.5;"></i>
                    <h4 style="margin-bottom: 0.5rem; color: #111827;">¡Todo listo!</h4>
                    <p>No hay consultas pendientes para el ${dateStr}</p>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('❌ Error al cargar consultas:', error);
        consultationsList.innerHTML = '<p style="color: #6b7280; padding: 2rem; text-align: center;">No se pudieron cargar las consultas del día</p>';
    }
    
    // Reinicializar botones de atención
    setTimeout(async () => {
        const { initializeAttendButtons } = await import('./doctor-appointments.js');
        initializeAttendButtons();
    }, 100);
    
    // Inicializar navegación de fecha para hoy
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    updateConsultationsListTitle(null, todayStr);
}

/**
 * Carga la agenda semanal para el dashboard principal
 */
async function loadWeeklySchedule() {
    const weeklySchedule = document.getElementById('weekly-schedule');
    if (!weeklySchedule) return;
    
    try {
        const doctorId = getId(doctorState.currentDoctorData, 'doctorId');
        if (!doctorId) {
            console.warn('No hay doctorId disponible para cargar agenda');
            weeklySchedule.innerHTML = '<p style="color: #6b7280; padding: 2rem; text-align: center;">No se pudo identificar al médico</p>';
            return;
        }

        const { ApiScheduling } = await import('../api.js');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);
        
        const appointments = await ApiScheduling.get(
            `Appointments?doctorId=${doctorId}&startTime=${today.toISOString()}&endTime=${nextWeek.toISOString()}`
        );
        
        weeklySchedule.innerHTML = '';
        
        // Agrupar por día de la semana (incluso si no hay appointments)
        const daysOfWeek = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const appointmentsByDay = {};
        
        // Si hay appointments, agruparlos por día
        if (appointments && appointments.length > 0) {
            appointments.forEach(apt => {
                const date = new Date(apt.startTime || apt.StartTime);
                const dayOfWeek = date.getDay();
                const dayKey = daysOfWeek[dayOfWeek];
                
                // Crear clave única con la fecha completa
                const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                
                if (!appointmentsByDay[dateKey]) {
                    appointmentsByDay[dateKey] = {
                        abbreviation: dayKey,
                        dayNumber: date.getDate().toString(),
                        count: 0,
                        date: date,
                        dateStr: dateKey
                    };
                }
                appointmentsByDay[dateKey].count++;
            });
        }
        
        // SIEMPRE mostrar los próximos 5 días (incluso si no hay turnos)
        const scheduleItems = [];
        for (let i = 0; i < 5; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() + i);
            date.setHours(0, 0, 0, 0); // Asegurar que esté en medianoche
            const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
            const dayKey = daysOfWeek[date.getDay()];
            
            // Si hay datos para este día, usarlos; sino, crear día con count 0
            const dayData = appointmentsByDay[dateKey] || {
                abbreviation: dayKey,
                dayNumber: date.getDate().toString(),
                count: 0,
                date: date,
                dateStr: dateKey
            };
            scheduleItems.push(dayData);
        }
        
        // Renderizar todos los días
        scheduleItems.forEach(day => {
            const scheduleItem = createScheduleItemElement(day);
            weeklySchedule.appendChild(scheduleItem);
        });
        
        // Agregar event listeners a los items de la agenda
        initializeScheduleItemClickHandlers();
        
    } catch (error) {
        console.error('Error al cargar agenda:', error);
        weeklySchedule.innerHTML = '<p style="color: #6b7280; padding: 2rem; text-align: center;">No se pudo cargar la agenda</p>';
    }
}
function initializeScheduleItemClickHandlers() {
    const scheduleItems = document.querySelectorAll('.schedule-item[data-date]');
    
    scheduleItems.forEach(item => {
        // Remover listeners previos
        const newItem = item.cloneNode(true);
        item.parentNode.replaceChild(newItem, item);
        
        // Mantener los event listeners de hover
        newItem.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#f0fdf4';
            this.style.transform = 'translateY(-2px)';
            this.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
        });
        
        newItem.addEventListener('mouseleave', function() {
            this.style.backgroundColor = '';
            this.style.transform = '';
            this.style.boxShadow = '';
        });
        
        // Agregar evento de click
        newItem.addEventListener('click', async function() {
            const dateStr = this.getAttribute('data-date');
            const dayName = this.getAttribute('data-day-name');
            
            console.log('📅 Cargando consultas para:', dayName, dateStr);
            
            // Resaltar el día seleccionado
            document.querySelectorAll('.schedule-item').forEach(si => {
                si.style.border = '';
                si.style.backgroundColor = '';
            });
            this.style.border = '2px solid #10b981';
            this.style.backgroundColor = '#f0fdf4';
            
            // Actualizar el título del historial
            updateConsultationsListTitle(dayName, dateStr);
            
            // Cargar consultas de ese día
            await loadConsultationsForDate(dateStr);
        });
    });
}
/**
 * Carga las consultas para una fecha específica
 */
export async function loadConsultationsForDate(dateStr) {
    const consultationsList = document.getElementById('consultations-list');
    if (!consultationsList) return;
    
    try {
        const doctorId = getId(doctorState.currentDoctorData, 'doctorId');
        if (!doctorId) {
            consultationsList.innerHTML = '<p style="color: #6b7280; padding: 2rem; text-align: center;">No se pudo identificar al médico</p>';
            return;
        }
        
        // Mostrar loading
        consultationsList.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #6b7280;">
                <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                <p>Cargando consultas...</p>
            </div>
        `;
        
        const { ApiScheduling } = await import('../api.js');
        
        // Parsear la fecha
        const [year, month, day] = dateStr.split('-').map(Number);
        const selectedDate = new Date(year, month - 1, day);
        selectedDate.setHours(0, 0, 0, 0);
        
        const nextDay = new Date(selectedDate);
        nextDay.setDate(nextDay.getDate() + 1);
        
        console.log('📅 Buscando consultas entre:', selectedDate.toISOString(), 'y', nextDay.toISOString());
        
        const appointments = await ApiScheduling.get(
            `Appointments?doctorId=${doctorId}&startTime=${selectedDate.toISOString()}&endTime=${nextDay.toISOString()}`
        );
        
        // Filtrar consultas completadas, canceladas y no show
        const allAppointments = Array.isArray(appointments) 
            ? appointments.filter(apt => {
                const status = apt.status || apt.Status;
                return status !== 'COMPLETED' && status !== 'CANCELLED' && status !== 'NO_SHOW';
            })
            : [];
        
        console.log('✅ Consultas activas encontradas:', allAppointments.length);
        
        // Cargar nombres de pacientes
        const { Api } = await import('../api.js');
        for (const apt of allAppointments) {
            // Si ya viene el nombre desde el backend → lo usamos tal cual
            if (apt.patientName && apt.patientName.trim() !== '') {
                continue;
            }

            const patientId = apt.patientId || apt.PatientId;
            if (!patientId) {
                apt.patientName = 'Paciente sin ID';
                continue;
            }

            // Como fallback, recién ahí pedimos el patient
            try {
                const patient = await Api.get(`v1/Patient/${patientId}`);
                apt.patientName = `${patient.Name || patient.name || ''} ${patient.lastName || patient.LastName || ''}`.trim() || 'Paciente sin nombre';
            } catch (err) {
                console.warn('Error al cargar paciente:', err);
                apt.patientName = 'Paciente desconocido';
            }
        }
        
        // Renderizar lista
        consultationsList.innerHTML = '';
        
        if (allAppointments && allAppointments.length > 0) {
            allAppointments.forEach(apt => {
                const consultationItem = createConsultationItemElement(apt);
                consultationsList.appendChild(consultationItem);
            });
        } else {
            const formattedDate = selectedDate.toLocaleDateString('es-AR', { 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
            });
            consultationsList.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #6b7280;">
                    <i class="fas fa-check-circle" style="font-size: 3rem; margin-bottom: 1rem; color: #10b981; opacity: 0.5;"></i>
                    <h4 style="margin-bottom: 0.5rem; color: #111827;">¡Todo listo!</h4>
                    <p>No hay consultas pendientes para el ${formattedDate}</p>
                </div>
            `;
        }
        
    } catch (error) {
        console.error('❌ Error al cargar consultas:', error);
        consultationsList.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #ef4444;">
                <i class="fas fa-exclamation-circle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                <p>Error al cargar las consultas</p>
            </div>
        `;
    }
    
    // Reinicializar botones de atención
    setTimeout(async () => {
        const { initializeAttendButtons } = await import('./doctor-appointments.js');
        initializeAttendButtons();
    }, 100);
    
    // Actualizar título y navegación
    updateConsultationsListTitle(null, dateStr);
}
function updateConsultationsListTitle(dayName, dateStr) {
    const consultationsSection = document.querySelector('#consultations-list')?.closest('.dashboard-section');
    if (!consultationsSection) return;
    
    const header = consultationsSection.querySelector('.section-header h3');
    const headerContainer = header?.closest('.section-header');
    if (!header || !headerContainer) return;
    
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isToday = dateStr === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    header.innerHTML = `<span style="display: flex; align-items: center; gap: 0.5rem;"><i class="fas fa-calendar-day" style="color: #10b981;"></i>Consultas${isToday ? ' de Hoy' : ''}</span>`;
    
    let nav = headerContainer.querySelector('.date-navigation-container');
    if (!nav) {
        nav = document.createElement('div');
        nav.className = 'date-navigation-container';
        nav.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; margin-left: auto;';
        headerContainer.style.cssText = 'display: flex; align-items: center; justify-content: space-between; width: 100%;';
        headerContainer.appendChild(nav);
    }
    
    nav.innerHTML = `
        <button class="btn btn-primary" style="padding: 0.5rem 0.75rem; min-width: auto;" title="Día anterior"><i class="fas fa-chevron-left"></i></button>
        <input type="date" class="date-nav-input" value="${dateStr}" style="padding: 0.5rem; border: 1px solid #10b981; border-radius: 0.375rem; background: white; color: #111827; font-weight: 500; cursor: pointer;">
        <button class="btn btn-primary" style="padding: 0.5rem 0.75rem; min-width: auto;" title="Día siguiente"><i class="fas fa-chevron-right"></i></button>
        <button class="btn btn-primary" style="padding: 0.5rem 1rem; min-width: auto;" title="Ir a hoy">Hoy</button>
    `;
    
    const [prevBtn, dateInput, nextBtn, todayBtn] = nav.children;
    const navigate = async (newDateStr) => { dateInput.value = newDateStr; await loadConsultationsForDate(newDateStr); updateConsultationsListTitle(null, newDateStr); };
    
    // Función auxiliar para formatear fecha correctamente
    const formatDate = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    };
    
    prevBtn.onclick = () => {
        // Crear fecha en hora local (sin problemas de zona horaria)
        const currentDate = new Date(year, month - 1, day);
        currentDate.setHours(0, 0, 0, 0); // Asegurar que esté en medianoche
        currentDate.setDate(currentDate.getDate() - 1); // Restar un día
        navigate(formatDate(currentDate));
    };
    
    nextBtn.onclick = () => {
        // Crear fecha en hora local (sin problemas de zona horaria)
        const currentDate = new Date(year, month - 1, day);
        currentDate.setHours(0, 0, 0, 0); // Asegurar que esté en medianoche
        currentDate.setDate(currentDate.getDate() + 1); // Sumar un día
        navigate(formatDate(currentDate));
    };
    
    todayBtn.onclick = () => {
        const t = new Date();
        t.setHours(0, 0, 0, 0);
        navigate(formatDate(t));
    };
    
    dateInput.onchange = (e) => e.target.value && navigate(e.target.value);
}
/**
 * Crea el elemento HTML para un día de la agenda
 */
function createScheduleItemElement(day) {
    const item = document.createElement('div');
    item.className = 'schedule-item';
    item.style.cursor = 'pointer';
    item.style.transition = 'all 0.2s ease';
    item.setAttribute('data-date', day.dateStr);
    item.setAttribute('data-day-name', `${day.abbreviation} ${day.dayNumber}`);
    
    // Añadir efecto hover
    item.addEventListener('mouseenter', function() {
        this.style.backgroundColor = '#f0fdf4';
        this.style.transform = 'translateY(-2px)';
        this.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
    });
    
    item.addEventListener('mouseleave', function() {
        this.style.backgroundColor = '';
        this.style.transform = '';
        this.style.boxShadow = '';
    });
    
    item.innerHTML = `
        <div class="schedule-day-badge">
            <span class="day-abbr">${day.abbreviation || ''}</span>
            <span class="day-num">${day.dayNumber || ''}</span>
        </div>
        <span>${day.count || 0} consultas</span>
        <div class="schedule-count-badge">${day.count || 0}</div>
    `;
    
    return item;
}

// Exportar doctorState
export { doctorState };