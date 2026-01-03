// ===================================
// DOCTOR APPOINTMENTS - Consultas y Turnos
// ===================================

import { doctorState, getId,getDoctorDisplayName, formatTime } from './doctor-core.js';
import { showNotification } from './doctor-ui.js';
import { handleAppointmentChatCreation, openChatModal } from '../chat/chat-integration.js';
//import { handleAppointmentChatCreation, addChatButtomToAppointment, openChatModal } from '../chat/ChatIntegration.js';


// ===================================
// UTILIDADES
// ===================================


let currentRescheduleContext = null;
let doctorRescheduleModalInitialized = false;

const STATUS_CONFIG = {
    SCHEDULED: { class: 'pending', text: 'Programado' },
    CONFIRMED: { class: 'waiting', text: 'Confirmado' },
    IN_PROGRESS: { class: 'in-progress', text: 'En curso' },
    COMPLETED: { class: 'completed', text: 'Completado' },
    CANCELLED: { class: 'cancelled', text: 'Cancelado' },
    RESCHEDULED: { class: 'pending', text: 'Reprogramado' },
    NO_SHOW: { class: 'no-show', text: 'No asistiÃ³' }
};

const getStatusInfo = (status) => STATUS_CONFIG[status] || STATUS_CONFIG.SCHEDULED;

/**
 * Obtiene los botones de acción según el estado del turno
 */
const getActionButtons = (status, appointmentId, patientId, patientName) => {
    const dataAttrs = `data-appointment-id="${appointmentId}" data-patient-id="${patientId}" data-patient-name="${patientName}"`;
    
    if (status === 'COMPLETED') {
        return `
            <span class="status-completed">
                <i class="fas fa-check-circle"></i> Consulta realizada
            </span>
        `;
    }
    if (status === 'CANCELLED') {
        return `
            <span class="status-cancelled">
                <i class="fas fa-times-circle"></i> Cancelado
            </span>
        `;
    }
    if (status === 'NO_SHOW') {
        return `
            <span class="status-no-show">
                <i class="fas fa-user-slash"></i> No asistió
            </span>
        `;
    }
    let buttons = '';
    if (status === 'SCHEDULED') {
        buttons = `
            <button class="btn btn-success btn-sm confirm-appointment-btn" ${dataAttrs}>
                <i class="fas fa-check"></i> Confirmar
            </button>
        `;
    } else if (status === 'CONFIRMED') {
        buttons = `
            <button class="btn btn-primary btn-sm attend-appointment-btn" ${dataAttrs}>
                <i class="fas fa-video"></i> Atender
            </button>

            <button class="btn btn-chat-doctor btn-sm open-chat-btn" ${dataAttrs}>
                <i class="fas fa-comments"></i> Chat
            </button>
        `;
    } else if (status === 'IN_PROGRESS') {
        buttons = `
            <button class="btn btn-success btn-sm complete-appointment-btn" ${dataAttrs}>
                <i class="fas fa-check-circle"></i> Completar
            </button>

            <button class="btn btn-warning btn-sm no-show-appointment-btn" data-appointment-id="${appointmentId}">
                <i class="fas fa-user-slash"></i> No asistió
            </button>

            <button class="btn btn-chat-doctor btn-sm open-chat-btn" ${dataAttrs}>
                <i class="fas fa-comments"></i> Chat
            </button>
        `;
    }
    
    // Dropdown extra de acciones
    if (status !== 'COMPLETED' && status !== 'IN_PROGRESS') {
        buttons += `
            <div class="appointment-action-menu">
                <button class="appointment-action-toggle" type="button">
                    <i class="fas fa-ellipsis-v"></i>
                </button>

                <div class="appointment-action-dropdown">
                    <button class="dropdown-item reschedule-appointment-btn" data-appointment-id="${appointmentId}">
                        <i class="fas fa-calendar-alt"></i>
                        Reprogramar
                    </button>

                    <button class="dropdown-item cancel-appointment-btn" data-appointment-id="${appointmentId}">
                        <i class="fas fa-times"></i>
                        Cancelar
                    </button>
                </div>
            </div>
        `;
    }

    return buttons;
};


// ===================================
// MENSAJES NO LEÍDOS - CHAT (Solo Frontend)
// ===================================

/**
 * Obtiene el conteo de mensajes no leídos para una sala de chat
 */
async function getUnreadMessagesCount(chatRoomId, doctorId) {
    try {
        // Importar la función directamente (no como objeto)
        const { getChatMessages } = await import('../chat/chat-service.js');
        
        console.log('🔍 Obteniendo mensajes para chatRoom:', chatRoomId, 'doctor:', doctorId);
        
        const messages = await getChatMessages(chatRoomId, doctorId, 1, 100);
        
        console.log('🔍 Mensajes obtenidos:', messages);
        
        if (!messages || !Array.isArray(messages)) return 0;
        
        // Filtrar mensajes no leídos que fueron enviados por el paciente
        const unreadCount = messages.filter(msg => {
            const isRead = msg.isRead || msg.IsRead;
            const senderRole = msg.senderRole || msg.SenderRole;
            return !isRead && senderRole !== 'Doctor';
        }).length;
        
        console.log('🔍 Mensajes no leídos:', unreadCount);
        
        return unreadCount;
        
    } catch (error) {
        console.error('❌ Error obteniendo mensajes no leídos:', error);
        return 0;
    }
}
/**
 * Busca el chatRoom para un appointment específico
 */
async function findChatRoomForAppointment(doctorId, patientId) {
    try {
        // Importar la función directamente (no como objeto)
        const { getUserChatRooms } = await import('../chat/chat-service.js');
        
        console.log('🔍 Buscando chatRooms para doctor:', doctorId);
        
        const chatRooms = await getUserChatRooms(doctorId);
        
        console.log('🔍 ChatRooms obtenidos:', chatRooms);
        
        if (!chatRooms || !Array.isArray(chatRooms)) {
            console.log('🔍 No hay chatRooms o no es array');
            return null;
        }
        
        const room = chatRooms.find(r => {
            const roomDoctorId = r.doctorId || r.DoctorId;
            const roomPatientId = r.patientId || r.PatientId;
            console.log('🔍 Comparando room:', { roomDoctorId, roomPatientId, doctorId, patientId });
            return roomDoctorId == doctorId && roomPatientId == patientId;
        });
        
        console.log('🔍 Room encontrado:', room);
        return room;
        
    } catch (error) {
        console.error('❌ Error buscando chatRoom:', error);
        return null;
    }
}

/**
 * Actualiza el badge de un botón de chat
 */
function updateChatButtonBadge(button, unreadCount) {
    const existingBadge = button.querySelector('.unread-badge');
    if (existingBadge) existingBadge.remove();

    if (unreadCount > 0) {
        const badge = document.createElement('span');
        badge.className = 'unread-badge';
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;

        button.style.position = 'relative';
        button.appendChild(badge);
    }
}

