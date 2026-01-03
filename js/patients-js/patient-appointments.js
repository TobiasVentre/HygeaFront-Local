// ============================================
// GESTIÓN DE TURNOS
// ============================================

import { appState } from './patient-state.js';
import { getActiveSection } from './patient-utils.js';
import { showNotification } from './patient-notifications.js';
import { handleAppointmentChatCreation, openChatModal } from '../chat/chat-integration.js';
import { getStatusFilter } from './patient-filters.js';
// En la sección de imports

/**
 * Renderiza turnos para la página de inicio (solo 3 próximos)
 */
export function renderAppointmentsHome(appointments) {
    return appointments.map(apt => {
        const aptStart = new Date(apt.startTime || apt.StartTime);

        const year = aptStart.getFullYear();
        const month = String(aptStart.getMonth() + 1).padStart(2, '0');
        const day = String(aptStart.getDate()).padStart(2, '0');
        const time = aptStart.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        
        const dateStr = `${year}-${month}-${day} - ${time}`;

        const d = window.doctorsMap.get(apt.doctorId || apt.DoctorId) || {};
        const doctorName = d.name || "Dr. Desconocido";
        const specialty = d.specialty || "Especialidad no disponible";

        const status = (apt.status || apt.Status || "SCHEDULED").toLowerCase();
        const statusMap = {
            scheduled: "Programado",
            confirmed: "Confirmado",
            cancelled: "Cancelado",
            completed: "Completado",
            in_progress: "En curso",
            pending: "Pendiente",
            no_show: "Ausente",
            rescheduled: "Reprogramado"
        };

        const appointmentId = 
            apt.appointmentId || 
            apt.AppointmentId || 
            apt.id || 
            apt.Id || 
            apt.appointmentID ||
            apt.AppointmentID;
        const doctorId = apt.doctorId || apt.DoctorId;

        // Chat disponible si está confirmado o en progreso
        const chatAvailable = status === 'confirmed' || status === 'in_progress';
        const videoCallAvailable = status === 'in_progress';

        return `
            <div class="appointment-home-card">
                <div class="appointment-home-icon">
                    <i class="fas fa-calendar-day"></i>
                </div>
                <div class="appointment-home-content">
                    <h4 class="appointment-home-doctor">${doctorName}</h4>
                    <div class="appointment-home-specialty">${specialty}</div>
                    <div class="appointment-home-datetime">
                        <i class="fas fa-clock"></i>
                        <span>${dateStr}</span>
                    </div>
                </div>
                <div class="appointment-home-actions" style="display: flex; align-items: center; gap: 0.75rem;">
                    ${videoCallAvailable && appointmentId && doctorId && doctorName ? `
                        <button class="btn-home-video-call"
                            data-appointment-id="${appointmentId}"
                            data-doctor-id="${doctorId}"
                            data-doctor-name="${doctorName}"
                            title="Unirse a la videollamada"
                            style="background: #10b981; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; font-weight: 500;">
                            <i class="fas fa-video"></i> Atender
                        </button>
                    ` : ""}
                    ${chatAvailable && appointmentId && doctorId && doctorName ? `
                        <button class="btn-clean-chat"
                            data-appointment-id="${appointmentId}"
                            data-doctor-id="${doctorId}"
                            data-doctor-name="${doctorName}"
                            title="Chat con el doctor">
                        <i class="fas fa-comments"></i>
                        </button>
                    ` : ""}
                    <div class="appointment-clean-status status-${status}">
                        ${statusMap[status] || status}
                    </div>
                </div>
            </div>
        `;
    }).join('');
     applyStylesAfterRender();
}
function applyStylesAfterRender() {
    const statusElements = document.querySelectorAll('.appointment-card');
    statusElements.forEach(element => {
        const status = element.classList.contains('status-scheduled') ? 'scheduled' :
                      element.classList.contains('status-confirmed') ? 'confirmed' :
                      element.classList.contains('status-cancelled') ? 'cancelled' : '';
        
        // Aplica clases de estilo o fuerza el renderizado si es necesario
        if (status) {
            element.style.display = 'block'; // Asegúrate de que el contenido sea visible
        }
    });
}
/**
 * Renderiza lista completa de turnos (para sección Mis Turnos)
 */
