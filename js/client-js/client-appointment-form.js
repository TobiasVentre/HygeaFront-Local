// ============================================
// FORMULARIO DE AGENDAMIENTO DE TURNOS
// ============================================

import { appState } from './client-state.js';
import { showNotification } from './client-notifications.js';
import { loadClientAppointments } from './client-appointments.js';
import { loadClientStats } from './client-dashboard.js';
import { 
    loadAvailableDatesAndTimes, 
    loadAvailableTimes,
    initializeEmptyCalendar 
} from './client-calendar.js';

/**
 * Inicializa modales de la aplicación
 */
export function initializeModals() {
    const appointmentModal = document.getElementById('appointment-modal');
    const newAppointmentBtn = document.getElementById('newAppointment');
    const cancelAppointmentBtn = document.getElementById('cancel-appointment');
    const appointmentForm = document.getElementById('appointment-form');
    const specialtySelect = document.getElementById('specialty');
    const fumigatorSelect = document.getElementById('fumigator');
    const dateInput = document.getElementById('date');
    const timeSelect = document.getElementById('time');

    if (newAppointmentBtn && appointmentModal) {
        newAppointmentBtn.addEventListener('click', () => {
            appointmentModal.classList.remove('hidden');
            loadFumigatorsForAppointment();
            
            if (fumigatorSelect) fumigatorSelect.innerHTML = '<option value="">Seleccionar médico</option>';
            if (dateInput) dateInput.value = '';
            if (timeSelect) timeSelect.innerHTML = '<option value="">Seleccionar hora</option>';
            
            const customCalendar = document.getElementById('custom-calendar');
            if (customCalendar) {
                customCalendar.removeAttribute('data-initialized');
                customCalendar.innerHTML = '';
                initializeEmptyCalendar();
            }
        });
    }

    if (specialtySelect) {
        specialtySelect.addEventListener('change', async (e) => {
            const selectedSpecialty = e.target.value;
            
            if (dateInput) dateInput.value = '';
            if (timeSelect) timeSelect.innerHTML = '<option value="">Seleccionar hora</option>';
            
            const customCalendar = document.getElementById('custom-calendar');
            if (customCalendar) {
                customCalendar.querySelectorAll('.calendar-day-selected').forEach(el => {
                    el.classList.remove('calendar-day-selected');
                });
            }
            
            if (selectedSpecialty) {
                await loadFumigatorsForAppointment(selectedSpecialty);
            } else {
                await loadFumigatorsForAppointment(null);
            }
        });
    }

    // ✅ LISTENER DEL FUMIGATOR QUE FUNCIONA
    if (fumigatorSelect) {
        fumigatorSelect.addEventListener('change', async (e) => {
            const selectedFumigatorId = e.target.value;
            if (selectedFumigatorId) {
                if (dateInput) dateInput.value = '';
                if (timeSelect) timeSelect.innerHTML = '<option value="">Seleccionar hora</option>';
                
                const customCalendar = document.getElementById('custom-calendar');
                if (customCalendar) {
                    customCalendar.querySelectorAll('.calendar-day-selected').forEach(el => {
                        el.classList.remove('calendar-day-selected');
                    });
                }
                
                // ✅ ESTA ES LA LÍNEA CLAVE
                await loadAvailableDatesAndTimes(parseInt(selectedFumigatorId));
            } else {
                if (dateInput) dateInput.value = '';
                if (timeSelect) timeSelect.innerHTML = '<option value="">Seleccionar hora</option>';
            }
        });
    }

    if (dateInput) {
        dateInput.addEventListener('change', async (e) => {
            const selectedDate = e.target.value;
            const selectedFumigatorId = fumigatorSelect?.value;
            if (selectedDate && selectedFumigatorId) {
                await loadAvailableTimes(parseInt(selectedFumigatorId), selectedDate);
            } else {
                if (timeSelect) timeSelect.innerHTML = '<option value="">Seleccionar hora</option>';
            }
        });
    }

    if (cancelAppointmentBtn) {
        cancelAppointmentBtn.addEventListener('click', () => {
            if (appointmentModal) appointmentModal.classList.add('hidden');
        });
    }

    if (appointmentModal) {
        appointmentModal.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                appointmentModal.classList.add('hidden');
            });
        });
    }

    if (appointmentForm) {
        appointmentForm.addEventListener('submit', handleAppointmentSubmit);
    }
}

/**
 * Carga fumigatores para el formulario de turno
 */
