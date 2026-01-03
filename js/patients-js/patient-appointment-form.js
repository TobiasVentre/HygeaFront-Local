// ============================================
// FORMULARIO DE AGENDAMIENTO DE TURNOS
// ============================================

import { appState } from './patient-state.js';
import { showNotification } from './patient-notifications.js';
import { loadPatientAppointments } from './patient-appointments.js';
import { loadPatientStats } from './patient-dashboard.js';
import { 
    loadAvailableDatesAndTimes, 
    loadAvailableTimes,
    initializeEmptyCalendar 
} from './patient-calendar.js';

/**
 * Inicializa modales de la aplicación
 */
export function initializeModals() {
    const appointmentModal = document.getElementById('appointment-modal');
    const newAppointmentBtn = document.getElementById('newAppointment');
    const cancelAppointmentBtn = document.getElementById('cancel-appointment');
    const appointmentForm = document.getElementById('appointment-form');
    const specialtySelect = document.getElementById('specialty');
    const doctorSelect = document.getElementById('doctor');
    const dateInput = document.getElementById('date');
    const timeSelect = document.getElementById('time');

    if (newAppointmentBtn && appointmentModal) {
        newAppointmentBtn.addEventListener('click', () => {
            appointmentModal.classList.remove('hidden');
            loadDoctorsForAppointment();
            
            if (doctorSelect) doctorSelect.innerHTML = '<option value="">Seleccionar médico</option>';
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
                await loadDoctorsForAppointment(selectedSpecialty);
            } else {
                await loadDoctorsForAppointment(null);
            }
        });
    }

    // ✅ LISTENER DEL DOCTOR QUE FUNCIONA
    if (doctorSelect) {
        doctorSelect.addEventListener('change', async (e) => {
            const selectedDoctorId = e.target.value;
            if (selectedDoctorId) {
                if (dateInput) dateInput.value = '';
                if (timeSelect) timeSelect.innerHTML = '<option value="">Seleccionar hora</option>';
                
                const customCalendar = document.getElementById('custom-calendar');
                if (customCalendar) {
                    customCalendar.querySelectorAll('.calendar-day-selected').forEach(el => {
                        el.classList.remove('calendar-day-selected');
                    });
                }
                
                // ✅ ESTA ES LA LÍNEA CLAVE
                await loadAvailableDatesAndTimes(parseInt(selectedDoctorId));
            } else {
                if (dateInput) dateInput.value = '';
                if (timeSelect) timeSelect.innerHTML = '<option value="">Seleccionar hora</option>';
            }
        });
    }

    if (dateInput) {
        dateInput.addEventListener('change', async (e) => {
            const selectedDate = e.target.value;
            const selectedDoctorId = doctorSelect?.value;
            if (selectedDate && selectedDoctorId) {
                await loadAvailableTimes(parseInt(selectedDoctorId), selectedDate);
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
 * Carga doctores para el formulario de turno
 */
export async function loadDoctorsForAppointment(selectedSpecialty = null) {
    try {
        // RUTA CORREGIDA: api.js está en js/
        const { Api } = await import('../api.js');
        const response = await Api.get('v1/Doctor');
        
        const doctors = Array.isArray(response) ? response : (response?.value || response || []);
        
        const doctorSelect = document.getElementById('doctor');
        if (!doctorSelect) return;

        doctorSelect.innerHTML = '<option value="">Seleccionar médico</option>';
        
        if (doctors && doctors.length > 0) {
            const specialtyMap = {
                'cardiologia': 'Cardiologo',
                'dermatologia': 'Dermatologo',
                'traumatologia': 'Traumatologo',
                'pediatria': 'Pediatra',
                'ginecologia': 'Ginecologo',
                'neurologia': 'Neurologo'
            };
            
            const backendSpecialty = selectedSpecialty ? specialtyMap[selectedSpecialty.toLowerCase()] : null;
            
            let doctorsAdded = 0;
            doctors.forEach(doctor => {
                const doctorId = doctor.doctorId || doctor.DoctorId;
                const doctorSpecialty = doctor.specialty || doctor.Specialty || '';
                const firstName = doctor.firstName || doctor.FirstName || '';
                const lastName = doctor.lastName || doctor.LastName || '';
                
                if (backendSpecialty) {
                    const normalizedDoctorSpecialty = (doctorSpecialty || '').trim();
                    const normalizedBackendSpecialty = (backendSpecialty || '').trim();
                    
                    if (normalizedDoctorSpecialty.toLowerCase() !== normalizedBackendSpecialty.toLowerCase()) {
                        return;
                    }
                }
                
                const option = document.createElement('option');
                option.value = doctorId;
                const specialtyText = doctorSpecialty ? ` - ${doctorSpecialty}` : '';
                option.textContent = `Dr. ${firstName} ${lastName}${specialtyText}`;
                doctorSelect.appendChild(option);
                doctorsAdded++;
            });
            
            if (doctorsAdded === 0 && backendSpecialty) {
                showNotification(`No hay médicos disponibles para la especialidad seleccionada`, 'warning');
            }
        }
    } catch (error) {
        console.error('Error al cargar doctores:', error);
        showNotification('No se pudieron cargar los médicos disponibles', 'error');
    }
}

/**
 * Maneja el envío del formulario de turno
 */
async function handleAppointmentSubmit(e) {
    e.preventDefault();
    
    try {
        const doctorId = parseInt(document.getElementById('doctor').value);
        const date = document.getElementById('date').value;
        const timeValue = document.getElementById('time').value;
        const reason = document.getElementById('reason').value;

        if (!doctorId || !date || !timeValue || !reason) {
            showNotification('Por favor completa todos los campos', 'error');
            return;
        }

        if (!appState.currentPatient?.patientId) {
            showNotification('No se pudo identificar al paciente', 'error');
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
        const availabilitiesResponse = await ApiScheduling.get(`DoctorAvailability/search?doctorId=${doctorId}`);
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
            doctorId: doctorId,
            patientId: appState.currentPatient.patientId,
            startTime: startTimeLocal,
            endTime: endTimeLocal,
            reason: reason
        });

        showNotification('Turno agendado exitosamente', 'success');
        
        
        // ============================================================
        //  NOTIFICACIONES POR MAIL (PACIENTE + DOCTOR)
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
            // 2) Obtener etiquetas del doctor
            // ===============================
            const doctorSelect = document.getElementById('doctor');
            const doctorLabel = doctorSelect?.selectedOptions?.[0]?.textContent || '';
            const [doctorDisplayName, specialtyFromLabel] = doctorLabel.split(' - ');

            // ===============================
            // 3) Nombre completo del paciente
            // ===============================
            const patientName = [
                appState.currentPatient?.firstName,
                appState.currentPatient?.lastName
            ].filter(Boolean).join(' ').trim();

            // ===============================
            // 4) Extraer fecha y hora del turno
            // ===============================
            const [appointmentDatePart, appointmentTimeWithOffset] = startTimeLocal.split('T');
            const appointmentTimePart = appointmentTimeWithOffset?.split(/[+-]/)[0];

            // ===============================
            // 5) Payload BASE para paciente/doctor
            // ===============================
            const notificationPayloadBase = {
                appointmentId,
                patientName,
                doctorName: (doctorDisplayName || '').replace(/^Dr\.\s*/i, '').trim(),
                specialty: (specialtyFromLabel || '').trim(),
                appointmentDate: `${appointmentDatePart}T00:00:00`,
                appointmentTime: appointmentTimePart,
                appointmentType: 'Presencial',
                notes: reason,
                status: 'Pending'
            };

            // ===============================
            // 📩 6) Notificación al PACIENTE
            // ===============================
            const patientNotification = {
                userId: appState.currentPatient.userId || appState.currentPatient.patientId,
                eventType: 'AppointmentCreated',
                payload: notificationPayloadBase
            };

            console.log("📨 Enviando notificación al paciente:", patientNotification);
            await ApiAuth.post('notifications/events', patientNotification);

            // ===============================
            // 📩 7) Notificación al DOCTOR
            // ===============================

            //Obtenemos el userId del doctor
            const { Api } = await import('../api.js');

            // Obtener info completa del doctor
            const doctorResponse = await Api.get(`v1/doctor/${doctorId}`);
            const doctorUserId = doctorResponse?.userId;

            if (!doctorUserId) {
                console.error("⚠ No se puedo obtener UserId del doctor");
            }

            const doctorNotification = {
                userId: doctorUserId, // usamos doctorId como userId
                eventType: 'AppointmentCreatedDoctor',
                payload: notificationPayloadBase
            };

            console.log("📨 Enviando notificación al doctor:", doctorNotification);
            await ApiAuth.post('notifications/events', doctorNotification);

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
        
        await loadPatientAppointments();
        await loadPatientStats();

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