/**
 * Inicializa los badges de chat para todos los botones visibles
 */
async function initializeChatBadges() {
    console.log('🔔 initializeChatBadges() llamada');
    
    const chatButtons = document.querySelectorAll('.open-chat-btn');
    console.log('🔔 Botones de chat encontrados:', chatButtons.length);
    
    if (chatButtons.length === 0) return;
    
    const doctorId = getId(doctorState.currentDoctorData, 'doctorId');
    console.log('🔔 Doctor ID:', doctorId);
    
    if (!doctorId) return;
    
    for (const button of chatButtons) {
        const patientId = button.getAttribute('data-patient-id');
        console.log('🔔 Procesando botón para paciente:', patientId);
        
        if (!patientId) continue;
        
        try {
            const chatRoom = await findChatRoomForAppointment(doctorId, patientId);
            console.log('🔔 ChatRoom encontrado:', chatRoom);
            
            if (chatRoom) {
                const chatRoomId = chatRoom.id || chatRoom.Id;
                const unreadCount = await getUnreadMessagesCount(chatRoomId, doctorId);
                console.log('🔔 Mensajes no leídos para mostrar:', unreadCount);
                updateChatButtonBadge(button, unreadCount);
            }
        } catch (error) {
            console.error('❌ Error inicializando badge:', error);
        }
    }
}

document.addEventListener("click", (e) => {
    const toggle = e.target.closest(".appointment-action-toggle");

    // Si tocaste el botón → abrir/cerrar
    if (toggle) {
        const menu = toggle.nextElementSibling;
        menu.classList.toggle("show");
        return;
    }

    // Si tocaste afuera → cerrar todos
    document.querySelectorAll(".appointment-action-dropdown.show")
        .forEach(drop => drop.classList.remove("show"));
});

// ===================================
// CARGA DE DATOS
// ===================================

const fetchPatientName = async (patientId) => {
    try {
        const { Api } = await import('../api.js');
        const patient = await Api.get(`v1/Patient/${patientId}`);
        return `${patient.Name || patient.name || ''} ${patient.lastName || patient.LastName || ''}`.trim() || 'Paciente sin nombre';
    } catch {
        return 'Paciente desconocido';
    }
};

const getDateRange = (selectedDate = null) => {
    let filterDate;
    if (selectedDate) {
        const [year, month, day] = selectedDate.split('-').map(Number);
        filterDate = new Date(year, month - 1, day);
    } else {
        filterDate = new Date();
    }
    filterDate.setHours(0, 0, 0, 0);
    
    const nextDay = new Date(filterDate);
    nextDay.setDate(nextDay.getDate() + 1);
    
    return { filterDate, nextDay };
};

const loadAppointments = async (doctorId, selectedDate = null) => {
    const { ApiScheduling } = await import('../api.js');
    const { filterDate, nextDay } = getDateRange(selectedDate);
    
    console.log('Buscando consultas para doctorId:', doctorId);
    
    const appointments = await ApiScheduling.get(
        `Appointments?doctorId=${doctorId}&startTime=${filterDate.toISOString()}&endTime=${nextDay.toISOString()}`
    );
    
    const allAppointments = Array.isArray(appointments) ? appointments : [];
    
    console.log('âœ… Consultas encontradas:', allAppointments.length);
    console.log(allAppointments);
    
    // Cargar nombres de pacientes
    for (const apt of allAppointments) {

    // Si ya viene el nombre desde el backend â†’ lo usamos tal cual
    if (apt.patientName && apt.patientName.trim() !== '') {
        continue;
    }

    const patientId = apt.patientId || apt.PatientId;
    if (!patientId) {
        apt.patientName = 'Paciente sin ID';
        continue;
    }

    // Como fallback, recién ahí­ pedimos el patient
    apt.patientName = await fetchPatientName(patientId);
}
    
    return { appointments: allAppointments, filterDate };
};

// ===================================
// RENDERIZADO
// ===================================

// Actualizar la función createConsultationItemElement
export function createConsultationItemElement(appointment) {
    const item = document.createElement('div');
    item.className = 'consultation-item';
    
    const startTime = new Date(appointment.startTime || appointment.StartTime);
    const endTime = new Date(appointment.endTime || appointment.EndTime);
    const status = appointment.status || appointment.Status || 'SCHEDULED';
    const statusInfo = getStatusInfo(status);
    
    // Formatear fecha
    const dateStr = startTime.toLocaleDateString('es-AR', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
    });
    const dateFormatted = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    
    item.innerHTML = `
        <!-- HEADER con fondo completo en la parte superior -->
        <div class="consultation-header status-${statusInfo.class}">
            <div class="consultation-icon-wrapper">
                <div class="consultation-icon">
                    <i class="fas fa-user-md"></i>
                </div>
            </div>

            <div class="consultation-info">
                <h4 class="consultation-patient">
                    ${appointment.patientName || 'Paciente Desconocido'}
                </h4>

                <div class="consultation-meta">
                    <span class="consultation-date">
                        <i class="fas fa-calendar-alt"></i> ${dateFormatted}
                    </span>

                    <span class="consultation-time">
                        <i class="fas fa-clock"></i> ${formatTime(startTime)} - ${formatTime(endTime)}
                    </span>
                </div>
            </div>

            <span class="status-badge status ${statusInfo.class}">
                ${statusInfo.text}
            </span>
        </div>

        <div class="consultation-body">
            <div class="consultation-reason-wrapper">
                <i class="fas fa-stethoscope"></i>
                <div class="consultation-reason-content">
                    <strong>Motivo:</strong> 
                    ${appointment.reason || appointment.Reason || 'Sin motivo especificado'}
                </div>
            </div>
        </div>

        <div class="consultation-actions">
            ${getActionButtons(
                status,
                appointment.appointmentId || appointment.AppointmentId,
                appointment.patientId || appointment.PatientId,
                appointment.patientName
            )}

            ${status === 'COMPLETED' ? `
                <button 
                    class="btn btn-info btn-sm btn-hl7-download"
                    data-appointment-id="${appointment.appointmentId || appointment.AppointmentId}"
                    data-patient-id="${appointment.patientId || appointment.PatientId}">
                    <i class="fas fa-file-download"></i> Descargar HL7
                </button>
            ` : ''}
        </div>
    `;
    
    // Event listener para botón HL7
    const hl7Button = item.querySelector('.btn-hl7-download');
    if (hl7Button) {
        hl7Button.addEventListener('click', async function() {
            const appointmentId = this.getAttribute('data-appointment-id');
            const patientId = this.getAttribute('data-patient-id');
            const { downloadHl7Summary } = await import('./doctor-hl7.js');
            await downloadHl7Summary(appointmentId, patientId);
        });
    }
    
    return item;
}