export async function loadFumigatorsForAppointment(selectedSpecialty = null) {
    try {
        // RUTA CORREGIDA: api.js está en js/
        const { Api } = await import('../api.js');
        const response = await Api.get('v1/Fumigator');
        
        const fumigators = Array.isArray(response) ? response : (response?.value || response || []);
        
        const fumigatorSelect = document.getElementById('fumigator');
        if (!fumigatorSelect) return;

        fumigatorSelect.innerHTML = '<option value="">Seleccionar médico</option>';
        
        if (fumigators && fumigators.length > 0) {
            const specialtyMap = {
                'cardiologia': 'Cardiologo',
                'dermatologia': 'Dermatologo',
                'traumatologia': 'Traumatologo',
                'pediatria': 'Pediatra',
                'ginecologia': 'Ginecologo',
                'neurologia': 'Neurologo'
            };
            
            const backendSpecialty = selectedSpecialty ? specialtyMap[selectedSpecialty.toLowerCase()] : null;
            
            let fumigatorsAdded = 0;
            fumigators.forEach(fumigator => {
                const fumigatorId = fumigator.fumigatorId || fumigator.FumigatorId;
                const fumigatorSpecialty = fumigator.specialty || fumigator.Specialty || '';
                const firstName = fumigator.firstName || fumigator.FirstName || '';
                const lastName = fumigator.lastName || fumigator.LastName || '';
                
                if (backendSpecialty) {
                    const normalizedFumigatorSpecialty = (fumigatorSpecialty || '').trim();
                    const normalizedBackendSpecialty = (backendSpecialty || '').trim();
                    
                    if (normalizedFumigatorSpecialty.toLowerCase() !== normalizedBackendSpecialty.toLowerCase()) {
                        return;
                    }
                }
                
                const option = document.createElement('option');
                option.value = fumigatorId;
                const specialtyText = fumigatorSpecialty ? ` - ${fumigatorSpecialty}` : '';
                option.textContent = `Dr. ${firstName} ${lastName}${specialtyText}`;
                fumigatorSelect.appendChild(option);
                fumigatorsAdded++;
            });
            
            if (fumigatorsAdded === 0 && backendSpecialty) {
                showNotification(`No hay médicos disponibles para la especialidad seleccionada`, 'warning');
            }
        }
    } catch (error) {
        console.error('Error al cargar fumigatores:', error);
        showNotification('No se pudieron cargar los médicos disponibles', 'error');
    }
}

/**
 * Maneja el envío del formulario de turno
 */
