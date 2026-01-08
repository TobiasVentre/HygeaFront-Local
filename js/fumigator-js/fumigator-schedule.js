// fumigator-schedule.js
// Módulo para gestión de agenda y disponibilidad del fumigator

import { isFinalState } from './appointment-state-machine.js';
import { showNotification } from './fumigator-ui.js';
import { getId } from './fumigator-core.js';
import { getAllowedTransitionsFrom } from './appointment-state-machine.js';

const DAYS_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const STATUS_CONFIG = {
    SCHEDULED: { label: 'Programado', color: '#f59e0b',gradient: "linear-gradient(135deg, #fff7ed 0%, #ffffff 100%)"},
    CONFIRMED: { label: 'Confirmado', color: '#10b981', gradient: "linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)" },
    COMPLETED: { label: 'Completado', color: '#10b981', gradient: "linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)" },
    CANCELLED: { label: 'Cancelado', color: '#dc2626', gradient: "linear-gradient(135deg, #fef2f2 0%, #ffffff 100%)" },
    RESCHEDULED: { label: 'Reprogramado', color: '#8b5cf6',gradient: "linear-gradient(135deg, #f5f3ff 0%, #ffffff 100%)" },
    NO_SHOW: { label: 'No asistió', color: '#6b7280',gradient: "linear-gradient(135deg, #f3f4f6 0%, #ffffff 100%)"  },
    IN_PROGRESS: { label: 'En curso', color: '#3b82f6', gradient: "linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)"  }
};

/**
 * Carga la vista de agenda completa
 */
export async function loadAgendaView() {
    const dashboardContent = document.querySelector('.dashboard-content');
    if (!dashboardContent) return;
    
    // Limpiar y ocultar secciones
    dashboardContent.querySelectorAll('.agenda-section, .coming-soon-section').forEach(el => el.remove());
    ['mainDashboardSection', 'fumigatorProfileSection'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'none';
            el.classList.add('hidden');
        }
    });
    
    // Crear sección de agenda
    const agendaSection = createAgendaSection();
    dashboardContent.appendChild(agendaSection);
    
    // Event listener para actualizar
    setTimeout(() => {
        const refreshBtn = document.getElementById('refreshAgendaBtn');
        if (refreshBtn) refreshBtn.addEventListener('click', () => renderAgendaContent(agendaSection));
    }, 100);
    
    await renderAgendaContent(agendaSection);
}

/**
 * Crea la estructura base de la sección de agenda
 */
function createAgendaSection() {
    const section = document.createElement('div');
    section.className = 'agenda-section';
    section.innerHTML = `
        <div class="dashboard-section">
            <div class="section-header">
                <div>
                    <h2>Agenda Médica</h2>
                    <p>Gestión completa de tus turnos asignados</p>
                </div>

                <button class="btn btn-secondary" id="refreshAgendaBtn">
                    <i class="fas fa-sync-alt"></i> Actualizar
                </button>
            </div>

            <div id="agenda-content" class="agenda-loading">
                <i class="fas fa-spinner fa-spin loading-icon"></i>
                <p class="loading-text">Cargando turnos...</p>
            </div>
        </div>
    `;

    return section;
}

/**
 * Renderiza el contenido de la agenda
 */
export async function renderAgendaContent(agendaSection) {
    const agendaContent = agendaSection.querySelector('#agenda-content');
    if (!agendaContent) return;
    
    try {
        const { state } = await import('../state.js');
        const { ApiScheduling, Api } = await import('../api.js');
        
        const fumigatorId = getId(state.fumigatorData, 'fumigatorId');
        if (!fumigatorId) {
            agendaContent.innerHTML = createErrorHTML('No se pudo identificar al médico');
            return;
        }
        
        // Obtener turnos (3 meses)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const threeMonths = new Date(today);
        threeMonths.setMonth(threeMonths.getMonth() + 3);
        
        const appointments = await ApiScheduling.get(
            `Appointments?fumigatorId=${fumigatorId}&startTime=${today.toISOString()}&endTime=${threeMonths.toISOString()}`
        );
        
        if (!appointments?.length) {
            agendaContent.innerHTML = createEmptyStateHTML('No hay turnos asignados', 'No tienes turnos programados en los próximos 3 meses.');
            return;
        }
        
        // Cargar clientes y agrupar por fecha
        const appointmentsWithClients = await loadClientsData(appointments, Api);
        const appointmentsByDate = groupByDate(appointmentsWithClients);
        
        // Renderizar
        agendaContent.innerHTML = generateAgendaHTML(appointments, appointmentsByDate);
        
        setTimeout(() => {
            initializeEventHandlers();
        }, 100);
        
    } catch (error) {
        console.error('Error al cargar agenda:', error);
        agendaContent.innerHTML = createErrorHTML(`Error al cargar la agenda: ${error.message}`);
    }
}