export function renderAppointmentsFull(appointments) {
    return appointments.map(apt => {
        console.log('📋 APPOINTMENT COMPLETO:', JSON.stringify(apt, null, 2));

        const aptStart = new Date(apt.startTime || apt.StartTime);

        const weekday = aptStart.toLocaleDateString("es-AR", { weekday: "long" });
        const day = aptStart.getDate();
        const month = aptStart.toLocaleDateString("es-AR", { month: "long" });
        const year = aptStart.getFullYear();
        const time = aptStart.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        
        const dateTimeStr = `${weekday}, ${day} de ${month} de ${year} - ${time}`;

        const d = window.doctorsMap.get(apt.doctorId || apt.DoctorId) || {};
        const doctorName = d.name || "Dr. Desconocido";
        const specialty = d.specialty || "Especialidad no disponible";

        const reason = apt.reason || apt.Reason || apt.reasonText || "Sin motivo especificado";

        const status = (apt.status || apt.Status || "SCHEDULED").toLowerCase();
        const statusMap = {
            scheduled: "Programado",
            confirmed: "Confirmado",
            cancelled: "Cancelado",
            completed: "Completado",
            in_progress: "En curso",
            no_show: "Ausente",
            rescheduled: "Reprogramado"
        };

        const appointmentId = 
            apt.appointmentId || 
            apt.AppointmentId || 
            apt.id || 
            apt.Id || 
            apt.appointmentID ||
            apt.AppointmentID;
        const doctorId = apt.doctorId || apt.DoctorId;
        const canCancel = status === "confirmed" || status === "scheduled" || status === "rescheduled";

        const chatAvailable = status === 'confirmed' || status === 'in_progress';
        const videoCallAvailable = status === 'in_progress';

        return `
            <div class="appointment-clean-card">
                <div class="appointment-clean-icon">
                    <i class="fas fa-calendar-alt"></i>
                </div>
                <div class="appointment-clean-content">
                    <div class="appointment-clean-header">
                        <h4 class="appointment-clean-doctor">${doctorName}</h4>
                        <span class="appointment-clean-status status-${status}">
                            ${statusMap[status] || status}
                        </span>
                    </div>
                    <div class="appointment-clean-specialty">${specialty}</div>
                    <div class="appointment-clean-datetime">
                        <i class="fa-regular fa-clock"></i>
                        <span>${dateTimeStr}</span>
                    </div>
                    <div class="appointment-clean-reason">
                        <strong>Motivo:</strong> ${reason}
                    </div>
                </div>
                <div class="appointment-clean-actions" style="display: flex; flex-direction: row; gap: 0.75rem; align-items: center;">
                    ${videoCallAvailable && appointmentId && doctorId && doctorName ? `
                        <button class="btn-clean-video-call"
                            data-appointment-id="${appointmentId}"
                            data-doctor-id="${doctorId}"
                            data-doctor-name="${doctorName}"
                            title="Unirse a la videollamada"
                            style="background: #10b981; color: white; border: none; padding: 0.625rem 1rem; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; font-weight: 500;">
                            <i class="fas fa-video"></i> Atender
                        </button>
                    ` : ""}
                    ${chatAvailable && appointmentId && doctorId && doctorName ? `
                    <button class="btn-clean-chat"
                            data-appointment-id="${appointmentId}"
                            data-doctor-id="${doctorId}"
                            data-doctor-name="${doctorName}"
                            title="Chat con el doctor">
                        <i class="fas fa-comments"></i>
                    </button>
                    ` : ""}
                    ${canCancel ? `
                        <button 
                            onclick="cancelAppointment(${appointmentId})"
                            title="Cancelar turno"
                            style="
                                background-color: #dc2626;
                                color: #fff;
                                border: none;
                                padding: 0.7rem 1.4rem;
                                border-radius: 10px;
                                cursor: pointer;
                                display: inline-flex;
                                align-items: center;
                                gap: 0.6rem;
                                font-size: 1rem;
                                font-weight: 600;
                                box-shadow: 0 2px 4px rgba(0,0,0,0.12);
                                transition: background-color .2s ease;
                            "
                            onmouseover="this.style.backgroundColor='#b91c1c'"
                            onmouseout="this.style.backgroundColor='#dc2626'"
                        >
                            <i class="fas fa-times" style="font-size: 1rem;"></i>
                            Cancelar
                        </button>
                    ` : ""}
                </div>
            </div>
        `;
    }).join('');
}