const renderAppointmentsList = (container, appointments, filterDate) => {
    container.innerHTML = '';
    
    if (!appointments || appointments.length === 0) {
        const dateStr = filterDate.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' });
        container.innerHTML = `<p style="color: #6b7280; padding: 2rem; text-align: center;">No hay consultas para el ${dateStr}</p>`;
        return;
    }
    
    appointments.forEach(apt => container.appendChild(createConsultationItemElement(apt)));
};

// ===================================
// CARGA DE CONSULTAS
// ===================================

export async function loadTodayConsultations(selectedDate = null) {
    const consultationsList = document.getElementById('consultations-list');
    if (!consultationsList) return;
    
    console.log('📅 Cargando consultas del día:', selectedDate || 'hoy');
    
    try {
        const doctorId = getId(doctorState.currentDoctorData, 'doctorId');
        if (!doctorId) {
            consultationsList.innerHTML = '<p style="color: #6b7280; padding: 2rem; text-align: center;">No se pudo identificar al médico</p>';
            return;
        }
        
        const { appointments, filterDate } = await loadAppointments(doctorId, selectedDate);
        renderAppointmentsList(consultationsList, appointments, filterDate);
        
    } catch (error) {
        console.error('❌ Error al cargar consultas:', error);
        consultationsList.innerHTML = '<p style="color: #6b7280; padding: 2rem; text-align: center;">No se pudieron cargar las consultas del día</p>';
    }
    
    setTimeout(() => {
        initializeAttendButtons();
        startChatBadgePolling(); 
    }, 100);
}

export async function loadTodayFullHistory() {
    const container = document.getElementById('navbar-today-history');
    if (!container) return;

    if (!doctorState.currentDoctorData?.doctorId) {
        container.innerHTML = "<p>No se pudo identificar al mÃ©dico.</p>";
        return;
    }

    try {
        const { appointments } = await loadAppointments(doctorState.currentDoctorData.doctorId);
        
        if (!appointments || appointments.length === 0) {
            container.innerHTML = "<p>No hay historial del dÃ­a.</p>";
            return;
        }

        container.innerHTML = "";
        appointments.forEach(ap => {
            container.appendChild(createConsultationItemElement({ ...ap, isHistory: true }));
        });

    } catch (err) {
        console.error(err);
        container.innerHTML = "<p>Error cargando historial.</p>";
    }
}


// ===================================
// GESTIÓN DE ESTADOS (con notificaciones)
// ===================================

export async function updateAppointmentStatus(appointmentId, newStatus, reason = null, silent = false) {
    try {
        console.log("🔵 [DOCTOR ACTION] Cambiando estado del turno");
        console.log("   ➤ appointmentId:", appointmentId);
        console.log("   ➤ newStatus:", newStatus);
        console.log("   ➤ reason:", reason);

        const { ApiScheduling, Api, ApiAuth } = await import('../api.js');

        // ================================
        // 1) Obtener turno antes del patch
        // ================================
        console.log("📡 [GET] Obteniendo turno antes de actualizar...");
        const currentAppointment = await ApiScheduling.get(`Appointments/${appointmentId}`);

        console.log("📥 Respuesta GET inicial (antes del PATCH):");
        console.log(JSON.stringify(currentAppointment, null, 2));

        if (!currentAppointment)
            throw new Error("No se encontró el appointment");

        // ================================
        // 2) Ejecutar PATCH en SchedulingMS
        // ================================
        console.log("📡 [PATCH] Enviando actualización de estado a SchedulingMS...");
        console.log("Payload enviado:", { Status: newStatus, Reason: reason });

        const updatedAppointment = await ApiScheduling.patch(
            `Appointments/${appointmentId}/status`,
            {
                Status: newStatus,
                Reason: reason || currentAppointment.reason
            }
        );

        console.log("📥 Respuesta PATCH SchedulingMS:");
        console.log(JSON.stringify(updatedAppointment, null, 2));

        if (!silent) showNotification("Estado del turno actualizado", "success");

        // ============================================================================
        // 3) ARMADO GENERAL PARA NOTIFICACIONES (siempre lo usará CANCEL/CONFIRM)
        // ============================================================================
        const doctorId = updatedAppointment.doctorId;
        const patientId = updatedAppointment.patientId;

        // Obtener doctor
        const doctor = await Api.get(`v1/Doctor/${doctorId}`).catch(e => {
            console.error("❌ Error obteniendo Doctor:", e);
            return null;
        });

        const doctorUserId = doctor?.userId;
        const doctorName = `${doctor?.firstName || ""} ${doctor?.lastName || ""}`.trim();
        const specialty = doctor?.specialty || "Especialidad";

        // Obtener paciente
        const patient = await Api.get(`v1/Patient/${patientId}`).catch(e => {
            console.error("❌ Error obteniendo Paciente:", e);
            return null;
        });

        const patientUserId = patient?.userId;
        const patientName = `${patient?.firstName || ""} ${patient?.lastName || ""}`.trim();

        // GUID determinístico
        let apptGuid = updatedAppointment.appointmentId;
        if (typeof apptGuid === "number") {
            const hex = apptGuid.toString(16).padStart(32, "0");
            apptGuid = [
                hex.substring(0, 8),
                hex.substring(8, 12),
                hex.substring(12, 16),
                hex.substring(16, 20),
                hex.substring(20)
            ].join("-");
        }

        // Fecha - hora
        const appointmentDate = updatedAppointment.startTime.split(" ")[0];
        const appointmentTime = updatedAppointment.startTime.split(" ")[1];

        const basePayload = {
            appointmentId: apptGuid,
            patientName,
            doctorName,
            specialty,
            appointmentDate: `${appointmentDate}T00:00:00`,
            appointmentTime,
            appointmentType: "Presencial",
            notes: updatedAppointment.reason,
            status: updatedAppointment.status
        };

        // ============================================================================
        // 4) NOTIFICACIONES POR CONFIRMACIÓN DEL DOCTOR
        // ============================================================================
        if (newStatus === "CONFIRMED") {
            console.log("📨 Iniciando notificaciones por CONFIRMACIÓN del DOCTOR…");

            if (patientUserId) {
                const notifyPatient = {
                    userId: patientUserId,
                    eventType: "AppointmentConfirmed",
                    payload: basePayload
                };

                console.log("📨 Enviando notificación al PACIENTE por confirmación:", notifyPatient);
                await ApiAuth.post("notifications/events", notifyPatient);
            }

            if (doctorUserId) {
                const notifyDoctor = {
                    userId: doctorUserId,
                    eventType: "AppointmentConfirmedDoctor",
                    payload: basePayload
                };

                console.log("📨 Enviando notificación al DOCTOR por confirmación:", notifyDoctor);
                await ApiAuth.post("notifications/events", notifyDoctor);
            }
        }

        // ============================================================================
        // 5) NOTIFICACIONES POR CANCELACIÓN DEL DOCTOR
        // ============================================================================
        if (newStatus === "CANCELLED") {
            console.log("📨 Iniciando notificaciones por CANCELACIÓN del DOCTOR…");

            // ------------------------------ PACIENTE
            if (patientUserId) {
                const notifyPatient = {
                    userId: patientUserId,
                    eventType: "AppointmentCancelledByDoctor",
                    payload: basePayload
                };

                console.log("📨 Enviando notificación al PACIENTE:", notifyPatient);
                await ApiAuth.post("notifications/events", notifyPatient);
            }

            // ------------------------------ DOCTOR
            if (doctorUserId) {
                const notifyDoctor = {
                    userId: doctorUserId,
                    eventType: "AppointmentCancelledByDoctorDoctor",
                    payload: basePayload
                };

                console.log("📨 Enviando notificación al DOCTOR:", notifyDoctor);
                await ApiAuth.post("notifications/events", notifyDoctor);
            }
        }

        // ================================
        // 6) Refrescar la UI del médico
        // ================================
        await reloadAppointmentViews();

        const { loadDoctorStats } = await import('./doctor-main.js');
        if (loadDoctorStats) await loadDoctorStats();

        setTimeout(() => {
            initializeAttendButtons();
            initializeStatusSelects();
        }, 300);

    } catch (error) {
        console.error("❌ Error al actualizar estado del turno:", error);
        if (!silent) showNotification(`Error al actualizar estado: ${error.message}`, "error");
        throw error;
    }
}