/**
 * Carga datos de clientes para cada turno
 */
async function loadClientsData(appointments, Api) {
    return Promise.all(appointments.map(async (apt) => {
        try {
            const clientId = apt.clientId || apt.ClientId;
            const client = await Api.get(`v1/Client/${clientId}`);
            return {
                ...apt,
                clientName: `${client.name || client.Name || ''} ${client.lastName || client.LastName || ''}`.trim() || 'Cliente sin nombre',
                clientDni: client.dni || client.Dni || 'N/A'
            };
        } catch {
            return { ...apt, clientName: 'Cliente desconocido', clientDni: 'N/A' };
        }
    }));
}

/**
 * Agrupa turnos por fecha
 */
function groupByDate(appointments) {
    const grouped = {};
    appointments.forEach(apt => {
        const startTime = new Date(apt.startTime || apt.StartTime);
        const dateKey = `${startTime.getUTCFullYear()}-${String(startTime.getUTCMonth() + 1).padStart(2, '0')}-${String(startTime.getUTCDate()).padStart(2, '0')}`;
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(apt);
    });
    return grouped;
}

/**
 * Genera el HTML completo de la agenda
 */
function generateAgendaHTML(appointments, appointmentsByDate) {
    const summary = generateSummaryHTML(appointments);
    const sortedDates = Object.keys(appointmentsByDate).sort();
    
    const daysHTML = sortedDates.map(dateKey => {
        const [year, month, day] = dateKey.split('-').map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        const dayAppointments = appointmentsByDate[dateKey].sort((a, b) => 
            new Date(a.startTime || a.StartTime) - new Date(b.startTime || b.StartTime)
        );
        
        return generateDayCardHTML(
            DAYS_NAMES[date.getUTCDay()],
            day,
            MONTHS_NAMES[month - 1],
            dayAppointments
        );
    }).join('');
    
    return `${summary}<div class="agenda-days-container">${daysHTML}</div>`;
}

/**
 * Genera HTML del resumen
 */