// Funcion Handle del chat para pasiente
async function handlePatientChatOpen(appointmentId, doctorId, doctorName){
    try{
        console.log('Abriendo chat: ', {appointmentId, doctorId, doctorName})

        if (!appointmentId || !doctorId || !doctorName) {
            console.error('❌ Parámetros incompletos:', { appointmentId, doctorId, doctorName });
            showNotification('No se puede abrir el chat: datos incompletos', 'error');
            return;
        }
        
        if (!appState.currentUser) {
            console.error('❌ No hay usuario autenticado');
            showNotification('Error: No hay usuario autenticado', 'error');
            return;
        }
        
        const currentUserId = appState.currentUser.userId || 
                            appState.currentUser.UserId || 
                            appState.currentUser.id || 
                            appState.currentUser.Id;
        
        console.log('👤 Usuario actual:', {
            currentUser: appState.currentUser,
            currentUserId: currentUserId
        });

        if (!currentUserId) {
            console.error('❌ No se pudo obtener userId:', appState.currentUser);
            showNotification('Error: No se pudo identificar al usuario', 'error');
            return;
        }

        const {ApiScheduling} = await import('../api.js')

        const appoinment = await ApiScheduling.get(`Appointments/${appointmentId}`)

        if(!appoinment){
            showNotification('No se encontro el turno', 'error')
            return
        }

        const status = (appoinment.status || appoinment.Status || '').toLowerCase()
        if(status !== 'confirmed' && status !== 'in_progress'){
            showNotification('El chat solo esta disponible para turnos confirmados', 'warning')
            return
        }

        const chatRoom = await handleAppointmentChatCreation({
            ...appoinment,
            currentUserId: currentUserId
        })

        if(!chatRoom){
            showNotification('No se pudo iniciar el chat. Verificar la conexion.', 'error')
            return
        }

        const patientFirstName = appState.currentPatient?.firstName || appState.currentPatient?.FirstName || ''
        const patientLastName = appState.currentPatient?.lastName || appState.currentPatient?.LastName || ''
        const patientName = `${patientFirstName} ${patientLastName}`.trim() || 'Paciente'

        const patientIdForChat = chatRoom.patientId || chatRoom.PatientId
        console.log('patientId: ', patientIdForChat)

        openChatModal(chatRoom, {
            currentUserId: chatRoom.patientId || chatRoom.PatientId,
            currentUserName: patientName,
            otherUserName: doctorName || 'Doctor',
            userType: 'patient',
            patientId: chatRoom.patientId || chatRoom.PatientId,  
            doctorId: chatRoom.doctorId || chatRoom.DoctorId      
        })

        // ✅ Marcar mensajes como leídos y actualizar badge
        try {
            const { markMessagesAsRead } = await import('../chat/chat-service.js');
            const chatRoomId = chatRoom.id || chatRoom.Id;
            
            // 🔍 DEBUG
            console.log('🔍 DEBUG - chatRoom completo:', JSON.stringify(chatRoom, null, 2));
            console.log('🔍 DEBUG - chatRoomId:', chatRoomId);
            console.log('🔍 DEBUG - patientIdForChat:', patientIdForChat);
            console.log('🔍 DEBUG - appState.currentPatient:', appState.currentPatient);
            
            await markMessagesAsRead(chatRoomId, patientIdForChat, 'Patient');
            console.log('✅ Mensajes marcados como leídos por el paciente');
            
            // Actualizar el badge del botón a 0
            const chatButton = document.querySelector(`.btn-clean-chat[data-doctor-id="${doctorId}"]`);
            if (chatButton) {
                updateChatButtonBadge(chatButton, 0);
            }
        } catch (error) {
            console.error('⚠️ Error marcando mensajes como leídos:', error);
        }

        showNotification('Chat iniciado', 'success') 
        
    } catch(error){
        console.error('Error al abrir el chat: ', error)
        showNotification('Ocurrio un error al intentar abrir el chat', 'error')
    }
}