async function reloadAppointmentViews() {
    const agendaSection = document.querySelector('.agenda-section');
    if (agendaSection && agendaSection.style.display !== 'none') {
        const { renderAgendaContent } = await import('./doctor-schedule.js');
        if (renderAgendaContent) await renderAgendaContent(agendaSection);
    }
    
    const consultationsSection = document.querySelector('.consultations-section');
    if (consultationsSection && consultationsSection.style.display !== 'none') {
        const dateFilter = document.getElementById('consultation-date-filter') || document.getElementById('consultation-date-filter-view');
        await loadTodayConsultations(dateFilter?.value || null);
    }
    
    // Recargar dashboard principal manteniendo la fecha actual
    const consultationsList = document.getElementById('consultations-list');
    if (consultationsList) {
        const dateInput = document.querySelector('.date-nav-input');
        const currentDate = dateInput?.value || document.getElementById('consultation-date-filter')?.value;
        if (currentDate) {
            const { loadConsultationsForDate } = await import('./doctor-main.js');
            await loadConsultationsForDate(currentDate);
        } else {
            await loadTodayConsultations(null);
        }
    }
    
    // Actualizar contadores del dashboard
    const { loadDoctorStats } = await import('./doctor-main.js');
    await loadDoctorStats();
}

// =======================================================
// REPROGRAMAR TURNO (DOCTOR) - MODAL + PATCH RESCHEDULE
// =======================================================
export async function openDoctorRescheduleModal(appointment) {
    console.log("📅 Reprogramando turno (abrir modal):", appointment);

    const modal = document.getElementById("reschedule-modal");
    const patientInput = document.getElementById("reschedulePatient");
    const doctorInput = document.getElementById("rescheduleDoctor");
    const dateInput = document.getElementById("date");
    const timeSelect = document.getElementById("time");

    if (!modal || !patientInput || !doctorInput || !dateInput || !timeSelect) {
        console.error("❌ Faltan elementos del modal de reprogramación en el DOM");
        return;
    }

    currentRescheduleContext = appointment;

    const { Api } = await import("../api.js");
    // 🔹 usamos el wrapper que llama al calendario de paciente
    const { loadDoctorAvailableDates } = await import("./doctor-calendar.js");

    // ========== 1) Datos Paciente ==========
    try {
        const p = await Api.get(`v1/Patient/${appointment.patientId}`);
        const firstName =
            p.firstName || p.FirstName || p.name || p.Name || "";
        const lastName =
            p.lastName || p.LastName || "";
        const fullName = `${firstName} ${lastName}`.trim();
        patientInput.value = fullName || "Paciente";
    } catch (e) {
        console.warn("⚠ No se pudo cargar paciente:", e);
        patientInput.value = "Paciente";
    }

    // ========== 2) Datos Doctor ==========
    try {
        const d = await Api.get(`v1/Doctor/${appointment.doctorId}`);
        const df = d.firstName || d.FirstName || "";
        const dl = d.lastName || d.LastName || "";
        doctorInput.value = `Dr. ${df} ${dl}`.trim();
    } catch (e) {
        console.warn("⚠ No se pudo cargar doctor:", e);
        doctorInput.value = "Doctor";
    }

    // Reset fecha y horario
    dateInput.value = "";
    timeSelect.innerHTML = "<option value=''>Seleccionar hora</option>";

    // ========== 3) Cargar disponibilidad REAL del doctor ==========
    await loadDoctorAvailableDates(appointment.doctorId);

    // Mostrar el modal
    modal.classList.remove("hidden");
}

