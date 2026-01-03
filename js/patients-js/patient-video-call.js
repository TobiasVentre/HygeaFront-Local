import { appState } from './patient-state.js';
import { showNotification } from './patient-notifications.js';

/**
 * Carga el SDK de Daily.co con fallback a múltiples CDNs
 */
async function loadDailySdk() {
    if (window.DailyIframe) return true;
    
    const cdns = [
        // UMD que expone window.DailyIframe
        'https://unpkg.com/@daily-co/daily-js@latest/dist/daily-iframe.min.js',
        'https://unpkg.com/@daily-co/daily-js',
        'https://cdn.jsdelivr.net/npm/@daily-co/daily-js@latest/dist/daily-iframe.min.js'
    ];
    
    for (const src of cdns) {
        try {
            await new Promise((res, rej) => {
                const s = document.createElement('script');
                s.src = src;
                s.onload = () => res();
                s.onerror = () => rej(new Error(`No se pudo cargar: ${src}`));
                document.head.appendChild(s);
            });
            
            if (window.DailyIframe) {
                console.log('✅ Daily SDK cargado desde:', src);
                return true;
            }
        } catch (e) {
            console.warn('⚠️', e.message);
        }
    }
    
    return false;
}


export async function openPatientVideoCall(appointmentId, doctorId, doctorName) {
    try {
        console.log('📹 Abriendo videollamada para paciente:', { appointmentId, doctorId, doctorName });
        
        // Verificar que el appointment esté confirmado o en progreso
        const { ApiScheduling } = await import('../api.js');
        const appointment = await ApiScheduling.get(`Appointments/${appointmentId}`);
        
        if (!appointment) {
            showNotification('No se encontró el turno', 'error');
            return;
        }
        
        // Normalizar el status para aceptar tanto "InProgress" como "in_progress", etc.
        const rawStatus = (appointment.status || appointment.Status || '').toString().toLowerCase();
        const normalizedStatus = rawStatus.replace(/[\s_]/g, ''); // saca espacios y guiones bajos
        
        const isConfirmed = normalizedStatus === 'confirmed';
        const isInProgress = normalizedStatus === 'inprogress';
        
        if (!isConfirmed && !isInProgress) {
            console.warn('⚠️ Estado del turno no válido para videollamada:', appointment.status || appointment.Status);
            showNotification('La videollamada solo está disponible para turnos confirmados o en progreso', 'warning');
            return;
        }
        
        // Verificar si ya hay un modal abierto para este appointment
        const existingModal = document.querySelector(
            `.video-call-modal[data-appointment-id="${appointmentId}"]`
        );
        if (existingModal) {
            console.log('⚠️ Ya hay un modal de videollamada abierto para este appointment');
            return;
        }
        
        // Crear modal
        const modal = createVideoCallModal(appointmentId, doctorName);
        modal.setAttribute('data-appointment-id', appointmentId);
        document.body.appendChild(modal);
        
        // Inicializar videollamada
        await initializePatientVideoCall(modal, appointmentId, doctorId);
        
    } catch (error) {
        console.error('❌ Error al abrir videollamada:', error);
        showNotification('Error al abrir la videollamada. Por favor, intenta nuevamente.', 'error');
    }
}