// Inicializar botones del chat
function initializeChatButtons(){
    console.log('Inicializando botones de chat para paciente')

    document.querySelectorAll('.btn-clean-chat').forEach(button => {
        const newButton = button.cloneNode(true)
        button.parentNode.replaceChild(newButton, button)

        newButton.addEventListener('click', async function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const appointmentId = this.getAttribute('data-appointment-id');
            const doctorId = this.getAttribute('data-doctor-id');
            const doctorName = this.getAttribute('data-doctor-name');
            
            console.log('🗨️ Click en botón de chat:', { appointmentId, doctorId, doctorName });
            
            if (!appointmentId || !doctorId || !doctorName) {
                console.error('❌ Datos incompletos:', { 
                    appointmentId: appointmentId || 'FALTA', 
                    doctorId: doctorId || 'FALTA', 
                    doctorName: doctorName || 'FALTA' 
                });
                showNotification('No se puede abrir el chat: datos incompletos', 'error');
                return;
            }
            
            // ✅ Limpiar badge al abrir el chat
            updateChatButtonBadge(this, 0);
            
            await handlePatientChatOpen(appointmentId, doctorId, doctorName);
        });
    });
    
    // Inicializar botones de videollamada
    document.querySelectorAll('.btn-clean-video-call, .btn-home-video-call').forEach(button => {
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
        
        newButton.addEventListener('click', async function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const appointmentId = this.getAttribute('data-appointment-id');
            const doctorId = this.getAttribute('data-doctor-id');
            const doctorName = this.getAttribute('data-doctor-name');
            
            if (appointmentId && doctorId && doctorName) {
                const { openPatientVideoCall } = await import('./patient-video-call.js');
                await openPatientVideoCall(appointmentId, doctorId, doctorName);
            }
        });
    });
    
    // ✅ Inicializar badges después de configurar los botones
    initializeChatBadges();
}

/**
 * Carga turnos del paciente desde el backend
 */
export async function loadPatientAppointments() {
    try {
        if (!appState.currentPatient?.patientId) {
            console.warn('No hay patientId disponible para cargar turnos');
            return;
        }

        const { ApiScheduling, Api } = await import('../api.js');
        
        // Obtener el estado filtrado
        const status = getStatusFilter();

        let url = `Appointments?patientId=${appState.currentPatient.patientId}`;
        
        if (status) {
            url += `&status=${status}`;
        }

        const appointmentsResponse = await ApiScheduling.get(url);

        const appointments = Array.isArray(appointmentsResponse)
            ? appointmentsResponse
            : (appointmentsResponse?.value || appointmentsResponse || []);

        const appointmentsList = document.getElementById('appointments-list');
        if (!appointmentsList) return;

        if (!appointments || appointments.length === 0) {
            appointmentsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar-times"></i>
                    <p>No tienes turnos programados</p>
                </div>`;
            return;
        }

        appointments.sort((a, b) =>
            new Date(a.startTime || a.StartTime) - new Date(b.startTime || b.StartTime)
        );

        // Obtener info del doctor
        const doctorIds = [...new Set(appointments.map(a => a.doctorId || a.DoctorId))];
        const doctorsMap = new Map();

        for (const id of doctorIds) {
            try {
                const d = await Api.get(`v1/Doctor/${id}`);
                doctorsMap.set(id, {
                    name: `Dr. ${d.firstName || d.FirstName || ''} ${d.lastName || d.LastName || ''}`.trim(),
                    specialty: d.specialty || d.Specialty || "Especialidad no disponible"
                });
            } catch {
                doctorsMap.set(id, {
                    name: "Dr. Desconocido",
                    specialty: "Especialidad no disponible"
                });
            }
        }

        window.doctorsMap = doctorsMap;

        const activeSection = getActiveSection();

        if (activeSection === "inicio") {
            const latestAppointments = appointments.slice(0, 3);
            appointmentsList.innerHTML = renderAppointmentsHome(latestAppointments);
        } else if (activeSection === "turnos") {
            appointmentsList.innerHTML = renderAppointmentsFull(appointments);
        }

        // ✅ CRÍTICO: Inicializar botones de chat Y aplicar estilos
        setTimeout(() => {
            initializeChatButtons();
            
            // Aplicar estilos inmediatamente después de renderizar
            if (typeof forceStyleUpdate === 'function') {
                forceStyleUpdate();
            } else if (typeof window.forceStyleUpdate === 'function') {
                window.forceStyleUpdate();
            }
        }, 150);

    } catch (error) {
        console.error('Error al cargar turnos:', error);

        const appointmentsList = document.getElementById('appointments-list');
        if (appointmentsList) {
            appointmentsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>No se pudieron cargar los turnos</p>
                </div>`;
        }
    }
}