export function initializeDoctorRescheduleModal() {
    if (doctorRescheduleModalInitialized) return;
    doctorRescheduleModalInitialized = true;

    const modal = document.getElementById("reschedule-modal");
    const closeBtns = modal?.querySelectorAll(".close-modal, #cancelReschedule");
    const saveBtn = document.getElementById("saveReschedule");

    if (!modal) {
        console.error("❌ Modal de reprogramación no encontrado en el DOM");
        return;
    }

    // Cerrar modal
    const closeModal = () => {
        modal.classList.add("hidden");
        currentRescheduleContext = null;
    };

    closeBtns?.forEach(btn => btn.addEventListener("click", closeModal));


    // Guardar reprogramación
    saveBtn?.addEventListener("click", async () => {
        const date = document.getElementById("date")?.value;
        const timeValue = document.getElementById("time")?.value;
        const reason =
            document.getElementById("rescheduleReason")?.value ||
            "Reprogramado por el médico";

        if (!currentRescheduleContext) {
            showNotification("No se encontró el turno a reprogramar", "error");
            return;
        }

        if (!date || !timeValue) {
            showNotification("Seleccioná fecha y horario para reprogramar", "error");
            return;
        }

        try {
            const { ApiScheduling } = await import("../api.js");

            const appointmentId =
                currentRescheduleContext.appointmentId ||
                currentRescheduleContext.AppointmentId;

            const doctorId =
                currentRescheduleContext.doctorId ||
                currentRescheduleContext.DoctorId;

            // ==============================
            // 1) Parsear hora desde el value
            //    (JSON que dejó patient-calendar)
            // ==============================
            let hours, minutes;

            try {
                const parsed = JSON.parse(timeValue);
                hours = Number(parsed.localHours);
                minutes = Number(parsed.localMinutes);
            } catch {
                // fallback por si alguna vez viene "HH:mm"
                const [h, m] = timeValue.split(":").map(Number);
                hours = h;
                minutes = m;
            }

            const [year, month, day] = date.split("-").map(Number);
            const startDate = new Date(year, month - 1, day, hours, minutes, 0);
            const seconds = "00";

            // ==============================
            // 2) Offset local (igual que antes)
            // ==============================
            const tz = -startDate.getTimezoneOffset();
            const sign = tz >= 0 ? "+" : "-";
            const oh = String(Math.floor(Math.abs(tz) / 60)).padStart(2, "0");
            const om = String(Math.abs(tz) % 60).padStart(2, "0");

            const offsetStr = `${sign}${oh}:${om}`;

            const newStartTime =
                `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` +
                `T${String(hours).padStart(2, "0")}:` +
                `${String(minutes).padStart(2, "0")}:` +
                `${seconds}${offsetStr}`;

            // ==============================
            // 3) Duración del turno
            // ==============================
            const availabilities = await ApiScheduling.get(
                `DoctorAvailability/search?doctorId=${doctorId}`
            );
            const durationMinutes =
                availabilities?.[0]?.durationMinutes ||
                availabilities?.[0]?.DurationMinutes ||
                30;

            const endDate = new Date(
                startDate.getTime() + durationMinutes * 60000
            );

            const newEndTime =
                `${endDate.getFullYear()}-` +
                `${String(endDate.getMonth() + 1).padStart(2, "0")}-` +
                `${String(endDate.getDate()).padStart(2, "0")}T` +
                `${String(endDate.getHours()).padStart(2, "0")}:` +
                `${String(endDate.getMinutes()).padStart(2, "0")}:` +
                `${seconds}${offsetStr}`;

            // ==============================
            // 4) Enviar PATCH de reschedule
            // ==============================
            await ApiScheduling.patch(`Appointments/${appointmentId}/reschedule`, {
                newStartTime,
                newEndTime,
                reason
            });

            console.log("📥 Respuesta RESCHEDULE:");
            try {
                await updateAppointmentStatus(appointmentId, "CONFIRMED", reason, true);
                console.log("Estado actualizado a CONFIRMED tras reprogramación");
            } catch (err) {
                console.error("❌ Error actualizando estado tras reprogramar:", err);
            }
            showNotification("Turno reprogramado exitosamente", "success");
            
            

            // ===============================
            // 5) NOTIFICACIONES POR REAGENDAMIENTO
            // ===============================
            try {
                const { Api, ApiAuth } = await import("../api.js");

                const doctor = await Api.get(`v1/Doctor/${doctorId}`).catch(() => null);
                const patient = await Api.get(`v1/Patient/${currentRescheduleContext.patientId}`).catch(() => null);

                const doctorUserId = doctor?.userId;
                const patientUserId = patient?.userId;

                const doctorName = `${doctor?.firstName || ""} ${doctor?.lastName || ""}`.trim();
                const patientName = `${patient?.firstName || ""} ${patient?.lastName || ""}`.trim();
                const specialty = doctor?.specialty || "Especialidad";

                // Formatear nueva fecha y hora
                const newStart = new Date(newStartTime);
                const formattedDate = newStart.toLocaleDateString("es-AR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
                const formattedTime =String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0");
                // =========================
                // Normalizar appointmentId a GUID
                // =========================
                let fixedAppointmentId = appointmentId;

                // Si el ID viene como número, lo convertimos a GUID de 32 chars (igual que BE)
                if (typeof appointmentId === "number") {
                    const hex = appointmentId.toString(16).padStart(32, "0");
                    fixedAppointmentId =
                        hex.substring(0, 8) + "-" +
                        hex.substring(8, 12) + "-" +
                        hex.substring(12, 16) + "-" +
                        hex.substring(16, 20) + "-" +
                        hex.substring(20);
                }

                const payload = {
                    appointmentId: fixedAppointmentId,
                    doctorName,
                    patientName,
                    specialty,
                    appointmentDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00`,
                    appointmentTime: formattedTime,
                    appointmentType: "Presencial",
                    notes: reason,
                    status: "Reprogramado"
                };

                // Notificación para PACIENTE
                if (patientUserId) {
                    await ApiAuth.post("notifications/events", {
                        userId: patientUserId,
                        eventType: "AppointmentRescheduled",
                        payload
                    });
                }

                // Notificación para DOCTOR
                if (doctorUserId) {
                    await ApiAuth.post("notifications/events", {
                        userId: doctorUserId,
                        eventType: "AppointmentRescheduledDoctor",
                        payload
                    });
                }

                console.log("📨 Notificaciones enviadas por reprogramación");

            } catch (err) {
                console.error("⚠ Error enviando notificaciones de reschedule:", err);
            }


            closeModal();

            await reloadAppointmentViews();
            const { loadDoctorStats } = await import("./doctor-main.js");
            if (loadDoctorStats) await loadDoctorStats();
        } catch (err) {
            console.error("❌ Error al reprogramar turno:", err);
            showNotification("No se pudo reprogramar el turno", "error");
        }
    });


    console.log("✅ Modal de reprogramación inicializado");
}



// ===================================
// EVENT HANDLERS
// ===================================

export async function handleDoctorChatOpen(appointmentId, patientId, patientName){
    try{
        console.log('Abriendo chat: ', {appointmentId, patientId, patientName})

        // ✅ DEBUG: Ver TODO el estado
        console.log('🔍 DEBUG doctorState completo:', doctorState);
        console.log('🔍 DEBUG doctorState.currentUser:', doctorState.currentUser);
        
        if (!doctorState.currentUser) {
            console.error('❌ No hay usuario autenticado');
            showNotification('Error: No hay usuario autenticado', 'error');
            return;
        }
        
        // ✅ Ver TODAS las propiedades del usuario
        console.log('🔍 Keys del currentUser:', Object.keys(doctorState.currentUser));
        console.log('🔍 currentUser completo:', JSON.stringify(doctorState.currentUser, null, 2));
        
        const currentUserId = doctorState.currentUser.userId || 
                            doctorState.currentUser.UserId || 
                            doctorState.currentUser.id || 
                            doctorState.currentUser.Id;
        
        console.log('✅ userId extraído:', currentUserId);
        
        if (!currentUserId) {
            console.error('❌ No se pudo obtener userId. Propiedades disponibles:', Object.keys(doctorState.currentUser));
            showNotification('Error: No se pudo identificar al usuario', 'error');
            return;
        }

        // ✅ Validar parámetros
        if (!appointmentId || !patientId || !patientName) {
            console.error('❌ Parámetros incompletos:', { appointmentId, patientId, patientName });
            showNotification('No se puede abrir el chat: datos incompletos', 'error');
            return;
        }

        // ✅ Validar que tengamos el usuario actual
        if (!doctorState.currentUser) {
            console.error('❌ No hay usuario autenticado');
            showNotification('Error: No hay usuario autenticado', 'error');
            return;
        }
        
        console.log('👤 Usuario actual:', {
            currentUser: doctorState.currentUser,
            currentUserId: currentUserId
        });
        
        if (!currentUserId) {
            console.error('❌ No se pudo obtener userId:', doctorState.currentUser);
            showNotification('Error: No se pudo identificar al usuario', 'error');
            return;
        }

        const {ApiScheduling} = await import('../api.js')

        // Obtener datos completos del appoinment
        const appoinment = await ApiScheduling.get(`Appointments/${appointmentId}`)

        if(!appoinment){
            showNotification('No se encontró el turno', 'error')
            return
        }

        // Verificar que este confirmado
        const status = appoinment.status || appoinment.Status
        if(status !== 'CONFIRMED' && status !== 'IN_PROGRESS'){
            showNotification('El chat solo esta disponible para turnos confirmados')
            return
        }

        // Crear o recuperar sala del chat
        const chatRoom = await handleAppointmentChatCreation({
            ...appoinment,
            currentUserId: currentUserId
        })

        if(!chatRoom){
            showNotification('No se pudo iniciar el chat. Verifica la conexion.', 'error')
            return
        }

        // Obtener nombre del doctor
        const { getDoctorDisplayName } = await import('./doctor-core.js')
        const doctorName = getDoctorDisplayName()

        const doctorIdforChat = chatRoom.doctorId || chatRoom.DoctorId
        console.log('DoctorID: ', doctorIdforChat)

        // ✅ ANTES de llamar a openChatModal
        const configParaChat = {
            currentUserId: doctorIdforChat,
            currentUserName: getDoctorDisplayName(),
            otherUserName: patientName || 'Paciente',
            userType: 'doctor',
            doctorId: doctorIdforChat,  
            patientId: patientId         
        };
        
        console.log('📞 Config que se pasa a openChatModal:', configParaChat);
        console.log('📞 chatRoom que se pasa:', chatRoom);

        // Abrir modal del chat
       openChatModal(chatRoom, {
            currentUserId: doctorState.currentDoctorData.doctorId,
            currentUserName: doctorName,
            otherUserName: patientName || 'Paciente',
            userType: 'doctor'
        })
        try {
            const { markMessagesAsRead } = await import('../chat/chat-service.js');
            const chatRoomId = chatRoom.id || chatRoom.Id;
            const visitorDoctorId = doctorState.currentDoctorData.doctorId;
            
            await markMessagesAsRead(chatRoomId, visitorDoctorId, 'Doctor');
            console.log('✅ Mensajes marcados como leídos');
            
            // Actualizar el badge del botón a 0
            const chatButton = document.querySelector(`.open-chat-btn[data-patient-id="${patientId}"]`);
            if (chatButton) {
                updateChatButtonBadge(chatButton, 0);
            }
        } catch (error) {
            console.error('⚠️ Error marcando mensajes como leídos:', error);
        }

        showNotification('Chat iniciado', 'success')

    } catch(error){
        console.error('Error al abrir chat: ', error)
        showNotification('Ocurrio un error al intentar abrir el chat', 'error')
    }
}

const replaceEventListener = (button, eventType, handler) => {
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);
    newButton.addEventListener(eventType, handler);
};

// Actualizar initializeAttendButtons para incluir los nuevos botones
export function initializeAttendButtons() {
    console.log('🔘 Inicializando botones de atención');
    
    // Botón Confirmar
    document.querySelectorAll('.confirm-appointment-btn').forEach(button => {
        replaceEventListener(button, 'click', async function() {
            const appointmentId = this.getAttribute('data-appointment-id');
            
            console.log('✅ Confirmando turno:', appointmentId);
            
            if (appointmentId) {
                await updateAppointmentStatus(appointmentId, 'CONFIRMED');
            }
        });
    });
    
    // Botón Atender (CONFIRMED -> IN_PROGRESS)
    document.querySelectorAll('.btn-attend, .attend-appointment-btn').forEach(button => {
        replaceEventListener(button, 'click', async function() {
            const appointmentId = this.getAttribute('data-appointment-id');
            const patientId = this.getAttribute('data-patient-id');
            const patientName = this.getAttribute('data-patient-name');
            
            console.log('👨‍⚕️ Atendiendo consulta:', { appointmentId, patientId, patientName });
            
            if (appointmentId) {
                await updateAppointmentStatus(appointmentId, 'IN_PROGRESS');
                if (patientId && patientName) attendConsultation(appointmentId, patientId, patientName);
            }
        });
    });
    
    // Botón Completar
    document.querySelectorAll('.complete-appointment-btn, .complete-consultation-btn').forEach(button => {
        replaceEventListener(button, 'click', async function() {
            const appointmentId = this.getAttribute('data-appointment-id');
            const patientId = this.getAttribute('data-patient-id');
            const patientName = this.getAttribute('data-patient-name');
            
            console.log('✅ Completando consulta:', { appointmentId, patientId, patientName });
            
            if (appointmentId && patientId && patientName) {
                attendConsultation(appointmentId, patientId, patientName);
            }
        });
    });
    
    // Botón No asistió
    document.querySelectorAll('.no-show-appointment-btn, .no-show-consultation-btn').forEach(button => {
        replaceEventListener(button, 'click', async function() {
            const appointmentId = this.getAttribute('data-appointment-id');
            
            if (appointmentId && confirm('¿El paciente no asistió a la consulta?')) {
                console.log('❌ Marcando como no asistió:', appointmentId);
                await updateAppointmentStatus(appointmentId, 'NO_SHOW', 'Paciente no asistió');
                showNotification('Turno marcado como "No asistió"', 'info');
                await reloadAppointmentViews();
            }
        });
    });
    
    // Botón Cancelar
    document.querySelectorAll('.cancel-appointment-btn').forEach(button => {
        replaceEventListener(button, 'click', async function() {
            const appointmentId = this.getAttribute('data-appointment-id');
            if (!appointmentId) return;
            
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.style.cssText = 'display: flex; z-index: 10000;';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 450px; padding: 1.5rem;">
                    <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #e5e7eb; padding-bottom: 1rem; margin-bottom: 1rem;">
                        <h3 style="color: #111827; margin: 0; display: flex; align-items: center; gap: 0.5rem;"><i class="fas fa-exclamation-triangle" style="color: #ef4444;"></i>Cancelar Turno</h3>
                        <button class="close-modal" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #6b7280; padding: 0; line-height: 1;">&times;</button>
                    </div>
                    <div class="modal-body" style="padding: 0;">
                        <p style="color: #374151; margin-bottom: 1.5rem;">¿Estás seguro de que deseas cancelar este turno?</p>
                        <label style="display: block; color: #374151; margin-bottom: 0.5rem; font-weight: 500;">Motivo de la cancelación (opcional):</label>
                        <textarea id="cancel-reason" rows="3" style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 0.375rem; font-family: inherit; resize: vertical; box-sizing: border-box;" placeholder="Ej: Paciente reprogramó"></textarea>
                    </div>
                    <div style="display: flex; gap: 0.75rem; justify-content: flex-end; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #e5e7eb;">
                        <button id="cancel-confirm-btn" class="btn btn-primary" style="background: #10b981; border: none; padding: 0.625rem 1.5rem;">Confirmar</button>
                        <button class="close-modal btn" style="background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; padding: 0.625rem 1.5rem;">Cancelar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            modal.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', () => modal.remove()));
            modal.querySelector('#cancel-confirm-btn').addEventListener('click', async () => {
                const reason = modal.querySelector('#cancel-reason').value.trim();
                await updateAppointmentStatus(appointmentId, 'CANCELLED', reason || 'Cancelado por el médico');
                showNotification('Turno cancelado exitosamente', 'success');
                modal.remove();
                await reloadAppointmentViews();
            });
        });
    });
    
    // Botón Reprogramar
    document.querySelectorAll(".reschedule-appointment-btn").forEach(button => {
        replaceEventListener(button, "click", async function () {
            const appointmentId = this.getAttribute("data-appointment-id");

            if (!appointmentId) return;

            console.log("📅 Reprogramando turno:", appointmentId);

            const { ApiScheduling } = await import("../api.js");
            const appointment = await ApiScheduling.get(`Appointments/${appointmentId}`);

            // Guardamos y abrimos modal
            openDoctorRescheduleModal(appointment);
        });
    });

    // Boton de chat
    document.querySelectorAll('.open-chat-btn').forEach(button => {
        replaceEventListener(button, 'click', async function(e) {
            e.preventDefault();
            e.stopPropagation();

            const appointmentId = this.getAttribute('data-appointment-id');
            const patientId = this.getAttribute('data-patient-id');
            const patientName = this.getAttribute('data-patient-name');

            console.log('Click en boton de chat: ', { appointmentId, patientId, patientName });

            if (!appointmentId || !patientId || !patientName) {
                console.error('❌ Datos incompletos');
                showNotification('No se puede abrir el chat: datos incompletos', 'error');
                return;
            }
            
            // Limpiar el badge al abrir el chat
            updateChatButtonBadge(this, 0);
            
            await handleDoctorChatOpen(appointmentId, patientId, patientName);
        });
    });
    
    // Inicializar dropdowns (para los botones de menú)
    initializeDropdowns();
    // ✅ NUEVO: Inicializar badges de chat
    initializeChatBadges();
}

function initializeDropdowns() {
    document.querySelectorAll('.dropdown-toggle').forEach(toggle => {
        const newToggle = toggle.cloneNode(true);
        toggle.parentNode.replaceChild(newToggle, toggle);
        
        newToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            
            // Cerrar otros dropdowns
            document.querySelectorAll('.dropdown-menu').forEach(menu => {
                if (menu !== this.nextElementSibling) {
                    menu.style.display = 'none';
                }
            });
            
            // Toggle este dropdown
            const menu = this.nextElementSibling;
            if (menu && menu.classList.contains('dropdown-menu')) {
                menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
            }
        });
    });
    
    // Cerrar dropdowns al hacer click fuera
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.btn-group')) {
            document.querySelectorAll('.dropdown-menu').forEach(menu => {
                menu.style.display = 'none';
            });
        }
    });
    
    // Prevenir que el dropdown se cierre al hacer click en los items
    document.querySelectorAll('.dropdown-item').forEach(item => {
        item.addEventListener('click', function(e) {
            e.stopPropagation();
            // Cerrar el dropdown después de la acción
            setTimeout(() => {
                const menu = this.closest('.dropdown-menu');
                if (menu) menu.style.display = 'none';
            }, 100);
        });
    });
}

export function initializeStatusSelects() {
    console.log('Inicializando selectores de estado');
    
    document.querySelectorAll('.appointment-status-select').forEach(select => {
        replaceEventListener(select, 'change', async function() {
            const appointmentId = this.getAttribute('data-appointment-id');
            const newStatus = this.value;
            
            if (appointmentId && newStatus) {
                const currentStatus = this.options[this.selectedIndex].text;
                
                if (confirm(`¿Cambiar el estado del turno a "${currentStatus}"?`)) {
                    console.log('Cambiando estado:', appointmentId, 'a', newStatus);
                    await updateAppointmentStatus(appointmentId, newStatus);
                } else {
                    await reloadAppointmentViews();
                }
            }
        });
    });
}

export async function attendConsultation(appointmentId, patientId, patientName) {
    try {
        const doctorId = getId(doctorState.currentDoctorData, 'doctorId');
        if (!doctorId) {
            showNotification('No se pudo identificar al mÃ©dico', 'error');
            return;
        }

        console.log('Iniciando consulta:', { appointmentId, patientId, patientName });
        
        // Crear ChatRoom y sala de Daily.co antes de abrir el modal
        const { handleAppointmentChatCreation } = await import('../chat/chat-integration.js');
        const currentUserId = doctorState.currentUser?.userId || doctorState.currentUser?.UserId || doctorState.currentUser?.id || doctorState.currentUser?.Id || doctorId;
        console.log('📞 Creando ChatRoom:', { appointmentId, patientId, doctorId, currentUserId });
        const chatRoom = await handleAppointmentChatCreation({
            appointmentId,
            patientId,
            doctorId,
            status: 'IN_PROGRESS',
            currentUserId
        });
        console.log('📞 ChatRoom resultado:', chatRoom);
        
        // Crear sala de Daily.co (se creará automáticamente al abrir el modal)
        
        showNotification(`Iniciando consulta con ${patientName}...`, 'info');
        
        const button = document.querySelector(`[data-appointment-id="${appointmentId}"]`);
        if (button) {
            button.innerHTML = '<i class="fas fa-video"></i> En consulta';
            button.classList.add('in-consultation');
            button.disabled = true;
        }
        
        const { updateCounter } = await import('./doctor-core.js');
        updateCounter('active-consultation', 1);
        
        const { openEncounterModal } = await import('./doctor-encounters.js');
        openEncounterModal(appointmentId, patientId, patientName);
        
    } catch (error) {
        console.error('Error al iniciar consulta:', error);
        showNotification('Error al iniciar la consulta', 'error');
    }
}

// VISTAS

export function initializeConsultationDateFilter() {
    const dateFilter = document.getElementById('consultation-date-filter');
    if (!dateFilter) return;
    
    console.log('📅 Inicializando filtro de fecha');
    
    // Obtener fecha de hoy en zona horaria local (no UTC)
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    
    console.log('📅 Fecha de hoy (local):', todayStr);
    
    dateFilter.value = todayStr;
    
    // Cargar consultas de hoy automáticamente al inicializar
    loadTodayConsultations(todayStr).catch(err => {
        console.error('❌ Error al cargar consultas de hoy:', err);
    });
    
    dateFilter.addEventListener('change', async function(e) {
        const selectedDate = e.target.value;
        if (selectedDate) {
            console.log('📅 Fecha seleccionada:', selectedDate);
            await loadTodayConsultations(selectedDate);
        }
    });

    // Botones de navegación de fecha
    const prevDayBtn = document.getElementById('prev-day-btn');
    const nextDayBtn = document.getElementById('next-day-btn');
    const todayBtn = document.getElementById('today-btn');

    if (prevDayBtn) {
        prevDayBtn.addEventListener('click', () => {
            const currentDate = new Date(dateFilter.value || todayStr + 'T00:00:00');
            currentDate.setDate(currentDate.getDate() - 1);
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const day = String(currentDate.getDate()).padStart(2, '0');
            const newDateStr = `${year}-${month}-${day}`;
            dateFilter.value = newDateStr;
            dateFilter.dispatchEvent(new Event('change'));
        });
    }

    if (nextDayBtn) {
        nextDayBtn.addEventListener('click', () => {
            const currentDate = new Date(dateFilter.value || todayStr + 'T00:00:00');
            currentDate.setDate(currentDate.getDate() + 1);
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const day = String(currentDate.getDate()).padStart(2, '0');
            const newDateStr = `${year}-${month}-${day}`;
            dateFilter.value = newDateStr;
            dateFilter.dispatchEvent(new Event('change'));
        });
    }

    if (todayBtn) {
        todayBtn.addEventListener('click', () => {
            // Recalcular fecha de hoy para asegurar que sea correcta
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const currentTodayStr = `${year}-${month}-${day}`;
            dateFilter.value = currentTodayStr;
            dateFilter.dispatchEvent(new Event('change'));
        });
    }
}

export async function loadTodayConsultationsView() {
    const dashboardContent = document.querySelector('.dashboard-content');
    if (!dashboardContent) return;

    dashboardContent.querySelectorAll('.consultas-section').forEach(sec => sec.remove());

    const section = document.createElement('div');
    section.className = 'dashboard-section consultas-section';
    // Obtener fecha de hoy en zona horaria local (no UTC)
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    
    section.innerHTML = `
    <div class="section-header">
        <div>
            <h3>Historial de Consultas</h3>
            <p>Filtra las consultas por fecha</p>
        </div>

        <div class="date-filter-container">
            <label for="consultation-date-filter-view" class="date-filter-label">
                <i class="fas fa-calendar-alt"></i> Fecha:
            </label>

            <div class="date-navigation">
                <button type="button" id="prev-day-btn-view" class="date-nav-btn" title="Día anterior">
                    <i class="fas fa-chevron-left"></i>
                </button>

                <input type="date" 
                       id="consultation-date-filter-view" 
                       class="date-filter-input"
                       value="${todayStr}">

                <button type="button" id="next-day-btn-view" class="date-nav-btn" title="Día siguiente">
                    <i class="fas fa-chevron-right"></i>
                </button>

                <button type="button" id="today-btn-view" class="date-nav-btn today-btn" title="Ir a hoy">
                    Hoy
                </button>
            </div>
        </div>
    </div>

    <div id="consultas-hoy-list" class="consultations-list">
        <p class="consultations-loading">Cargando...</p>
    </div>
`;

    
    dashboardContent.appendChild(section);

    const dateFilterView = document.getElementById('consultation-date-filter-view');
    if (dateFilterView) {
        dateFilterView.addEventListener('change', async function(e) {
            const selectedDate = e.target.value;
            if (selectedDate) {
                await loadTodayConsultationsForNav(selectedDate);
            }
        });
    }

    // Botones de navegación de fecha para la vista dinámica
    const prevDayBtnView = document.getElementById('prev-day-btn-view');
    const nextDayBtnView = document.getElementById('next-day-btn-view');

    if (prevDayBtnView && dateFilterView) {
        prevDayBtnView.addEventListener('click', () => {
            const currentDate = new Date(dateFilterView.value || todayStr + 'T00:00:00');
            currentDate.setDate(currentDate.getDate() - 1);
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const day = String(currentDate.getDate()).padStart(2, '0');
            const newDateStr = `${year}-${month}-${day}`;
            dateFilterView.value = newDateStr;
            dateFilterView.dispatchEvent(new Event('change'));
        });
    }

    if (nextDayBtnView && dateFilterView) {
        nextDayBtnView.addEventListener('click', () => {
            const currentDate = new Date(dateFilterView.value || todayStr + 'T00:00:00');
            currentDate.setDate(currentDate.getDate() + 1);
            const year = currentDate.getFullYear();
            const month = String(currentDate.getMonth() + 1).padStart(2, '0');
            const day = String(currentDate.getDate()).padStart(2, '0');
            const newDateStr = `${year}-${month}-${day}`;
            dateFilterView.value = newDateStr;
            dateFilterView.dispatchEvent(new Event('change'));
        });
    }

    const todayBtnView = document.getElementById('today-btn-view');
    if (todayBtnView && dateFilterView) {
        todayBtnView.addEventListener('click', () => {
            // Recalcular fecha de hoy para asegurar que sea correcta
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const currentTodayStr = `${year}-${month}-${day}`;
            dateFilterView.value = currentTodayStr;
            dateFilterView.dispatchEvent(new Event('change'));
        });
    }

    await loadTodayConsultationsForNav(todayStr);
}

async function loadTodayConsultationsForNav(selectedDate = null) {
    const list = document.getElementById('consultas-hoy-list');
    if (!list) return;

    try {
        const doctorId = getId(doctorState.currentDoctorData, 'doctorId');
        if (!doctorId) {
            list.innerHTML = '<p style="padding:1rem; text-align:center;">No se pudo identificar al mÃ©dico</p>';
            return;
        }

        const { appointments, filterDate } = await loadAppointments(doctorId, selectedDate);
        renderAppointmentsList(list, appointments, filterDate);

    } catch (e) {
        console.error('Error cargando consultas', e);
        list.innerHTML = `<p>Error cargando consultas</p>`;
    }
}   

export async function loadPatientsView() {
    console.log('Cargando vista de pacientes...');
    
    const { loadClinicalHistoryView } = await import('./doctor-clinical.js');
    await loadClinicalHistoryView();
}

export function updateCounter(elementId, change) {
    const element = document.getElementById(elementId);
    if (element) {
        const currentValue = parseInt(element.textContent) || 0;
        element.textContent = Math.max(0, currentValue + change);
    }
}

export { doctorState };

// ===================================
// POLLING DE BADGES DE CHAT
// ===================================

let chatBadgeInterval = null;

export function startChatBadgePolling() {
    // Limpiar intervalo anterior si existe
    if (chatBadgeInterval) {
        clearInterval(chatBadgeInterval);
    }
    
    // Actualizar inmediatamente
    initializeChatBadges();
    
    // Luego cada 30 segundos
    chatBadgeInterval = setInterval(() => {
        initializeChatBadges();
    }, 30000);
    
    console.log('✅ Polling de badges de chat iniciado');
}

export function stopChatBadgePolling() {
    if (chatBadgeInterval) {
        clearInterval(chatBadgeInterval);
        chatBadgeInterval = null;
        console.log('🛑 Polling de badges de chat detenido');
    }
}