function createVideoCallModal(appointmentId, doctorName) {
    const modal = document.createElement('div');
    modal.className = 'video-call-modal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
    `;
    
    modal.innerHTML = `
        <div class="video-call-modal-content" style="
            background: white;
            border-radius: 1rem;
            width: 100%;
            max-width: 900px;
            height: 90vh;
            max-height: 700px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        ">
            <div class="video-call-header" style="
                padding: 1rem 1.5rem;
                background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                color: white;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <div>
                    <h3 style="margin: 0; font-size: 1.25rem; font-weight: 600;">
                        <i class="fas fa-video"></i> Videollamada con ${doctorName}
                    </h3>
                    <p style="margin: 0.25rem 0 0 0; font-size: 0.875rem; opacity: 0.9;">
                        Conectando...
                    </p>
                </div>
                <button class="close-video-call" style="
                    background: rgba(255, 255, 255, 0.2);
                    border: none;
                    color: white;
                    width: 2.5rem;
                    height: 2.5rem;
                    border-radius: 50%;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.25rem;
                    transition: all 0.2s;
                ">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div id="patient-video-call-container" style="
                flex: 1;
                background: #000;
                position: relative;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #fff;
                min-height: 400px;
            ">
                <p id="patient-video-loading" style="text-align: center; font-size: 1rem;">
                    <i class="fas fa-spinner fa-spin"></i> Conectando a la videollamada...
                </p>
            </div>
            
            <div id="patient-video-controls" style="
                padding: 1rem 1.5rem;
                background: #f9fafb;
                border-top: 1px solid #e5e7eb;
                display: flex;
                gap: 0.75rem;
                justify-content: center;
                flex-wrap: wrap;
            ">
                <button id="patient-toggle-mic" style="
                    background: #3b82f6;
                    color: white;
                    border: none;
                    padding: 0.75rem 1.5rem;
                    border-radius: 0.5rem;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-weight: 500;
                    transition: all 0.2s;
                ">
                    <i class="fas fa-microphone"></i> Micrófono
                </button>
                <button id="patient-toggle-camera" style="
                    background: #3b82f6;
                    color: white;
                    border: none;
                    padding: 0.75rem 1.5rem;
                    border-radius: 0.5rem;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-weight: 500;
                    transition: all 0.2s;
                ">
                    <i class="fas fa-video"></i> Cámara
                </button>
                <button id="patient-end-call" style="
                    background: #ef4444;
                    color: white;
                    border: none;
                    padding: 0.75rem 1.5rem;
                    border-radius: 0.5rem;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-weight: 500;
                    transition: all 0.2s;
                ">
                    <i class="fas fa-phone-slash"></i> Finalizar
                </button>
            </div>
        </div>
    `;
    
    // Cerrar modal
    const closeBtn = modal.querySelector('.close-video-call');
    const endCallBtn = modal.querySelector('#patient-end-call');
    
    const closeModal = () => {
        if (modal.callFrame) {
            modal.callFrame.leave().catch(() => {});
        }
        modal.remove();
    };
    
    closeBtn?.addEventListener('click', closeModal);
    endCallBtn?.addEventListener('click', closeModal);
    
    // Cerrar al hacer click fuera del modal
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    return modal;
}

async function initializePatientVideoCall(modal, appointmentId, doctorId) {
    try {
        const videoContainer = modal.querySelector('#patient-video-call-container');
        const videoLoading = modal.querySelector('#patient-video-loading');
        
        if (!videoContainer) {
            console.error('❌ Contenedor de video no encontrado');
            return;
        }
        
        // Obtener token del paciente desde el backend
        const { ApiScheduling } = await import('../api.js');
        const patientId = appState.currentPatient?.patientId || appState.currentPatient?.PatientId;
        
        if (!patientId) {
            throw new Error('No se pudo identificar al paciente');
        }
        
        // Obtener la sala (se crea si no existe)
        let roomUrl = null;
        let retries = 3;
        while (retries > 0 && !roomUrl) {
            try {
                const roomResponse = await ApiScheduling.post(`Video/room/${appointmentId}?doctorId=${doctorId}&patientId=${patientId}`, {});
                roomUrl = roomResponse.roomUrl || roomResponse.RoomUrl;
                if (roomUrl) {
                    console.log('✅ URL de sala obtenida:', roomUrl);
                    break;
                }
            } catch (error) {
                retries--;
                if (retries === 0) {
                    console.warn('⚠️ No se pudo obtener la sala después de varios intentos:', error);
                    showNotification('No se pudo conectar a la videollamada. Por favor, intenta nuevamente.', 'error');
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        if (!roomUrl) {
            throw new Error('No se pudo obtener la URL de la sala');
        }
        
        // Obtener token del paciente
        const tokenResponse = await ApiScheduling.get(`Video/token/${appointmentId}?userId=patient-${patientId}&isOwner=false`);
        const token = tokenResponse.token || tokenResponse.Token;
        
        if (!token) {
            throw new Error('No se recibió el token de videollamada');
        }
        
        console.log('✅ Token obtenido para paciente');
        
        // Cargar Daily.co SDK con fallback a múltiples CDNs
        const ok = await loadDailySdk();
        if (!ok || !window.DailyIframe) {
            showVideoError(videoContainer, 'No se pudo cargar el SDK de videollamada.');
            return;
        }
        
        startPatientVideoCall(videoContainer, roomUrl, token, modal, appointmentId);
        
    } catch (error) {
        console.error('❌ Error al inicializar videollamada del paciente:', error);
        
        let errorMessage = 'Error desconocido';
        if (error.status === 404) {
            errorMessage = 'El servicio de videollamadas no está disponible. Por favor, contacta al administrador.';
        } else if (error.status === 500) {
            errorMessage = 'Error en el servidor de videollamadas. Por favor, intenta más tarde.';
        } else if (error.message) {
            errorMessage = error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        }
        
        const videoContainer = modal.querySelector('#patient-video-call-container');
        if (videoContainer) {
            showVideoError(videoContainer, `Videollamada no disponible: ${errorMessage}`);
        }
    }
}

async function startPatientVideoCall(videoContainer, roomUrl, token, modal, appointmentId) {
    try {
        if (typeof window.DailyIframe === 'undefined') {
            return showVideoError(videoContainer, 'SDK de Daily no disponible');
        }
        
        // Nota: iframeAttributes puede no estar soportado en todas las versiones del SDK
        const frameConfig = {
            showLeaveButton: false,
            showFullscreenButton: true,
            iframeStyle: {
                position: 'absolute',
                width: '100%',
                height: '100%',
                border: '0',
                borderRadius: '0'
            }
        };
        
        // Intentar agregar iframeAttributes si el SDK lo soporta
        try {
            frameConfig.iframeAttributes = {
                allow: 'camera; microphone; autoplay; display-capture; clipboard-read; clipboard-write; fullscreen'
            };
        } catch (e) {
            console.warn('⚠️ No se pudo configurar iframeAttributes en el frame config');
        }
        
        const callFrame = window.DailyIframe.createFrame(videoContainer, frameConfig);
        
        // Guardar referencia al callFrame
        modal.callFrame = callFrame;
        
        // Configurar controles
        setupPatientVideoControls(modal, callFrame, appointmentId);
        
        // Trazas útiles (registrar ANTES del join)
        callFrame.on('joining-meeting', () => {
            console.log('🔵 joining-meeting');
            const loading = videoContainer.querySelector('#patient-video-loading');
            if (loading) loading.textContent = 'Uniéndose a la videollamada...';
        });
        callFrame.on('joined-meeting', () => {
            console.log('🟢 joined-meeting');
            const loading = videoContainer.querySelector('#patient-video-loading');
            if (loading) loading.style.display = 'none';
            const headerSubtitle = modal.querySelector('.video-call-header p');
            if (headerSubtitle) {
                headerSubtitle.textContent = 'Conectado';
            }
        });
        callFrame.on('left-meeting', () => {
            console.log('🟡 left-meeting');
            modal.remove();
        });
        
        // CRÍTICO: Detectar cuando el doctor se une a la videollamada
        callFrame.on('participant-updated', (e) => {
            console.log('[participant-updated]', e);
            
            // Verificar si hay participantes (el doctor)
            try {
                const participants = callFrame.participants();
                console.log('📊 Participantes en la videollamada:', participants);
                
                // Buscar si hay algún participante que no sea el paciente actual
                const patientId = appState.currentPatient?.patientId || appState.currentPatient?.PatientId;
                const hasDoctor = Object.keys(participants).some(participantId => {
                    const participant = participants[participantId];
                    const userId = participant?.user_name || participant?.userName || '';
                    // El doctor tiene userId que empieza con "doctor-"
                    return userId.startsWith('doctor-') && !userId.includes(`patient-${patientId}`);
                });
                
                if (hasDoctor) {
                    console.log('✅ Doctor detectado en la videollamada!');
                    const headerSubtitle = modal.querySelector('.video-call-header p');
                    if (headerSubtitle) {
                        headerSubtitle.textContent = 'Doctor conectado';
                    }
                }
            } catch (err) {
                console.warn('⚠️ Error al verificar participantes:', err);
            }
        });
        callFrame.on('loading', (e) => {
            console.log('[loading]', e);
            const loading = videoContainer.querySelector('#patient-video-loading');
            if (loading) loading.textContent = 'Cargando videollamada...';
        });
        callFrame.on('camera-error', (e) => {
            console.error('📷 camera-error', e);
            showVideoError(videoContainer, `Error de cámara: ${e.errorMsg || e.message || 'Error desconocido'}`);
        });
        callFrame.on('error', (e) => {
            console.error('❌ daily error', e);
            // No mostrar error inmediatamente, puede ser temporal
        });
        
        // Aplicar permisos manualmente al iframe después de que se cree
        // Esperar un poco más para asegurar que el iframe esté en el DOM
        setTimeout(() => {
            const iframe = videoContainer.querySelector('iframe');
            if (iframe) {
                if (!iframe.getAttribute('allow')) {
                    iframe.setAttribute('allow', 'camera; microphone; autoplay; display-capture; clipboard-read; clipboard-write; fullscreen');
                    console.log('✅ Permisos aplicados manualmente al iframe');
                }
                // Verificar que el iframe sea visible
                if (iframe.style.display === 'none' || iframe.style.visibility === 'hidden') {
                    iframe.style.display = 'block';
                    iframe.style.visibility = 'visible';
                    console.log('✅ Iframe hecho visible');
                }
            } else {
                console.warn('⚠️ Iframe no encontrado después de 500ms');
            }
        }, 500);
        
        // Sanitizar URL antes del join (defensivo)
        const validUrl = new URL(roomUrl).toString();
        
        // Esperar un momento para que el iframe se cree y tenga los permisos
        await new Promise(resolve => setTimeout(resolve, 600));
        
        // Intentar el join - Daily.co puede tardar en conectar
        callFrame.join({ url: validUrl, token })
            .then(() => {
                console.log('✅ Paciente unido a la videollamada');
                const loading = videoContainer.querySelector('#patient-video-loading');
                if (loading) loading.style.display = 'none';
                
                // Actualizar header
                const headerSubtitle = modal.querySelector('.video-call-header p');
                if (headerSubtitle) {
                    headerSubtitle.textContent = 'Conectado';
                }
            })
            .catch((err) => {
                console.error('❌ join() falló:', err);
                console.error('❌ Detalles del error:', {
                    message: err?.message,
                    errorMsg: err?.errorMsg,
                    error: err?.error,
                    stack: err?.stack
                });
                
                // NO abrir automáticamente en nueva ventana - mostrar error en el modal
                showVideoError(videoContainer, `No se pudo conectar a la videollamada: ${err?.errorMsg || err?.message || 'Error desconocido'}. Por favor, intenta nuevamente o recarga la página.`);
                
                // Opcional: agregar botón para abrir en nueva ventana como fallback manual
                const errorDiv = videoContainer.querySelector('div[style*="text-align: center"]');
                if (errorDiv) {
                    const fallbackButton = document.createElement('button');
                    fallbackButton.textContent = 'Abrir en nueva ventana';
                    fallbackButton.style.cssText = 'margin-top: 1rem; padding: 0.5rem 1rem; background: #10b981; color: white; border: none; border-radius: 0.5rem; cursor: pointer;';
                    fallbackButton.onclick = () => {
                        const cleanUrl = String(roomUrl).split("'")[0].trim();
                        const target = `${cleanUrl}?t=${encodeURIComponent(token)}`;
                        window.open(target, '_blank', 'noopener,noreferrer');
                    };
                    errorDiv.appendChild(fallbackButton);
                }
            });
        
    } catch (e) {
        console.error('❌ Error al crear videollamada:', e);
        showVideoError(videoContainer, e.message || 'Error desconocido');
    }
}

function setupPatientVideoControls(modal, callFrame, appointmentId) {
    const toggleMic = modal.querySelector('#patient-toggle-mic');
    const toggleCamera = modal.querySelector('#patient-toggle-camera');
    const endCall = modal.querySelector('#patient-end-call');
    
    let micEnabled = true;
    let cameraEnabled = true;
    
    if (toggleMic) {
        toggleMic.addEventListener('click', () => {
            micEnabled = !micEnabled;
            callFrame.setLocalAudio(micEnabled);
            toggleMic.innerHTML = micEnabled 
                ? '<i class="fas fa-microphone"></i> Micrófono'
                : '<i class="fas fa-microphone-slash"></i> Micrófono';
            toggleMic.style.background = micEnabled ? '#3b82f6' : '#6b7280';
        });
    }
    
    if (toggleCamera) {
        toggleCamera.addEventListener('click', () => {
            cameraEnabled = !cameraEnabled;
            callFrame.setLocalVideo(cameraEnabled);
            toggleCamera.innerHTML = cameraEnabled 
                ? '<i class="fas fa-video"></i> Cámara'
                : '<i class="fas fa-video-slash"></i> Cámara';
            toggleCamera.style.background = cameraEnabled ? '#3b82f6' : '#6b7280';
        });
    }
    
    if (endCall) {
        endCall.addEventListener('click', () => {
            callFrame.leave().then(() => {
                modal.remove();
            }).catch(() => {
                modal.remove();
            });
        });
    }
}

function showVideoError(videoContainer, message) {
    if (videoContainer) {
        videoContainer.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #ef4444;">
                <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                <p style="font-size: 1.125rem; margin: 0;">${message}</p>
            </div>
        `;
    }
}