/**
 * Cancela un turno
 */
export async function cancelAppointment(appointmentId) {
    if (!confirm('¿Estás seguro de que deseas cancelar este turno?')) {
        return;
    }

    try {
        const { ApiScheduling, ApiAuth, Api } = await import('../api.js');

        // =====================================================
        // 1) Cancelar en SchedulingMS
        // =====================================================
        const appointment = await ApiScheduling.patch(
            `Appointments/${appointmentId}/cancel`,
            { reason: 'Cancelado por el paciente' }
        );

        console.log("Turno cancelado:", appointment);

        showNotification('Turno cancelado exitosamente', 'success');

        const doctorId = appointment.doctorId;
        const patientId = appointment.patientId;

        // =====================================================
        // 2) Obtener UserId REAL del doctor desde DirectoryMS
        // =====================================================
        let doctor = null;
        try {
            doctor = await Api.get(`v1/Doctor/${doctorId}`);
        } catch (err) {
            console.error("❌ Error obteniendo doctor:", err);
        }

        if (!doctor || !doctor.userId) {
            console.error("❌ No se pudo obtener doctor.userId, abortando envío de notificaciones");
            return;
        }

        const doctorUserId = doctor.userId;
        const doctorName = `${doctor.firstName} ${doctor.lastName}`;
        const specialty = doctor.specialty || "Especialidad";

        // =====================================================
        // 3) Obtener UserId REAL del paciente desde DirectoryMS
        // =====================================================
        let patient = null;
        try {
            patient = await Api.get(`v1/Patient/${patientId}`);
        } catch (err) {
            console.error("❌ Error obteniendo paciente:", err);
        }

        if (!patient || !patient.userId) {
            console.error("❌ No se pudo obtener patient.userId, abortando notificación al paciente.");
        }

        const patientUserId = patient?.userId;
        const patientName = `${patient?.firstName || ''} ${patient?.lastName || ''}`.trim();

        // =====================================================
        // 4) Convertir appointmentId numérico -> GUID determinístico
        // =====================================================
        let apptGuid = appointment.appointmentId;
        if (typeof apptGuid === "number") {
            apptGuid = numberToDeterministicGuid(apptGuid);
        }

        // =====================================================
        // 5) Preparar payload base (doctor y paciente)
        // =====================================================
        const appointmentDate = appointment.startTime.split(" ")[0];
        const appointmentTime = appointment.startTime.split(" ")[1];

        const basePayload = {
            appointmentId: apptGuid,
            patientName: patientName,
            doctorName: doctorName,
            specialty: specialty,
            appointmentDate: `${appointmentDate}T00:00:00`,
            appointmentTime: appointmentTime,
            appointmentType: "Presencial",
            notes: appointment.reason,
            status: appointment.status
        };


        // =====================================================
        // 6) Notificación → DOCTOR
        // =====================================================
        const notifyDoctorRequest = {
            userId: doctorUserId,
            eventType: "AppointmentCancelledByPatientDoctor",
            payload: basePayload
        };

        console.log("📨 Notificación -> DOCTOR:", notifyDoctorRequest);

        await ApiAuth.post("notifications/events", notifyDoctorRequest);


        // =====================================================
        // 7) Notificación → PACIENTE
        // =====================================================
        if (patientUserId) {
            const notifyPatientRequest = {
                userId: patientUserId,
                eventType: "AppointmentCancelledByPatient",
                payload: basePayload
            };

            console.log("📨 Notificación -> PACIENTE:", notifyPatientRequest);

            await ApiAuth.post("notifications/events", notifyPatientRequest);
        } else {
            console.warn("⚠ No se envió notificación al paciente porque no se obtuvo patient.userId");
        }


        // =====================================================
        // 8) Refrescar UI
        // =====================================================
        await loadPatientAppointments();

        const { loadPatientStats } = await import('./patient-dashboard.js');
        await loadPatientStats();


    } catch (error) {
        console.error('❌ Error al cancelar turno:', error);
        const errorMessage = error.message || error.toString();
        showNotification(`No se pudo cancelar el turno: ${errorMessage}`, 'error');
    }
}


