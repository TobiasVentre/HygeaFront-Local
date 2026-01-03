// ============================================
// INTEGRACIÓN DEL CHAT CON TURNOS
// ============================================

import { createChatRoom, getUserChatRooms } from './chat-service.js';
import { ChatComponent } from './chat-component.js';

/**
 * Crea o recupera una sala de chat para un turno
 */
export async function handleAppointmentChatCreation(appointment) {
    try {
        // Validar estado del turno
        const status = (appointment.status || appointment.Status || '').toUpperCase();
        if (status !== 'CONFIRMED' && status !== 'IN_PROGRESS') {
            console.log('⏸️ Turno no confirmado, chat no disponible');
            return null;
        }

        const doctorId = appointment.doctorId || appointment.DoctorId;
        const patientId = appointment.patientId || appointment.PatientId;
        const appointmentId = appointment.appointmentId || appointment.AppointmentId;
        const userId = appointment.currentUserId;

        console.log('🔄 Verificando sala de chat existente...');

        // ✅ Manejar error si getUserChatRooms falla
        let existingRooms = [];
        try {
            existingRooms = await getUserChatRooms(userId);
        } catch (error) {
            console.warn('⚠️ No se pudieron obtener salas existentes, creando nueva:', error.message);
            // Continuar para crear una nueva sala
        }

        // Buscar sala existente
        const existingRoom = existingRooms.find(room => (room.appointmentId || room.AppointmentId) === appointmentId)

        if (existingRoom) {
            console.log('✅ Sala de chat ya existe:', existingRoom);
            return existingRoom;
        }

        // Crear nueva sala
        const { Api } = await import('../api.js')

        let doctorInfo = null
        let patientInfo = null

        // Obtenemos la informacion del doctor
        try {
            const doctor = await Api.get(`v1/Doctor/${doctorId}`)
            const firstName = doctor.firstName || doctor.FirstName || ""
            const lastName = doctor.lastName || doctor.LastName || ""
            const fullName = `${firstName} ${lastName}`.trim() || "Doctor"

            doctorInfo = {
                Id: doctor.userId || doctor.UserId || doctorId,
                Name: fullName,
                Email: doctor.email || doctor.Email || "",
                Role: "Doctor" 
            }
        } catch (error) {
            console.warn('⚠️ No se pudo obtener info del doctor:', error.message);
            doctorInfo = {
                Id: doctorId,
                Name: "Doctor",
                Email: "",
                Role: "Doctor"
            };
        }

        // Obtener info del paciente
        try {
            const patient = await Api.get(`v1/Patient/${patientId}`);
            const firstName = patient.firstName || patient.FirstName || patient.name || "";
            const lastName = patient.lastName || patient.LastName || "";
            const fullName = `${firstName} ${lastName}`.trim() || "Paciente";
            
            patientInfo = {
                Id: patient.userId || patient.UserId || patientId,
                Name: fullName,
                Email: patient.email || patient.Email || "",
                Role: "Patient"
            };
        } catch (error) {
            console.warn('⚠️ No se pudo obtener info del paciente:', error.message);
            patientInfo = {
                Id: patientId,
                Name: "Paciente",
                Email: "",
                Role: "Patient"
            };
        }

        console.log('➕ Creando nueva sala de chat...');
        console.log('📤 Enviando al backend:', { doctorInfo, patientInfo });
        const newRoom = await createChatRoom(doctorId, patientId, appointmentId, doctorInfo, patientInfo);
        console.log('✅ Sala de chat creada:', newRoom);

        return newRoom;
    } catch (error) {
        console.error('❌ Error al crear/obtener sala de chat:', error);
        return null;
    }
}

/**
 * Abre el modal del chat
 */
export function openChatModal(chatRoom, config) {
    console.log('🎯 openChatModal - ENTRADA:', { chatRoom, config });
    
    // ✅ Extraer INMEDIATAMENTE los valores
    const chatRoomId = chatRoom.chatRoomId || chatRoom.ChatRoomId || chatRoom.id || chatRoom.Id;
    const currentUserId = config.currentUserId;
    const currentUserName = config.currentUserName;
    const otherUserName = config.otherUserName;
    const userType = config.userType;
    
    console.log('🎯 Valores extraídos:', {
        chatRoomId,
        currentUserId,
        currentUserName,
        otherUserName,
        userType
    });
    
    if (!chatRoomId) {
        console.error('❌ No se encontró chatRoomId');
        alert('Error: No se pudo obtener el ID de la sala de chat');
        return;
    }
    
    if (!currentUserId) {
        console.error('❌ currentUserId es undefined. Config recibido:', config);
        alert('Error: No se pudo identificar al usuario actual');
        return;
    }

    // Crear modal overlay
    const modal = document.createElement('div');
    modal.id = 'chat-modal';
    modal.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9999;
        width: 400px;
        height: 600px;
        max-height: calc(100vh - 40px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
        border-radius: 12px;
        overflow: hidden;
        animation: slideUp 0.3s ease-out;
    `;

    // Crear contenedor del chat
    const modalContent = document.createElement('div');
    modalContent.style.cssText = `
        width: 100%;
        height: 100%;
        background: white;
        display: flex;
        flex-direction: column;
    `;

    modal.appendChild(modalContent);
    document.body.appendChild(modal);

    // Cerrar al hacer click fuera
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeChat();
        }
    });

    // ✅ Crear componente con los valores extraídos
    console.log('🏗️ Creando ChatComponent con valores:', {
        chatRoomId,
        currentUserId,
        currentUserName,
        otherUserName,
        theme: userType
    });

    const chat = new ChatComponent({
        chatRoomId: chatRoomId,
        currentUserId: currentUserId,
        currentUserName: currentUserName,
        otherUserName: otherUserName,
        theme: userType,
        container: modalContent
    });

    chat.onClose = closeChat;

    function closeChat() {
        const existingModal = document.getElementById('chat-modal');
        if (existingModal) {
            existingModal.remove();
        }
    }

    // Cerrar con tecla ESC
    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            closeChat();
            document.removeEventListener('keydown', handleEsc);
        }
    };
    document.addEventListener('keydown', handleEsc);

    const chatStyles = document.createElement('style');
    chatStyles.textContent = `
        /* Animacion de entrada */
        @keyframes slideUp {
            from { 
                opacity: 0; 
                transform: translateY(20px); }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        /* Drag handler (para mover el chat) */
        #chat-modal .chat-header {
            cursor: move;
            user-select: none;
        }
    `;

    document.head.appendChild(chatStyles);
}