/**
 * Verifica si el doctor está en la videollamada usando la API del backend (que usa Daily.co directamente)
 */
async function checkDoctorInVideoCall(appointmentId, doctorId) {
    try {
        const { ApiScheduling } = await import('../api.js');
        const patientId = appState.currentPatient?.patientId || appState.currentPatient?.PatientId;
        
        if (!patientId) {
            return false;
        }
        
        // Verificar si ya hay un modal abierto para este appointment
        const existingModal = document.querySelector(
            `.video-call-modal[data-appointment-id="${appointmentId}"]`
        );
        if (existingModal) {
            return false; // Ya hay un modal de videollamada abierto
        }
        
                        console.log(`📹 Verificando si el doctor está en la videollamada para appointment ${appointmentId} usando API de Daily.co...`);
                        console.log(`📹 Sala esperada: appointment-${appointmentId}`);
                        
                        // Usar el endpoint del backend que consulta directamente la API de Daily.co
                        try {
                            const endpoint = `Video/check-doctor/${appointmentId}`;
                            console.log(`📡 Llamando al endpoint: ${endpoint}`);
                            console.log(`📡 URL completa esperada: http://127.0.0.1:8083/api/v1/${endpoint}`);
                            
                            // Primero probar el endpoint de test para verificar conectividad
                            try {
                                console.log(`🧪 Probando endpoint de test primero...`);
                                const testResponse = await ApiScheduling.get('Video/test');
                                console.log(`✅ Endpoint de test funcionando:`, testResponse);
                            } catch (testError) {
                                console.error(`❌ Error al probar endpoint de test:`, testError);
                                console.error(`❌ Esto indica un problema de conectividad o CORS`);
                            }
                            
                            const checkResponse = await ApiScheduling.get(endpoint);
                            console.log(`📦 Respuesta completa del backend:`, checkResponse);
                            
                            const hasDoctor = checkResponse.hasDoctor || checkResponse.HasDoctor || false;
                            
                            console.log(`📊 Resultado de verificación (API Daily.co):`, {
                                appointmentId: appointmentId,
                                hasDoctor: hasDoctor,
                                response: checkResponse,
                                sala: `appointment-${appointmentId}`
                            });
                            
                            if (!hasDoctor) {
                                console.warn(`⚠️ Doctor no detectado. Posibles causas:`);
                                console.warn(`⚠️   1. El doctor aún no se ha unido a la sala appointment-${appointmentId}`);
                                console.warn(`⚠️   2. El doctor se unió a una sala diferente`);
                                console.warn(`⚠️   3. El endpoint /presence de Daily.co tiene un delay`);
                            }
                            
                            return hasDoctor;
        } catch (apiError) {
            console.error(`❌ Error en la petición al backend para appointment ${appointmentId}:`, {
                error: apiError,
                message: apiError?.message,
                status: apiError?.status,
                statusText: apiError?.statusText,
                stack: apiError?.stack
            });
            throw apiError; // Re-lanzar para que se maneje en el catch externo
        }
    } catch (error) {
        console.error(`❌ Error completo al verificar si el doctor está en la videollamada (appointment ${appointmentId}):`, {
            error: error,
            message: error?.message,
            status: error?.status,
            statusText: error?.statusText,
            details: error?.details,
            stack: error?.stack
        });
        return false;
    }
}