// =====================================================
// Utilidad: convertir número -> GUID determinístico
// =====================================================
function numberToDeterministicGuid(num) {
    const hex = num.toString(16).padStart(32, "0");
    return [
        hex.substring(0, 8),
        hex.substring(8, 12),
        hex.substring(12, 16),
        hex.substring(16, 20),
        hex.substring(20)
    ].join("-");
}
// ===================================
// MENSAJES NO LEÍDOS - CHAT (Paciente)
// ===================================

/**
 * Obtiene el conteo de mensajes no leídos para una sala de chat
 */
async function getUnreadMessagesCount(chatRoomId, patientId) {
    try {
        const { getChatMessages } = await import('../chat/chat-service.js');
        
        console.log('🔍 Obteniendo mensajes para chatRoom:', chatRoomId, 'paciente:', patientId);
        
        const messages = await getChatMessages(chatRoomId, patientId, 1, 100);
        
        console.log('🔍 Mensajes obtenidos:', messages);
        
        if (!messages || !Array.isArray(messages)) return 0;
        
        // Filtrar mensajes no leídos que fueron enviados por el DOCTOR
        const unreadCount = messages.filter(msg => {
            const isRead = msg.isRead || msg.IsRead;
            const senderRole = msg.senderRole || msg.SenderRole;
            return !isRead && senderRole !== 'Patient';
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
async function findChatRoomForAppointment(patientId, doctorId) {
    try {
        const { getUserChatRooms } = await import('../chat/chat-service.js');
        
        console.log('🔍 Buscando chatRooms para paciente:', patientId);
        
        const chatRooms = await getUserChatRooms(patientId);
        
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
    // Remover badge existente
    const existingBadge = button.querySelector('.unread-badge');
    if (existingBadge) {
        existingBadge.remove();
    }
    
    // Si hay mensajes no leídos, agregar badge
    if (unreadCount > 0) {
        const badge = document.createElement('span');
        badge.className = 'unread-badge';
        badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
        button.style.position = 'relative';
        button.appendChild(badge);
        console.log('✅ Badge agregado con count:', unreadCount);
    }
}

/**
 * Inicializa los badges de chat para todos los botones visibles
 */
async function initializeChatBadges() {
    console.log('🔔 initializeChatBadges() llamada (paciente)');
    
    const chatButtons = document.querySelectorAll('.btn-clean-chat');
    console.log('🔔 Botones de chat encontrados:', chatButtons.length);
    
    if (chatButtons.length === 0) return;
    
    const patientId = appState.currentPatient?.patientId;
    console.log('🔔 Patient ID:', patientId);
    
    if (!patientId) return;
    
    for (const button of chatButtons) {
        const doctorId = button.getAttribute('data-doctor-id');
        console.log('🔔 Procesando botón para doctor:', doctorId);
        
        if (!doctorId) continue;
        
        try {
            const chatRoom = await findChatRoomForAppointment(patientId, doctorId);
            console.log('🔔 ChatRoom encontrado:', chatRoom);
            
            if (chatRoom) {
                const chatRoomId = chatRoom.id || chatRoom.Id;
                const unreadCount = await getUnreadMessagesCount(chatRoomId, patientId);
                console.log('🔔 Mensajes no leídos para mostrar:', unreadCount);
                updateChatButtonBadge(button, unreadCount);
            }
        } catch (error) {
            console.error('❌ Error inicializando badge:', error);
        }
    }
}


// ===================================
// POLLING DE BADGES DE CHAT
// ===================================

let chatBadgeInterval = null;

export function startChatBadgePolling() {
    if (chatBadgeInterval) {
        clearInterval(chatBadgeInterval);
    }
    
    initializeChatBadges();
    
    chatBadgeInterval = setInterval(() => {
        initializeChatBadges();
    }, 30000);
    
    console.log('✅ Polling de badges de chat iniciado (paciente)');
}

export function stopChatBadgePolling() {
    if (chatBadgeInterval) {
        clearInterval(chatBadgeInterval);
        chatBadgeInterval = null;
        console.log('🛑 Polling de badges de chat detenido (paciente)');
    }
}



// Exportar para uso global
window.cancelAppointment = cancelAppointment;