async function handleAppointmentSubmit(e) {
    e.preventDefault();
    
    try {
        const fumigatorId = parseInt(document.getElementById('fumigator').value);
        const date = document.getElementById('date').value;
        const timeValue = document.getElementById('time').value;
        const reason = document.getElementById('reason').value;

        if (!fumigatorId || !date || !timeValue || !reason) {
            showNotification('Por favor completa todos los campos', 'error');
            return;
        }

        if (!appState.currentClient?.clientId) {
            showNotification('No se pudo identificar al cliente', 'error');
            return;
        }

        let slotData;
        let startDateTime;
        let localHours, localMinutes;
        
        try {
            slotData = JSON.parse(timeValue);
            if (slotData.localHours !== undefined && slotData.localMinutes !== undefined) {
                localHours = slotData.localHours;
                localMinutes = slotData.localMinutes;
                const [year, month, day] = date.split('-').map(Number);
                startDateTime = new Date(year, month - 1, day, localHours, localMinutes, 0, 0);
            } else {
                startDateTime = new Date(slotData.isoString || slotData.date || timeValue);
                localHours = startDateTime.getHours();
                localMinutes = startDateTime.getMinutes();
            }
        } catch (e) {
            startDateTime = new Date(timeValue);
            localHours = startDateTime.getHours();
            localMinutes = startDateTime.getMinutes();
        }
        
        const year = startDateTime.getFullYear();
        const month = String(startDateTime.getMonth() + 1).padStart(2, '0');
        const day = String(startDateTime.getDate()).padStart(2, '0');
        const hours = String(localHours).padStart(2, '0');
        const minutes = String(localMinutes).padStart(2, '0');
        const seconds = '00';
        
        const timezoneOffsetMinutes = startDateTime.getTimezoneOffset();
        const timezoneOffset = -timezoneOffsetMinutes;
        const offsetHours = Math.floor(Math.abs(timezoneOffset) / 60);
        const offsetMinutes = Math.abs(timezoneOffset) % 60;
        const offsetSign = timezoneOffset >= 0 ? '+' : '-';
        const offsetString = `${offsetSign}${String(offsetHours).padStart(2, '0')}:${String(offsetMinutes).padStart(2, '0')}`;
        
        const startTimeLocal = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetString}`;
        
        // RUTA CORREGIDA: api.js está en js/
        const { ApiScheduling } = await import('../api.js');
        const availabilitiesResponse = await ApiScheduling.get(`FumigatorAvailability/search?fumigatorId=${fumigatorId}`);
        const availabilities = Array.isArray(availabilitiesResponse) ? availabilitiesResponse : (availabilitiesResponse?.value || availabilitiesResponse || []);
        const durationMinutes = availabilities && availabilities.length > 0 
            ? (availabilities[0].durationMinutes || availabilities[0].DurationMinutes || 30)
            : 30;
        
        const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60000);
        const endYear = endDateTime.getFullYear();
        const endMonth = String(endDateTime.getMonth() + 1).padStart(2, '0');
        const endDay = String(endDateTime.getDate()).padStart(2, '0');
        const endHours = String(endDateTime.getHours()).padStart(2, '0');
        const endMinutes = String(endDateTime.getMinutes()).padStart(2, '0');
        const endTimeLocal = `${endYear}-${endMonth}-${endDay}T${endHours}:${endMinutes}:${seconds}${offsetString}`;
        
        const appointment = await ApiScheduling.post('Appointments', {
            fumigatorId: fumigatorId,
            clientId: appState.currentClient.clientId,
            startTime: startTimeLocal,
            endTime: endTimeLocal,
            reason: reason
        });

        showNotification('Turno agendado exitosamente', 'success');
        
        
        // ============================================================
        //  NOTIFICACIONES POR MAIL (CLIENTE + FUMIGATOR)
        // ============================================================

        try {
            const { ApiAuth } = await import('../api.js');

            // ===============================
            // 1) Obtener appointmentId
            // ===============================
            let appointmentId =
                appointment?.appointmentId ||
                appointment?.AppointmentId ||
                appointment?.id ||
                appointment?.Id ||
                null;

            // Convertir número a GUID determinístico
            if (typeof appointmentId === "number") {
                appointmentId = numberToDeterministicGuid(appointmentId);
            }

            // ===============================
            // 2) Obtener etiquetas del fumigator
            // ===============================
            const fumigatorSelect = document.getElementById('fumigator');
            const fumigatorLabel = fumigatorSelect?.selectedOptions?.[0]?.textContent || '';
            const [fumigatorDisplayName, specialtyFromLabel] = fumigatorLabel.split(' - ');

            // ===============================
            // 3) Nombre completo del cliente
            // ===============================
            const clientName = [
                appState.currentClient?.firstName,
                appState.currentClient?.lastName
            ].filter(Boolean).join(' ').trim();

            // ===============================
            // 4) Extraer fecha y hora del turno
            // ===============================
            const [appointmentDatePart, appointmentTimeWithOffset] = startTimeLocal.split('T');
            const appointmentTimePart = appointmentTimeWithOffset?.split(/[+-]/)[0];

            // ===============================
            // 5) Payload BASE para cliente/fumigator
            // ===============================
            const notificationPayloadBase = {
                appointmentId,
                clientName,
                fumigatorName: (fumigatorDisplayName || '').replace(/^Dr\.\s*/i, '').trim(),
                specialty: (specialtyFromLabel || '').trim(),
                appointmentDate: `${appointmentDatePart}T00:00:00`,
                appointmentTime: appointmentTimePart,
                appointmentType: 'Presencial',
                notes: reason,
                status: 'Pending'
            };

            // ===============================
            // 📩 6) Notificación al CLIENTE
            // ===============================
            const clientNotification = {
                userId: appState.currentClient.userId || appState.currentClient.clientId,
                eventType: 'AppointmentCreated',
                payload: notificationPayloadBase
            };

            console.log("📨 Enviando notificación al cliente:", clientNotification);
            await ApiAuth.post('notifications/events', clientNotification);

            // ===============================
            // 📩 7) Notificación al FUMIGATOR
            // ===============================

            //Obtenemos el userId del fumigator
            const { Api } = await import('../api.js');

            // Obtener info completa del fumigator
            const fumigatorResponse = await Api.get(`v1/fumigator/${fumigatorId}`);
            const fumigatorUserId = fumigatorResponse?.userId;

            if (!fumigatorUserId) {
                console.error("⚠ No se puedo obtener UserId del fumigator");
            }

            const fumigatorNotification = {
                userId: fumigatorUserId, // usamos fumigatorId como userId
                eventType: 'AppointmentCreatedFumigator',
                payload: notificationPayloadBase
            };

            console.log("📨 Enviando notificación al fumigator:", fumigatorNotification);
            await ApiAuth.post('notifications/events', fumigatorNotification);

            console.log("✅ Notificaciones enviadas exitosamente");

        } catch (notificationError) {
            console.error('❌ Error enviando notificaciones:', notificationError);
        }

        
        const appointmentModal = document.getElementById('appointment-modal');
        if (appointmentModal) {
            appointmentModal.classList.add('hidden');
        }
        
        const appointmentForm = document.getElementById('appointment-form');
        if (appointmentForm) {
            appointmentForm.reset();
        }
        
        await loadClientAppointments();
        await loadClientStats();

    } catch (error) {
        console.error('Error al agendar turno:', error);
        showNotification(`Error al agendar turno: ${error.message || 'Error desconocido'}`, 'error');
    }
}


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