function generateSummaryHTML(appointments) {
    const statuses = ['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'IN_PROGRESS'];
    const badges = statuses.map(status => {
        const count = appointments.filter(a => (a.status || a.Status) === status).length;
        const config = STATUS_CONFIG[status];
        const bgColors = { SCHEDULED: '#fef3c7', CONFIRMED: '#d1fae5', COMPLETED: '#dcfce7', CANCELLED: '#fee2e2', IN_PROGRESS: '#d1fae5' };
        const textColors = { SCHEDULED: '#92400e', CONFIRMED: '#059669', COMPLETED: '#166534', CANCELLED: '#991b1b', IN_PROGRESS: '#059669' };
        return `<span style="padding: 0.25rem 0.75rem; background: ${bgColors[status]}; color: ${textColors[status]}; border-radius: 4px; font-size: 0.875rem;">${config.label}s: ${count}</span>`;
    }).join('');
    
    return `
        <div class="appointments-summary">
        <div class="appointments-summary-header">
            <h3>Total de turnos: ${appointments.length}</h3>
            <div class="appointments-summary-badges">
                ${badges}
            </div>
        </div>
    </div>
    `;
}

/**
 * Genera HTML de tarjeta de día
 */
function generateDayCardHTML(dayName, dayNumber, monthName, appointments) {
    const appointmentsHTML = appointments.map(apt => generateAppointmentHTML(apt)).join('');
    return `
        <div class="agenda-day-card">
        <div class="agenda-day-header">
            <div>
                <h3>${dayName}, ${dayNumber} de ${monthName}</h3>
                <p>${appointments.length} ${appointments.length === 1 ? 'turno' : 'turnos'}</p>
            </div>

            <span class="day-appointment-count">${appointments.length}</span>
        </div>

        <div class="appointments-grid">
            ${appointmentsHTML}
        </div>
    </div>
    `;
}

/**
 * Genera HTML de un turno
 */
function generateAppointmentHTML(apt) {
    const start = new Date(apt.startTime || apt.StartTime);
    const end = new Date(apt.endTime || apt.EndTime);
    const timeStr = `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')} - ${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
    const status = apt.status || apt.Status || 'SCHEDULED';
    const config = STATUS_CONFIG[status] || { color: '#6b7280', label: status };
    const reason = (apt.reason || apt.Reason || apt.reasonText || apt.ReasonText || '').trim() || 'Sin motivo especificado';
    const appointmentId = apt.appointmentId || apt.AppointmentId;
    const clientId = apt.clientId || apt.ClientId;
    
    const allowed = getAllowedTransitionsFrom(status);

    // Siempre incluimos el estado actual (por si no está en allowed)
    const availableStates = [status, ...allowed];

    // Eliminar duplicados
    const uniqueStates = [...new Set(availableStates)];

    const statusOptions = uniqueStates
    
    .map(key => {
        const val = STATUS_CONFIG[key];
        if (!val) return "";
        return `<option value="${key}" ${status === key ? 'selected' : ''}>${val.label}</option>`;
    })
    .join('');
    
    let statusElement;

    if (isFinalState(status)) {
    // Estado final → solo texto
    statusElement = `
        <span class="appointment-status-final" style="color: ${config.color};">
            ${config.label}
        </span>
    `;
    } else {
        // Estado editable → select
        statusElement = `
            <select class="appointment-status-select"
                    data-appointment-id="${appointmentId}"
                    style="color: ${config.color};">
                ${statusOptions}
            </select>
        `;
    }

    //
    // ============================
    // 3) Botones de acción (solo si aplica)
    // ============================
    //
    const actions = getActionButtons(status, appointmentId, clientId, apt.clientName);

    //
    // ============================
    // 4) HTML final del turno
    // ============================
    //
        return `
    <div class="appointment-card" style="border-top-color: ${config.color}">
        
        <div class="appointment-header" style="background: ${config.gradient}">
            <h4 class="appointment-client">${apt.clientName}</h4>

            ${
                status === 'COMPLETED' || status === 'NO_SHOW'
                    ? `<span class="appointment-status-badge" 
                           style="color:${config.color}; background:${status === 'COMPLETED' ? '#d1fae5' : '#f3f4f6'};">
                            ${STATUS_CONFIG[status].label}
                       </span>`
                    : `<select class="appointment-status-select" data-appointment-id="${appointmentId}" 
                               style="color:${config.color}">
                            ${statusOptions}
                       </select>`
            }
        </div>

        <div class="appointment-info">
            <div class="info-row">
                <i class="fas fa-clock icon"></i>
                <span>${timeStr}</span>
            </div>

            <div class="info-row">
                <i class="fas fa-user icon"></i>
                <span>DNI: ${apt.clientDni}</span>
            </div>

            <div class="info-row">
                <i class="fas fa-stethoscope icon"></i>
                <span>${reason}</span>
            </div>
        </div>

        <div class="appointment-actions">
            ${actions}
        </div>
    </div>
`;
}


/**
 * Obtiene los botones de acción según el estado
 */
function getActionButtons(status, appointmentId, clientId, clientName) {
    if (status === 'COMPLETED') {
        return `
            <span class="appt-done-label">
                <i class="fas fa-check-circle"></i> Consulta realizada
            </span>
        `;
    }

    if (status === 'SCHEDULED' || status === 'CONFIRMED') {
        return `
            <button class="btn btn-primary btn-sm attend-appointment-btn"
                    data-appointment-id="${appointmentId}"
                    data-client-id="${clientId}"
                    data-client-name="${clientName}">
                <i class="fas fa-video"></i> Atender
            </button>

            <button class="btn btn-chat-fumigator btn-sm open-chat-btn"
                    data-appointment-id="${appointmentId}"
                    data-client-id="${clientId}"
                    data-client-name="${clientName}"
                    title="Chatear con el cliente">
                <i class="fas fa-comments"></i> Chat
            </button>
        `;
    }

    if (status === 'IN_PROGRESS') {
        return `
            <button class="btn btn-success btn-sm complete-appointment-btn"
                    data-appointment-id="${appointmentId}"
                    data-client-id="${clientId}"
                    data-client-name="${clientName}">
                <i class="fas fa-check"></i> Completar
            </button>

            <button class="btn btn-warning btn-sm no-show-appointment-btn"
                    data-appointment-id="${appointmentId}">
                <i class="fas fa-times"></i> No asistió
            </button>
        `;
    }

    return '';
}

/**
 * Inicializa todos los event handlers
 */
function initializeEventHandlers() {
    import('./fumigator-appointments.js').then(({ attendConsultation, updateAppointmentStatus,handleFumigatorChatOpen  }) => {
        // Botones de atender
        attachEventListeners('.attend-appointment-btn', async function() {
            const { appointmentId, clientId, clientName } = this.dataset;
            await updateAppointmentStatus(appointmentId, 'IN_PROGRESS');
            if (clientId && clientName) await attendConsultation(appointmentId, clientId, clientName);
        });
        
        // Botones de completar
        attachEventListeners('.complete-appointment-btn, .complete-consultation-btn', async function() {
            const { appointmentId, clientId, clientName } = this.dataset;
            if (appointmentId && clientId && clientName) await attendConsultation(appointmentId, clientId, clientName);
        });
        
        // Botones de no asistió
        attachEventListeners('.no-show-appointment-btn', async function() {
            const appointmentId = this.dataset.appointmentId;
            if (appointmentId && confirm('¿El cliente no asistió a la consulta?')) {
                await updateAppointmentStatus(appointmentId, 'NO_SHOW', 'Cliente no asistió');
                showNotification('Turno marcado como "No asistió"', 'info');
                const agendaSection = document.querySelector('.agenda-section');
                if (agendaSection) await renderAgendaContent(agendaSection);
            }
        });
        
        
        // Selectores de estado (Agenda)
        attachEventListeners('.appointment-status-select', async function () {
            const appointmentId = this.dataset.appointmentId;
            const newStatus = this.value;

            // Guardamos el estado anterior por si cancelan
            const previousStatus = [...this.options].find(o => o.defaultSelected)?.value || this.value;

            // 🔄 Si eligió REPROGRAMADO → abrir modal en lugar de cambiar estado
            if (newStatus === "RESCHEDULED") {
                try {
                    const { ApiScheduling } = await import("../api.js");
                    const { openFumigatorRescheduleModal } = await import("./fumigator-appointments.js");

                    const appointment = await ApiScheduling.get(`Appointments/${appointmentId}`);

                    // Abrimos modal de reprogramación
                    await openFumigatorRescheduleModal(appointment);

                    // Volvemos el select a su estado original (la reprogramación se hará desde el modal)
                    this.value = previousStatus;

                    return; // aca NO ejecutamos updateAppointmentStatus
                } catch (err) {
                    console.error("❌ Error abriendo modal de reprogramación desde agenda:", err);
                    showNotification("No se pudo abrir la ventana de reprogramación", "error");
                }
            }

            // 🔁 Si NO es reprogramado → flujo normal
            if (
                appointmentId &&
                confirm(`¿Cambiar el estado del turno a "${this.options[this.selectedIndex].text}"?`)
            ) {
                await updateAppointmentStatus(appointmentId, newStatus);
            } else {
                // Restaurar estado si canceló
                this.value = previousStatus;

                const agendaSection = document.querySelector(".agenda-section");
                if (agendaSection) await renderAgendaContent(agendaSection);
            }
        }, "change");

        
        // Botones de chat
        attachEventListeners('.open-chat-btn', async function() {
            const { appointmentId, clientId, clientName } = this.dataset;
            console.log('Click en boton de chat:', { appointmentId, clientId, clientName });
            if (appointmentId && clientId && clientName) {
                await handleFumigatorChatOpen(appointmentId, clientId, clientName);  // ✅ Nombre correcto
            }
        });
    });
}

/**
 * Helper para adjuntar event listeners
 */
function attachEventListeners(selector, handler, event = 'click') {
    document.querySelectorAll(selector).forEach(el => {
        const newEl = el.cloneNode(true);
        el.parentNode.replaceChild(newEl, el);
        newEl.addEventListener(event, handler);
    });
}

/**
 * Helpers para HTML de estados
 */
function createErrorHTML(message) {
    return `<div style="padding: 2rem; text-align: center; color: #dc2626;"><i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i><p>${message}</p></div>`;
}

function createEmptyStateHTML(title, message) {
    return `<div style="padding: 3rem; text-align: center; color: #6b7280;"><i class="fas fa-calendar-times" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;"></i><h3 style="margin-bottom: 0.5rem;">${title}</h3><p>${message}</p></div>`;
}

/**
 * Gestión de disponibilidad
 */
export async function openScheduleManager() {
    const { state } = await import('../state.js');
    const fumigatorId = state.fumigatorData?.fumigatorId || state.fumigatorData?.FumigatorId;
    
    if (!fumigatorId) {
        showNotification('No se pudo identificar al médico', 'error');
        return;
    }

    const modal = createModal('Gestionar Mi Agenda', `
        <div class="schedule-manager-container">
            <div style="margin-bottom: 1.5rem;">
                <button class="btn btn-primary" id="add-availability-btn"><i class="fas fa-plus"></i> Agregar Horario</button>
            </div>
            <div id="availability-list" style="margin-top: 1rem;">
                <div style="text-align: center; padding: 2rem; color: #6b7280;"><i class="fas fa-spinner fa-spin"></i> Cargando disponibilidad...</div>
            </div>
        </div>
    `, '1000px');
    
    modal.querySelector('#add-availability-btn').addEventListener('click', () => openAvailabilityForm(modal, fumigatorId));
    await loadFumigatorAvailability(modal, fumigatorId);
}

/**
 * Carga disponibilidad del fumigator
 */
async function loadFumigatorAvailability(modal, fumigatorId) {
    try {
        const { ApiScheduling } = await import('../api.js');
        const availability = await ApiScheduling.get(`FumigatorAvailability/search?fumigatorId=${fumigatorId}`);
        const list = modal.querySelector('#availability-list');
        
        if (!availability?.length) {
            list.innerHTML = createEmptyStateHTML('No tienes horarios configurados', 'Agrega tu primer horario de disponibilidad.');
            return;
        }

        list.innerHTML = renderAvailabilityList(availability);
        attachAvailabilityHandlers(modal, list, fumigatorId);
    } catch (error) {
        console.error('Error:', error);
        modal.querySelector('#availability-list').innerHTML = createErrorHTML('No se pudo cargar la disponibilidad');
    }
}

/**
 * Renderiza lista de disponibilidad
 */
/**
 * Renderiza lista de disponibilidad
 */
function renderAvailabilityList(availability) {
    const dayNames = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 7: 'Domingo' };
    const grouped = {};
    
    availability.forEach(av => {
        let day = av.dayOfWeek || av.DayOfWeek;
        
        // Convertir string a número si es necesario
        if (typeof day === 'string') {
            const dayNameToNumber = {
                'Monday': 1, 'Lunes': 1,
                'Tuesday': 2, 'Martes': 2,
                'Wednesday': 3, 'Miércoles': 3,
                'Thursday': 4, 'Jueves': 4,
                'Friday': 5, 'Viernes': 5,
                'Saturday': 6, 'Sábado': 6,
                'Sunday': 7, 'Domingo': 7
            };
            day = dayNameToNumber[day] || parseInt(day);
        }
        
        day = parseInt(day);
        
        if (isNaN(day) || day < 1 || day > 7) {
            console.warn('Día inválido:', av.dayOfWeek || av.DayOfWeek, av);
            return;
        }
        
        if (!grouped[day]) grouped[day] = [];
        grouped[day].push(av);
    });

    console.log('Disponibilidades agrupadas:', grouped);

    return Object.keys(grouped).sort((a, b) => a - b).map(day => {
        const dayName = dayNames[day];
        const slots = grouped[day];
        
        const slotsHTML = slots.map(slot => {
            const start = formatTime(slot.startTime || slot.StartTime);
            const end = formatTime(slot.endTime || slot.EndTime);
            const duration = slot.durationMinutes || slot.DurationMinutes || 30;
            const id = slot.availabilityId || slot.AvailabilityId;
            const active = slot.isActive !== false;
            
           return `
            <div class="availability-card ${!active ? 'inactive' : ''}">
                <div class="availability-info">
                    <span class="availability-time">${start} - ${end}</span>
                    <span class="availability-duration">Duración: ${duration} min</span>
                    ${!active ? '<span class="availability-inactive-msg">(Inactivo)</span>' : ''}
                </div>

                <div class="availability-actions">
                    <button class="btn btn-sm btn-secondary edit-availability-btn" data-id="${id}">
                        <i class="fas fa-edit"></i> Editar
                    </button>

                    <button class="btn btn-sm btn-danger delete-availability-btn" data-id="${id}">
                        <i class="fas fa-trash"></i> Eliminar
                    </button>
                </div>
            </div>
        `;

        }).join('');
        
        return `
            <div class="availability-day-card">
                <h4 class="availability-day-title">
                    <i class="fas fa-calendar-day"></i> ${dayName}
                </h4>
                ${slotsHTML}
            </div>
        `;
    }).join('');
}