/**
 * Monitorea turnos en progreso y muestra el modal automáticamente
 * cuando haya al menos un turno "in_progress"
 */
let videoCallMonitorInterval = null;

export function startVideoCallMonitoring() {
    console.log('📹 Iniciando monitoreo de videollamadas...');

    // Limpiar intervalo anterior si existe
    if (videoCallMonitorInterval) {
        clearInterval(videoCallMonitorInterval);
    }

    // Verificar cada 5 segundos
    videoCallMonitorInterval = setInterval(async () => {
        try {
            console.log('🔍 Ejecutando verificación de videollamadas...');

            const { ApiScheduling, Api } = await import('../api.js');
            const patientId = appState.currentPatient?.patientId || appState.currentPatient?.PatientId;

            if (!patientId) {
                console.log('⚠️ No hay patientId disponible para monitoreo');
                return;
            }

            // Traigo solo turnos in_progress
            const appointmentsResponse = await ApiScheduling.get(`Appointments?patientId=${patientId}&status=in_progress`);
            const appointments = Array.isArray(appointmentsResponse)
                ? appointmentsResponse
                : (appointmentsResponse?.value || appointmentsResponse || []);

            console.log(`📋 Turnos en progreso encontrados: ${appointments.length}`);

            if (appointments.length === 0) {
                console.log('📋 No hay turnos en progreso');
                return;
            }

            // Ordenar por fecha (más recientes primero)
            const sortedAppointments = appointments.sort((a, b) => {
                const dateA = new Date(a.startTime || a.StartTime || 0);
                const dateB = new Date(b.startTime || b.StartTime || 0);
                return dateB - dateA;
            });

            console.log(`📋 Verificando ${sortedAppointments.length} turnos en progreso (todos)`);

            for (const appointment of sortedAppointments) {
                const appointmentId = appointment.appointmentId || appointment.AppointmentId;
                const doctorId = appointment.doctorId || appointment.DoctorId;

                if (!appointmentId || !doctorId) {
                    console.log('⚠️ Appointment sin appointmentId o doctorId:', appointment);
                    continue;
                }

                // Si ya hay un modal de videollamada para este turno, no hago nada
                const existingModal = document.querySelector(
                    `.video-call-modal[data-appointment-id="${appointmentId}"]`
                );
                console.log(`🔎 Modal de videollamada existente para appointment ${appointmentId}:`, !!existingModal);
                if (existingModal) {
                    continue;
                }

                // ⬇️ NUEVO: primero verifico si el doctor está en la videollamada
                const doctorInCall = await checkDoctorInVideoCall(appointmentId, doctorId);
                if (!doctorInCall) {
                    console.log(`👨‍⚕️ Doctor todavía NO está en videollamada para appointment ${appointmentId}. No se abre modal.`);
                    continue;
                }

                console.log(`✅ Doctor en videollamada y turno en progreso (${appointmentId}). Abriendo modal...`);

                // Nombre del doctor
                let doctorName = 'Doctor';
                try {
                    const doctor = await Api.get(`v1/Doctor/${doctorId}`);
                    doctorName = `Dr. ${doctor.firstName || doctor.FirstName || ''} ${doctor.lastName || doctor.LastName || ''}`.trim();
                } catch (err) {
                    console.warn('⚠️ No se pudo obtener nombre del doctor:', err);
                }

                // Abrir el modal (esto internamente vuelve a chequear status)
                await openPatientVideoCall(appointmentId, doctorId, doctorName);

                // Sólo abrimos un modal a la vez
                break;
            }
        } catch (error) {
            console.error('❌ Error en monitoreo de videollamadas:', error);
        }
    }, 5000);

    console.log('✅ Monitoreo de videollamadas iniciado');
}

export function stopVideoCallMonitoring() {
    if (videoCallMonitorInterval) {
        clearInterval(videoCallMonitorInterval);
        videoCallMonitorInterval = null;
    }
}