/**
 * Formatea tiempo
 */
function formatTime(time) {
    if (!time) return '00:00';
    
    // Si es un string tipo "HH:mm:ss" o "HH:mm"
    if (typeof time === 'string') {
        const parts = time.split(':');
        return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
    }
    
    // Si es un objeto con propiedades hours/minutes
    const hours = time.hours || time.Hours || 0;
    const minutes = time.minutes || time.Minutes || 0;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Adjunta handlers de disponibilidad
 */
function attachAvailabilityHandlers(modal, list, fumigatorId) {
    list.querySelectorAll('.edit-availability-btn').forEach(btn => {
        btn.addEventListener('click', () => openAvailabilityForm(modal, fumigatorId, btn.dataset.id));
    });
    list.querySelectorAll('.delete-availability-btn').forEach(btn => {
        btn.addEventListener('click', () => deleteAvailability(modal, fumigatorId, btn.dataset.id));
    });
}

/**
 * Abre formulario de disponibilidad
 */
async function openAvailabilityForm(parentModal, fumigatorId, availabilityId = null) {
    let availability = null;

    if (availabilityId) {
        const { ApiScheduling } = await import('../api.js');
        availability = await ApiScheduling.get(`FumigatorAvailability/${availabilityId}`);
        console.log("🟦 Disponibilidad cargada para editar:", availability);
    }

    // Map para convertir string → número
    const dayMap = {
        "Monday": 1,
        "Tuesday": 2,
        "Wednesday": 3,
        "Thursday": 4,
        "Friday": 5,
        "Saturday": 6,
        "Sunday": 7
    };

    let selectedDay = 0;

    if (availability) {
        // Detecta si viene "Monday" o si viene number
        const rawDay = availability.dayOfWeek || availability.DayOfWeek;

        if (typeof rawDay === "string") {
            selectedDay = dayMap[rawDay] || 0;
        } else {
            selectedDay = parseInt(rawDay) || 0;
        }
    }

    console.log("📌 Día detectado:", selectedDay);

    const names = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

    const dayOptions = [1, 2, 3, 4, 5, 6, 7].map(d => `
        <option value="${d}" ${selectedDay === d ? 'selected' : ''}>${names[d]}</option>
    `).join('');

    const startTime = availability ? formatTime(availability.startTime || availability.StartTime) : '';
    const endTime = availability ? formatTime(availability.endTime || availability.EndTime) : '';
    const duration = availability ? (availability.durationMinutes || availability.DurationMinutes) : 30;

    const modal = createModal(
        availabilityId ? 'Editar Horario' : 'Agregar Horario',
        `
        <form id="availability-form" class="availability-form">
            <div class="form-group">
                <label class="availability-label">Día de la semana:</label>
                <select name="dayOfWeek" required class="availability-select">
                    <option value="">Seleccionar día</option>
                    ${dayOptions}
                </select>
            </div>

            <div class="form-group">
                <label class="availability-label">Hora de inicio:</label>
                <input type="time" name="startTime" value="${startTime}" required class="availability-input">
            </div>

            <div class="form-group">
                <label class="availability-label">Hora de fin:</label>
                <input type="time" name="endTime" value="${endTime}" required class="availability-input">
            </div>

            <div class="form-group">
                <label class="availability-label">Duración (minutos):</label>
                <input type="number" name="durationMinutes" min="15" max="480" value="${duration}" required class="availability-input">
            </div>

            <div class="availability-form-actions">
                <button type="button" class="btn btn-secondary cancel-modal">Cancelar</button>
                <button type="submit" class="btn btn-primary">Guardar</button>
            </div>
        </form>
        `,
        '600px',
        1001
    );

    // Agregar event listener al formulario con protección contra doble envío
    const form = modal.querySelector('form');
    let isSubmitting = false;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Prevenir múltiples envíos
        if (isSubmitting) {
            console.log('⚠️ Formulario ya se está enviando, ignorando...');
            return;
        }
        
        isSubmitting = true;
        try {
            await saveAvailability(modal, parentModal, fumigatorId, availabilityId);
        } finally {
            // Solo resetear si el modal aún existe (no se cerró)
            if (document.body.contains(modal)) {
                isSubmitting = false;
            }
        }
    });
}

/**
 * Guarda disponibilidad
 */
async function saveAvailability(formModal, parentModal, fumigatorId, availabilityId) {
    // Prevenir doble envío
    const submitButton = formModal.querySelector('button[type="submit"]');
    if (submitButton.disabled) {
        console.log('⚠️ Envío ya en progreso, ignorando...');
        return;
    }

    // Deshabilitar botón para prevenir doble clic
    submitButton.disabled = true;
    const originalText = submitButton.innerHTML;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

    try {
        const formData = new FormData(formModal.querySelector('form'));

        const dayNames = {
            1: "Monday",
            2: "Tuesday",
            3: "Wednesday",
            4: "Thursday",
            5: "Friday",
            6: "Saturday",
            7: "Sunday"
        };

        const numericDay = parseInt(formData.get('dayOfWeek'));
        const dayString = dayNames[numericDay];

        const [startH, startM] = formData.get('startTime').split(':');
        const [endH, endM] = formData.get('endTime').split(':');

        const data = {
            fumigatorId: fumigatorId,
            dayOfWeek: dayString, // ← ← ← el backend lo quiere en texto
            startTime: `${startH.padStart(2, '0')}:${startM.padStart(2, '0')}:00`,
            endTime: `${endH.padStart(2, '0')}:${endM.padStart(2, '0')}:00`,
            durationMinutes: parseInt(formData.get('durationMinutes'))
        };

        console.log("📤 Enviando PATCH/POST:", data);

        const { ApiScheduling } = await import('../api.js');

        let response;
        if (availabilityId) {
            response = await ApiScheduling.patch(`FumigatorAvailability/${availabilityId}`, data);
            showNotification('Horario actualizado', 'success');
        } else {
            response = await ApiScheduling.post(`FumigatorAvailability/${fumigatorId}`, data);
            showNotification('Horario agregado', 'success');
        }

        console.log("📥 Respuesta servidor:", response);

        formModal.remove();
        await loadFumigatorAvailability(parentModal, fumigatorId);

    } catch (error) {
        console.error('❌ Error al guardar disponibilidad:', error);
        showNotification(`Error: ${error.message}`, 'error');
        // Rehabilitar botón en caso de error
        submitButton.disabled = false;
        submitButton.innerHTML = originalText;
    }
}


/**
 * Elimina disponibilidad
 */
async function deleteAvailability(modal, fumigatorId, availabilityId) {
    if (!confirm('¿Eliminar este horario?')) return;
    try {
        const { ApiScheduling } = await import('../api.js');
        await ApiScheduling.delete(`FumigatorAvailability/${availabilityId}`);
        showNotification('Horario eliminado', 'success');
        await loadFumigatorAvailability(modal, fumigatorId);
    } catch (error) {
        showNotification('Error al eliminar', 'error');
    }
}

/**
 * Helper para crear modales
 */
function createModal(title, content, maxWidth = '1000px', zIndex = 1000) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.cssText = `display: flex; z-index: ${zIndex};`;
    modal.innerHTML = `
        <div class="modal-content" style="max-width: ${maxWidth}; max-height: 90vh; overflow-y: auto;">
            <div class="modal-header">
                <h3>${title}</h3>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body">${content}</div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', () => modal.remove()));
    modal.querySelectorAll('.cancel-modal').forEach(btn => btn.addEventListener('click', () => modal.remove()));
    return modal;
}