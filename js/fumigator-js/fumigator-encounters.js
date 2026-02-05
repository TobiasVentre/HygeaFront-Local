// ===================================
// FUMIGATOR ENCOUNTERS - Encuentros Clínicos (SOAP)
// ===================================

import { fumigatorState, getId, updateCounter } from './fumigator-core.js';
import { showNotification } from './fumigator-ui.js';
import { updateAppointmentStatus } from './fumigator-appointments.js';

/**
 * Carga el SDK de Daily.co con fallback a múltiples CDNs
 */
async function loadDailySdk() {
    if (window.DailyIframe) return true;
    
    const cdns = [
        // UMD que expone window.DailyIframe - usar solo CDNs que funcionen
        'https://cdn.jsdelivr.net/npm/@daily-co/daily-js@latest/dist/daily-iframe.min.js',
        'https://unpkg.com/@daily-co/daily-js@latest/dist/daily-iframe.min.js'
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

// ===================================
// MODAL DE ENCOUNTER
// ===================================

const createEncounterForm = (appointmentId, clientId, clientName) => `
<div class="modal-content encounter-modal-content" style="max-width: 1400px; width: 95vw;">
    <div class="modal-header">
        <h3>Consulta con ${clientName}</h3>
        <button class="close-modal">&times;</button>
    </div>
    <div class="modal-body encounter-modal-body">
        <form id="encounter-form" class="encounter-form-layout">
            <input type="hidden" id="encounter-appointment-id" value="${appointmentId}">
            <input type="hidden" id="encounter-client-id" value="${clientId}">
            
            <!-- Columna izquierda: Formulario -->
            <div class="encounter-form-column">
                <div class="encounter-form-scrollable">
                    <div class="form-group">
                        <label for="encounter-reasons">Motivo de consulta: *</label>
                        <textarea id="encounter-reasons" rows="2" required placeholder="Ej: Dolor de cabeza intenso desde hace 3 días"></textarea>
                    </div>
                    
                    <div class="soap-section" style="background: #f9fafb; padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
                        <h4 style="margin-bottom: 1rem; color: #1f2937; display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fas fa-notes-medical"></i> Notas SOAP
                        </h4>
                        ${['subjective', 'objective', 'assessment', 'plan'].map((field, i) => {
                            const labels = ['Subjetivo (Síntomas del cliente)', 'Objetivo (Hallazgos físicos)', 'Assessment (Diagnóstico)', 'Plan (Tratamiento)'];
                            const helps = ['¿Qué dice el cliente?', '¿Qué observas tú?', '¿Cuál es tu diagnóstico?', '¿Qué vas a hacer?'];
                            return `
                            <div class="form-group">
                                <label for="encounter-${field}"><strong>${field[0].toUpperCase()}</strong>${labels[i].slice(field[0].length)}: *</label>
                                <textarea id="encounter-${field}" rows="3" required placeholder="..."></textarea>
                                <small style="color: #6b7280;">${helps[i]}</small>
                            </div>
                            `;
                        }).join('')}
                    </div>
                    
                    <div class="form-group">
                        <label for="encounter-notes">Notas adicionales:</label>
                        <textarea id="encounter-notes" rows="2" placeholder="Información complementaria (opcional)"></textarea>
                    </div>
                </div>
                
                <div class="form-actions encounter-form-actions" style="display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: flex-end; padding-top: 1rem; border-top: 1px solid #e5e7eb; margin-top: auto; background: #ffffff;">
                    <button type="button" class="btn btn-secondary" id="cancel-encounter"><i class="fas fa-times"></i> Cancelar</button>
                    <button type="button" class="btn btn-success" id="download-hl7-summary-btn" data-appointment-id="${appointmentId}" data-client-id="${clientId}" style="background-color: #28a745; border-color: #28a745; color: white;">
                        <i class="fas fa-file-download"></i> Descargar HL7
                    </button>
                    <button type="button" class="btn btn-info" id="prescribe-btn" data-client-id="${clientId}" data-client-name="${clientName}" data-appointment-id="${appointmentId}" style="background-color: #17a2b8; border-color: #17a2b8; color: white;">
                        <i class="fas fa-prescription"></i> Recetar
                    </button>
                    <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Guardar Consulta</button>
                </div>
            </div>
            
            <!-- Columna derecha: Videollamada -->
            <div class="encounter-video-column">
                <div id="video-call-section" style="padding: 1rem; background: #f0f9ff; border-radius: 0.5rem; border: 1px solid #bae6fd; height: 100%; display: flex; flex-direction: column;">
                    <h4 style="margin-bottom: 0.5rem; color: #0369a1; display: flex; align-items: center; gap: 0.5rem;">
                        <i class="fas fa-video"></i> Videollamada
                    </h4>
                    <div id="video-call-container" style="flex: 1; min-height: 400px; height: 500px; background: #000; border-radius: 0.5rem; position: relative; display: flex; align-items: center; justify-content: center; color: #fff; margin-bottom: 0.5rem; overflow: hidden;">
                        <p id="video-loading" style="text-align: center; position: absolute; z-index: 10;">Cargando videollamada...</p>
                    </div>
                    <div id="video-controls" style="display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap;">
                        <button type="button" id="toggle-mic" class="btn btn-secondary" style="padding: 0.5rem 1rem;">
                            <i class="fas fa-microphone"></i> Micrófono
                        </button>
                        <button type="button" id="toggle-camera" class="btn btn-secondary" style="padding: 0.5rem 1rem;">
                            <i class="fas fa-video"></i> Cámara
                        </button>
                        <button type="button" id="end-call" class="btn btn-danger" style="padding: 0.5rem 1rem;">
                            <i class="fas fa-phone-slash"></i> Finalizar
                        </button>
                    </div>
                </div>
            </div>
        </form>
    </div>
</div>
`;

const restoreAttendButton = (appointmentId) => {
    const button = document.querySelector(`[data-appointment-id="${appointmentId}"]`);
    if (button) {
        button.innerHTML = 'Atender';
        button.classList.remove('in-consultation');
        button.disabled = false;
    }
};

const setupModalCloseHandlers = (modal, appointmentId) => {
    modal.querySelectorAll('.close-modal, #cancel-encounter').forEach(btn => {
        btn.addEventListener('click', async () => {
            console.log('❌ Cerrando modal de encounter');
            
            // Limpiar la videollamada antes de cerrar el modal
            if (modal.callFrame) {
                console.log('🧹 Limpiando videollamada al cerrar modal...');
                try {
                    await modal.callFrame.leave().catch(() => {});
                    modal.callFrame.destroy();
                } catch (e) {
                    console.warn('⚠️ Error al limpiar videollamada:', e);
                }
                modal.callFrame = null;
            }
            
            modal.remove();
            restoreAttendButton(appointmentId);
            
            // Reducir contador de consultas activas cuando se cierra el modal sin guardar
            const { updateCounter } = await import('./fumigator-core.js');
            updateCounter('active-consultation', -1);
            console.log('📊 Contador de consultas activas reducido (modal cerrado sin guardar)');
        });
    });
};

const checkExistingEncounter = async (appointmentId, modal) => {
    try {
        const { ApiClinical } = await import('../api.js');
        const existing = await ApiClinical.get(`v1/Encounter?appointmentId=${appointmentId}`);
        if (existing && existing.length > 0) {
            showNotification('Esta consulta ya fue atendida anteriormente.', 'warning');
            modal.remove();
            await updateAppointmentStatus(appointmentId, 'COMPLETED', null, true).catch(console.warn);
            return true;
        }
    } catch (err) {
        console.warn('⚠️ No se pudo verificar encounters:', err);
    }
    return false;
};

const setupDownloadHL7Button = (modal) => {
    setTimeout(() => {
        const btn = modal.querySelector('#download-hl7-summary-btn');
        if (btn) {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                try {
                    await downloadHl7Summary(btn.dataset.appointmentId, btn.dataset.clientId);
                } catch (error) {
                    console.error('❌ Error descargando HL7:', error);
                    showNotification('Error al descargar el resumen HL7', 'error');
                }
            });
        }
    }, 100);
};

const setupPrescribeButton = (modal) => {
    setTimeout(() => {
        const btn = modal.querySelector('#prescribe-btn');
        if (btn) {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const { appointmentId, clientId, clientName } = newBtn.dataset;
                console.log('💊 Iniciando proceso de receta:', { clientName, clientId, appointmentId });
                
                // ✅ NUEVA LÓGICA: Primero intentar guardar el encounter
                let encounterId = null;
                try {
                    const { ApiClinical } = await import('../api.js');
                    
                    // Primero verificar si ya existe un encounter
                    let existingEncounters = [];
                    try {
                        const result = await ApiClinical.get(`v1/Encounter?appointmentId=${appointmentId}`);
                        // Asegurar que sea un array
                        existingEncounters = Array.isArray(result) ? result : (result ? [result] : []);
                    } catch (getError) {
                        // Si es 404 o no hay encounters, continuar para crear uno nuevo
                        if (getError.status === 404 || getError.message?.includes('no tiene encuentros')) {
                            console.log('ℹ️ No se encontró encounter existente, se creará uno nuevo');
                            existingEncounters = [];
                        } else {
                            // Para otros errores, loguear pero continuar
                            console.warn('⚠️ Error al buscar encounter, se intentará crear uno nuevo:', getError);
                            existingEncounters = [];
                        }
                    }
                    
                    if (existingEncounters && existingEncounters.length > 0) {
                        // Ya existe un encounter guardado
                        encounterId = existingEncounters[0].encounterId || existingEncounters[0].EncounterId;
                        console.log('✅ Encounter existente encontrado:', encounterId);
                    } else {
                        // No existe, intentar guardarlo primero
                        console.log('ℹ️ No hay encounter guardado, intentando crear uno...');
                        
                        // Validar que el formulario tenga los datos mínimos
                        const reasonsField = modal.querySelector('#encounter-reasons');
                        const subjectiveField = modal.querySelector('#encounter-subjective');
                        const objectiveField = modal.querySelector('#encounter-objective');
                        const assessmentField = modal.querySelector('#encounter-assessment');
                        const planField = modal.querySelector('#encounter-plan');
                        
                        // Si faltan datos, permitir continuar sin encounterId (el modal de receta lo manejará)
                        if (!reasonsField?.value?.trim() || !subjectiveField?.value?.trim() || !objectiveField?.value?.trim() || !assessmentField?.value?.trim() || !planField?.value?.trim()) {
                            console.warn('⚠️ Faltan datos en el formulario, se continuará sin encounterId');
                            const { showNotification } = await import('./fumigator-ui.js');
                            showNotification('No se encontró una consulta guardada. La receta se guardará sin asociarla a una consulta específica.', 'warning');
                            encounterId = null;
                        } else {
                            // Guardar el encounter primero
                            const { fumigatorState, getId } = await import('./fumigator-core.js');
                            const fumigatorId = getId(fumigatorState.currentFumigatorData, 'fumigatorId');
                            if (!fumigatorId) {
                                const { showNotification } = await import('./fumigator-ui.js');
                                showNotification('No se pudo identificar al médico. Por favor, recarga la página.', 'error');
                                console.error('❌ No se pudo obtener fumigatorId:', fumigatorState.currentFumigatorData);
                                return;
                            }
                            console.log('✅ FumigatorId obtenido:', fumigatorId);
                            
                            const encounterData = {
                                ClientId: parseInt(clientId),
                                FumigatorId: parseInt(fumigatorId),
                                AppointmentId: parseInt(appointmentId),
                                Reasons: reasonsField.value.trim(),
                                Subjective: subjectiveField.value.trim(),
                                Objetive: objectiveField.value.trim(),
                                Assessment: assessmentField.value.trim(),
                                Plan: planField.value.trim(),
                                Notes: modal.querySelector('#encounter-notes')?.value?.trim() || '',
                                Status: 'OPEN', // El servicio acepta "OPEN", "SIGNED" o "COMPLETED"
                                Date: new Date().toISOString()
                            };
                            
                            console.log('📤 Guardando encounter antes de emitir receta:', encounterData);
                            try {
                                const savedEncounter = await ApiClinical.post(`v1/Encounter?clientId=${clientId}`, encounterData);
                                encounterId = savedEncounter.encounterId || savedEncounter.EncounterId;
                                console.log('✅ Encounter guardado con ID:', encounterId);
                                const { showNotification } = await import('./fumigator-ui.js');
                                showNotification('Consulta guardada. Ahora puedes emitir la receta.', 'success');
                            } catch (saveError) {
                                console.error('❌ Error al guardar encounter:', saveError);
                                console.error(' Status:', saveError.status);
                                console.error(' Message:', saveError.message);
                                console.error(' Details:', saveError.details);
                                
                                // Si ya existe (409), intentar obtenerlo de nuevo
                                if (saveError.status === 409) {
                                    try {
                                        const retryEncounters = await ApiClinical.get(`v1/Encounter?appointmentId=${appointmentId}`);
                                        if (retryEncounters?.length > 0) {
                                            encounterId = retryEncounters[0].encounterId || retryEncounters[0].EncounterId;
                                            console.log('✅ Encounter ya existía, usando ID:', encounterId);
                                        }
                                    } catch (retryError) {
                                        console.error('❌ Error al obtener encounter existente:', retryError);
                                        throw saveError;
                                    }
                                } else {
                                    // Mostrar detalles del error de validación
                                    if (saveError.status === 400 && saveError.details) {
                                        const detailsArray = Object.entries(saveError.details).map(([field, errors]) => {
                                            const errorList = Array.isArray(errors) ? errors.join(', ') : errors;
                                            return `${field}: ${errorList}`;
                                        });
                                        console.error(' Errores de validación:', detailsArray);
                                        throw new Error(`Error de validación: ${detailsArray.join('; ')}`);
                                    }
                                    throw saveError;
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error('❌ Error al procesar encounter:', err);
                    // Si el error es que no hay encounters, permitir continuar sin encounterId
                    if (err.message?.includes('no tiene encuentros') || err.status === 404) {
                        console.warn('⚠️ No se encontró encounter, se continuará sin encounterId');
                        encounterId = null;
                    } else {
                        const { showNotification } = await import('./fumigator-ui.js');
                        showNotification('Error al preparar la receta. Por favor, intenta nuevamente.', 'error');
                        return;
                    }
                }
                
                // Ahora abrir el modal de receta con el encounterId válido
                console.log('✅ Abriendo modal de receta con encounterId:', encounterId);
                const { openPrescriptionModal } = await import('./fumigator-prescriptions.js');
                openPrescriptionModal(clientName, clientId, encounterId, appointmentId);
            });
        }
    }, 100);
};

export async function openEncounterModal(appointmentId, clientId, clientName) {
    console.log('📋 Abriendo modal de encounter:', { appointmentId, clientId, clientName });
    
    // Cerrar cualquier modal anterior que pueda estar abierto
    const existingModals = document.querySelectorAll('.modal');
    existingModals.forEach(existingModal => {
        if (existingModal.callFrame) {
            console.log('🧹 Limpiando modal anterior con videollamada activa...');
            try {
                existingModal.callFrame.leave().catch(() => {});
                existingModal.callFrame.destroy();
            } catch (e) {
                console.warn('⚠️ Error al limpiar modal anterior:', e);
            }
        }
        existingModal.remove();
    });
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = createEncounterForm(appointmentId, clientId, clientName);
    document.body.appendChild(modal);
    
    // CRÍTICO: Esperar a que el modal esté completamente en el DOM antes de continuar
    console.log('⏳ Esperando a que el modal esté en el DOM...');
    await new Promise(resolve => {
        // Esperar al siguiente frame de renderizado
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                resolve();
            });
        });
    });
    
    // Verificar que el modal y el contenedor estén en el DOM
    const videoContainer = modal.querySelector('#video-call-container');
    if (!videoContainer || !videoContainer.isConnected) {
        console.warn('⚠️ El contenedor no está en el DOM inmediatamente, esperando un poco más...');
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // ✅ AGREGAR: Guardar fumigatorId en el formulario para usarlo después
    const { fumigatorState } = await import('./fumigator-core.js');
    const fumigatorId = fumigatorState.currentFumigatorData?.fumigatorId;
    if (fumigatorId) {
        const form = modal.querySelector('#encounter-form');
        if (form) {
            form.dataset.fumigatorId = fumigatorId;
        }
    }
    
    setupModalCloseHandlers(modal, appointmentId);
    if (await checkExistingEncounter(appointmentId, modal)) return;
    setupDownloadHL7Button(modal);
    setupPrescribeButton(modal);
    
    // Inicializar videollamada - ahora el modal debería estar completamente en el DOM
    initializeVideoCall(modal, appointmentId, clientId, clientName);
    
    // Usar un flag en el modal para evitar múltiples guardados
    if (!modal.dataset.isSaving) {
        modal.dataset.isSaving = 'false';
    }
    
    const form = modal.querySelector('#encounter-form');
    if (form) {
        // Remover event listeners anteriores si existen
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        
        newForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Verificar si ya se está guardando
            if (modal.dataset.isSaving === 'true') {
                console.warn('⚠️ Ya se está guardando el encounter, ignorando solicitud duplicada');
                return;
            }
            
            modal.dataset.isSaving = 'true';
            const submitButton = newForm.querySelector('button[type="submit"]');
            const originalText = submitButton.innerHTML;
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
            
            try {
                await saveEncounter(modal, appointmentId, clientId);
            } catch (error) {
                submitButton.disabled = false;
                submitButton.innerHTML = originalText;
                modal.dataset.isSaving = 'false';
            }
        });
    }
}

// ===================================
// GUARDADO DE ENCOUNTER
// ===================================

async function saveEncounter(modal, appointmentId, clientId) {
    try {
        const fumigatorId = getId(fumigatorState.currentFumigatorData, 'fumigatorId');
        if (!fumigatorId) {
            showNotification('No se pudo identificar al médico', 'error');
            modal.dataset.isSaving = 'false';
            return;
        }
        
        console.log('💾 Guardando encounter...');
        
        // Verificar si ya existe un encounter para este appointment
        const { ApiClinical } = await import('../api.js');
        try {
            const existingEncounters = await ApiClinical.get(`v1/Encounter?appointmentId=${appointmentId}`);
            const encountersArray = Array.isArray(existingEncounters) ? existingEncounters : (existingEncounters?.value || []);
            if (encountersArray && encountersArray.length > 0) {
                console.warn('⚠️ Ya existe un encounter para este appointment, no se guardará duplicado');
                showNotification('Esta consulta ya fue guardada anteriormente.', 'warning');
                modal.dataset.isSaving = 'false';
                return;
            }
        } catch (checkError) {
            // Si es 404, no hay problema, continuar
            if (checkError.status !== 404) {
                console.warn('⚠️ Error al verificar encounter existente:', checkError);
            }
        }
        
        const encounterData = {
            ClientId: parseInt(clientId),
            FumigatorId: fumigatorId,
            AppointmentId: parseInt(appointmentId),
            Reasons: document.getElementById('encounter-reasons').value.trim(),
            Subjective: document.getElementById('encounter-subjective').value.trim(),
            Objetive: document.getElementById('encounter-objective').value.trim(),
            Assessment: document.getElementById('encounter-assessment').value.trim(),
            Plan: document.getElementById('encounter-plan').value.trim(),
            Notes: document.getElementById('encounter-notes').value.trim() || 'Sin notas adicionales',
            Status: 'Open', // El backend espera "Open" o "Signed", no "OPEN"
            Date: new Date().toISOString() // Se parsea automáticamente a DateTime en el backend
        };
        
        if (!encounterData.Reasons || !encounterData.Subjective || !encounterData.Objetive || !encounterData.Assessment || !encounterData.Plan) {
            showNotification('Por favor completa todos los campos requeridos (S, O, A, P)', 'error');
            modal.dataset.isSaving = 'false';
            return;
        }
        
        console.log('📤 Enviando encounter a ClinicalMS:', encounterData);
        
        try {
            await ApiClinical.post(`v1/Encounter?clientId=${clientId}`, encounterData);
            console.log('✅ Encounter creado exitosamente');
        } catch (error) {
            modal.dataset.isSaving = 'false';
            
            if (error.status === 409 || error.message?.includes('Ya existe') || error.message?.includes('ya fue atendida')) {
                showNotification('Esta consulta ya fue atendida anteriormente.', 'warning');
                modal.remove();
                await updateAppointmentStatus(appointmentId, 'COMPLETED', null, true).catch(console.warn);
                return;
            }
            
            // Mejorar el manejo de errores de validación
            if (error.status === 400 && error.details) {
                // El backend devuelve un diccionario con los errores de validación
                const validationErrors = error.details;
                const errorMessages = [];
                
                // Extraer mensajes de validación
                for (const [field, messages] of Object.entries(validationErrors)) {
                    const messageArray = Array.isArray(messages) ? messages : [messages];
                    errorMessages.push(`${field}: ${messageArray.join(', ')}`);
                }
                
                const errorMessage = errorMessages.length > 0 
                    ? `Error de validación: ${errorMessages.join('; ')}` 
                    : error.message || 'Error de validación';
                
                console.error('❌ Errores de validación:', validationErrors);
                showNotification(errorMessage, 'error');
                throw new Error(errorMessage);
            }
            
            throw error;
        }
        
        showNotification('Consulta guardada exitosamente', 'success');
        
        // Crear sala de chat automáticamente después de guardar el encounter
        try {
            console.log('💬 Creando sala de chat automáticamente...');
            const { handleAppointmentChatCreation } = await import('../chat/ChatIntegration.js');
            const { ApiScheduling } = await import('../api.js');
            
            // Obtener el appointment completo para crear la sala
            const appointment = await ApiScheduling.get(`Appointments/${appointmentId}`);
            
            // Obtener userId del fumigator y cliente
            const { Api } = await import('../api.js');
            const { fumigatorState } = await import('./fumigator-core.js');
            const currentUserId = fumigatorState.currentUser?.userId || fumigatorState.currentUser?.UserId || fumigatorState.currentUser?.id || fumigatorState.currentUser?.Id;
            
            // Obtener fumigatorUserId
            let fumigatorUserId = null;
            if (appointment.fumigatorId || appointment.FumigatorId) {
                const fumigatorId = appointment.fumigatorId || appointment.FumigatorId;
                try {
                    const fumigator = await Api.get(`v1/technician/${fumigatorId}`);
                    fumigatorUserId = fumigator?.userId || fumigator?.UserId;
                } catch (err) {
                    console.warn('⚠️ No se pudo obtener fumigatorUserId, usando currentUserId:', err);
                    fumigatorUserId = currentUserId;
                }
            } else {
                fumigatorUserId = currentUserId;
            }
            
            // Obtener clientUserId
            let clientUserId = null;
            if (appointment.clientId || appointment.ClientId) {
                const patId = appointment.clientId || appointment.ClientId;
                try {
                    const client = await Api.get(`v1/Client/${patId}`);
                    clientUserId = client?.userId || client?.UserId;
                } catch (err) {
                    console.warn('⚠️ No se pudo obtener clientUserId:', err);
                }
            }
            
            // Preparar objeto appointment con los datos necesarios
            const appointmentForChat = {
                ...appointment,
                appointmentId: appointmentId,
                AppointmentId: appointmentId,
                fumigatorUserId: fumigatorUserId,
                FumigatorUserId: fumigatorUserId,
                clientUserId: clientUserId,
                ClientUserId: clientUserId,
                currentUserId: currentUserId,
                status: appointment.status || appointment.Status || 'IN_PROGRESS',
                Status: appointment.status || appointment.Status || 'IN_PROGRESS'
            };
            
            // Crear la sala de chat
            const chatRoom = await handleAppointmentChatCreation(appointmentForChat);
            if (chatRoom) {
                console.log('✅ Sala de chat creada automáticamente:', chatRoom);
            } else {
                console.log('ℹ️ La sala de chat ya existía o no se pudo crear');
            }
        } catch (chatError) {
            console.warn('⚠️ Error al crear sala de chat automáticamente (no crítico):', chatError);
            // No mostrar error al usuario, es opcional
        }
        
        // Generar resumen HL7 después de guardar el encounter
        try {
            console.log('📋 Generando resumen HL7...');
            const { generateHl7SummaryIfNeeded } = await import('./fumigator-appointments.js');
            await generateHl7SummaryIfNeeded(appointmentId, clientId);
            console.log('✅ Resumen HL7 generado');
        } catch (hl7Error) {
            console.warn('⚠️ Error al generar resumen HL7 (no crítico):', hl7Error);
            // No mostrar error al usuario, es opcional
        }
        
        modal.remove();
        
        try {
            const { ApiScheduling } = await import('../api.js');
            const appointment = await ApiScheduling.get(`Appointments/${appointmentId}`);
            await updateAppointmentStatus(appointmentId, 'COMPLETED', null, true);
            console.log('✅ Estado del appointment actualizado a COMPLETED');
            // La notificación se envía automáticamente en updateAppointmentStatus
        } catch (err) {
            console.error('❌ Error al actualizar estado:', err);
            const errorMessage = err.message || 'Error desconocido';
            console.error('❌ Detalles del error:', { message: errorMessage, status: err.status, appointmentId: appointmentId });
            showNotification(`Consulta guardada, pero no se pudo actualizar el estado del turno: ${errorMessage}`, 'warning');
        }
        
        // Reducir contador de consultas activas cuando se guarda la consulta
        const { updateCounter } = await import('./fumigator-core.js');
        updateCounter('active-consultation', -1);
        console.log('📊 Contador de consultas activas reducido (consulta guardada)');
        updateCounter('prescriptions-today', 1);
        
        // Resetear el flag de guardado
        modal.dataset.isSaving = 'false';
        
    } catch (error) {
        console.error('❌ Error al guardar encounter:', error);
        showNotification(`Error al guardar la consulta: ${error.message || 'Error desconocido'}`, 'error');
        
        // Asegurar que el flag se resetee en caso de error
        if (modal && modal.dataset) {
            modal.dataset.isSaving = 'false';
        }
        throw error;
    }
}

// ===================================
// DESCARGA DE RESUMEN HL7
// ===================================

async function downloadHl7Summary(appointmentId, clientId) {
    try {
        console.log('📥 Descargando resumen HL7:', { appointmentId, clientId });
        const { ApiHl7Gateway } = await import('../api.js');
        
        try {
            await ApiHl7Gateway.download(`v1/Hl7Summary/by-appointment/${appointmentId}`, `resumen-hl7-appointment-${appointmentId}.txt`);
            showNotification('Resumen HL7 descargado exitosamente', 'success');
        } catch (error) {
            console.warn('⚠️ Intentando por clientId:', error);
            await ApiHl7Gateway.download(`v1/Hl7Summary/by-client/${clientId}`, `resumen-hl7-client-${clientId}.txt`);
            showNotification('Resumen HL7 descargado exitosamente', 'success');
        }
    } catch (error) {
        console.error('❌ Error descargando HL7:', error);
        showNotification('No se encontró resumen HL7 para esta consulta', 'warning');
    }
}

// ===================================
// VISUALIZACIÓN DE ENCOUNTERS
// ===================================

const getEncounterField = (encounter, ...fields) => fields.map(f => encounter[f]).find(v => v) || '';

const createEncounterDetailsHTML = (encounter, clientName, fumigatorName) => {
    const date = new Date(getEncounterField(encounter, 'date', 'Date'));
    const status = getEncounterField(encounter, 'status', 'Status') || 'Pendiente';
    const reasons = getEncounterField(encounter, 'reasons', 'Reasons') || 'Sin motivo especificado';
    const subjective = getEncounterField(encounter, 'subjective', 'Subjective') || 'No especificado';
    const objective = getEncounterField(encounter, 'objetive', 'Objetive', 'objective', 'Objective') || 'No especificado';
    const assessment = getEncounterField(encounter, 'assessment', 'Assessment') || 'No especificado';
    const plan = getEncounterField(encounter, 'plan', 'Plan') || 'No especificado';
    const notes = getEncounterField(encounter, 'notes', 'Notes');
    
    return `
    <div class="modal-content" style="max-width: 800px; max-height: 90vh; overflow-y: auto;">
        <div class="modal-header">
            <div>
                <h3>Detalles de la Consulta</h3>
                <p class="encounter-modal-subtitle">Consulta médica completa</p>
            </div>
            <button class="close-modal">&times;</button>
        </div>
        <div class="modal-body encounter-modal-body">
            <div class="encounter-info-section">
                <div class="encounter-info-header">
                    <i class="fas fa-info-circle"></i>
                    <h4>Información General</h4>
                </div>
                <div class="encounter-info-grid">
                    ${[
                        ['calendar', 'Fecha', date.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })],
                        ['clock', 'Hora', date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })],
                        ['user', 'Cliente', clientName],
                        ['user-md', 'Médico', fumigatorName],
                        ['flag', 'Estado', status]
                    ].map(([icon, label, value]) => `
                        <div class="encounter-info-item">
                            <span class="info-label"><i class="fas fa-${icon}"></i> ${label}:</span>
                            <span class="info-value">${value}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div class="encounter-info-section" style="margin-top: 2rem;">
                <div class="encounter-info-header">
                    <i class="fas fa-stethoscope"></i>
                    <h4>Motivo de Consulta</h4>
                </div>
                <p style="color: #111827; margin-top: 1rem;">${reasons}</p>
            </div>
            
            <div class="encounter-info-section" style="margin-top: 2rem;">
                <div class="encounter-info-header">
                    <i class="fas fa-file-medical"></i>
                    <h4>Notas SOAP</h4>
                </div>
                <div style="margin-top: 1rem;">
                    ${[
                        ['Subjetivo (S)', subjective],
                        ['Objetivo (O)', objective],
                        ['Evaluación (A)', assessment],
                        ['Plan (P)', plan]
                    ].map(([label, text]) => `
                        <div style="margin-bottom: 1rem;">
                            <strong style="color: #6b7280; display: block; margin-bottom: 0.5rem;">${label}:</strong>
                            <p style="color: #111827; margin: 0; white-space: pre-wrap;">${text}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            ${notes ? `
            <div class="encounter-info-section" style="margin-top: 2rem;">
                <div class="encounter-info-header">
                    <i class="fas fa-sticky-note"></i>
                    <h4>Notas Adicionales</h4>
                </div>
                <p style="color: #111827; margin-top: 1rem; white-space: pre-wrap;">${notes}</p>
            </div>
            ` : ''}
        </div>
    </div>
    `;
};

export async function viewEncounterDetailsFromFumigator(encounterId) {
    try {
        console.log('👁️ Visualizando encounter:', encounterId);
        const { ApiClinical, Api } = await import('../api.js');
        const encounter = await ApiClinical.get(`v1/Encounter/${encounterId}`);
        
        if (!encounter) {
            showNotification('No se encontraron los detalles del encuentro', 'error');
            return;
        }
        
        const clientId = getEncounterField(encounter, 'clientId', 'ClientId');
        const fumigatorId = getEncounterField(encounter, 'fumigatorId', 'FumigatorId');
        
        let clientName = 'Cliente desconocido';
        let fumigatorName = 'Dr. Sin nombre';
        
        try {
            if (clientId) {
                const client = await Api.get(`v1/Client/${clientId}`);
                clientName = `${getEncounterField(client, 'name', 'Name')} ${getEncounterField(client, 'lastName', 'LastName')}`.trim() || 'Cliente sin nombre';
            }
            if (fumigatorId) {
                const fumigator = await Api.get(`v1/technician/${fumigatorId}`);
                fumigatorName = `${getEncounterField(fumigator, 'firstName', 'FirstName')} ${getEncounterField(fumigator, 'lastName', 'LastName')}`.trim() || `Dr. ID ${fumigatorId}`;
            }
        } catch (err) {
            console.warn('⚠️ Error cargando info:', err);
        }
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        modal.innerHTML = createEncounterDetailsHTML(encounter, clientName, fumigatorName);
        document.body.appendChild(modal);
        
        modal.querySelector('.close-modal')?.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => e.target === modal && modal.remove());
        
    } catch (error) {
        console.error('❌ Error al cargar detalles:', error);
        showNotification('Error al cargar los detalles de la consulta', 'error');
    }
}

if (typeof window !== 'undefined') {
    window.viewEncounterDetailsFromFumigator = viewEncounterDetailsFromFumigator;
}

// ===================================
// VIDELLAMADA
// ===================================

async function initializeVideoCall(modal, appointmentId, clientId, clientName) {
    try {
        const videoSection = modal.querySelector('#video-call-section');
        const videoContainer = modal.querySelector('#video-call-container');
        const videoLoading = modal.querySelector('#video-loading');
        
        if (!videoSection || !videoContainer) {
            console.warn('⚠️ Sección de videollamada no encontrada');
            return;
        }
        
        // Limpiar cualquier instancia anterior de Daily.co
        if (modal.callFrame) {
            console.log('🧹 Limpiando instancia anterior de Daily.co...');
            try {
                modal.callFrame.leave();
                modal.callFrame.destroy();
            } catch (e) {
                console.warn('⚠️ Error al limpiar callFrame anterior:', e);
            }
            modal.callFrame = null;
        }
        
        // CRÍTICO: Esperar a que el modal esté completamente renderizado y visible
        console.log('⏳ Esperando a que el modal esté completamente renderizado...');
        await new Promise(resolve => {
            // Esperar al siguiente frame de renderizado
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    resolve();
                });
            });
        });
        
        // Verificar que el modal y el contenedor estén visibles
        const modalVisible = window.getComputedStyle(modal).display !== 'none' && 
                            modal.offsetParent !== null;
        const containerVisible = window.getComputedStyle(videoContainer).display !== 'none' && 
                               videoContainer.offsetParent !== null;
        
        console.log('📦 Estado del modal y contenedor:', {
            modalVisible: modalVisible,
            modalDisplay: window.getComputedStyle(modal).display,
            modalOffsetParent: modal.offsetParent !== null,
            containerVisible: containerVisible,
            containerDisplay: window.getComputedStyle(videoContainer).display,
            containerOffsetParent: videoContainer.offsetParent !== null,
            containerHeight: window.getComputedStyle(videoContainer).height,
            containerWidth: window.getComputedStyle(videoContainer).width
        });
        
        if (!modalVisible || !containerVisible) {
            console.warn('⚠️ Modal o contenedor no están visibles, esperando un poco más...');
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Limpiar el contenedor completamente antes de crear un nuevo frame
        videoContainer.innerHTML = '<p id="video-loading" style="text-align: center; color: #fff; position: absolute; z-index: 10;">Cargando videollamada...</p>';
        
        // Mostrar la sección y asegurar visibilidad
        videoSection.style.display = 'block';
        videoSection.style.visibility = 'visible';
        videoContainer.style.display = 'flex';
        videoContainer.style.visibility = 'visible';
        
        // Intentar obtener token del backend
        try {
            const { ApiScheduling } = await import('../api.js');
            const fumigatorId = getId(fumigatorState.currentFumigatorData, 'fumigatorId');
            
            if (!fumigatorId) {
                throw new Error('No se pudo identificar al médico');
            }
            
            // Crear/obtener sala (obtener URL primero)
            console.log('📹 Solicitando sala de videollamada...', { appointmentId, fumigatorId, clientId });
            const roomResponse = await ApiScheduling.post(`Video/room/${appointmentId}?technicianId=${fumigatorId}&clientId=${clientId}`, {});
            console.log('✅ Respuesta del servidor de videollamada:', roomResponse);
            
            // Obtener URL de la sala
            const roomUrl = roomResponse.roomUrl || roomResponse.RoomUrl;
            const roomName = roomResponse.roomName || roomResponse.RoomName || `appointment-${appointmentId}`;
            
            if (!roomUrl) {
                console.error('❌ No se recibió la URL de la sala en la respuesta:', roomResponse);
                throw new Error('No se recibió la URL de la sala en la respuesta');
            }
            
            console.log('📹 URL de sala obtenida:', roomUrl);
            
            // Obtener token por separado para el fumigator (con isOwner=true)
            // El fumigator debe ser owner para poder iniciar la reunión
            console.log('📹 Obteniendo token para el fumigator...', { appointmentId, fumigatorId });
            let token = null;
            try {
                const tokenResponse = await ApiScheduling.get(`Video/token/${appointmentId}?userId=technician-${fumigatorId}&isOwner=true`);
                    token = tokenResponse.token || tokenResponse.Token;
                    console.log('✅ Token obtenido para el fumigator (con owner):', token ? `Presente (${token.length} caracteres)` : 'Faltante');
            } catch (tokenError) {
                console.error('❌ Error al obtener token para el fumigator:', tokenError);
                        throw new Error('No se pudo obtener el token de videollamada. Por favor, intenta nuevamente.');
            }
            
            if (!token) {
                console.error('❌ No se pudo obtener el token de videollamada');
                throw new Error('No se recibió el token de videollamada. Por favor, intenta nuevamente.');
            }
            
            console.log('📹 Datos finales de la sala:', { 
                hasToken: !!token, 
                tokenLength: token ? token.length : 0,
                hasRoomUrl: !!roomUrl,
                roomUrl,
                roomName 
            });
            
            // Cargar Daily.co SDK con fallback a múltiples CDNs
                if (videoLoading) {
                    videoLoading.textContent = 'Cargando SDK de videollamada...';
                }
                
            const ok = await loadDailySdk();
            if (!ok || !window.DailyIframe) {
                    if (videoLoading) videoLoading.style.display = 'none';
                showVideoError(videoContainer, 'No se pudo cargar el SDK de videollamada.');
                return;
            }
            
                if (videoLoading) {
                    videoLoading.textContent = 'Conectando a la videollamada...';
                }
                startVideoCall(videoContainer, roomUrl, token, modal, appointmentId);
            
        } catch (error) {
            console.error('❌ Error al inicializar videollamada:', error);
            
            // Ocultar loading en caso de error
            if (videoLoading) videoLoading.style.display = 'none';
            
            // Mensajes de error más específicos
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
            
            showVideoError(videoContainer, `Videollamada no disponible: ${errorMessage}`);
        }
        
    } catch (error) {
        console.error('❌ Error en initializeVideoCall:', error);
    }
}

async function startVideoCall(videoContainer, roomUrl, token, modal, appointmentId) {
    try {
        // CRÍTICO: Verificar que el contenedor esté en el DOM ANTES de cualquier otra cosa
        console.log('🔍 Verificando que el contenedor esté en el DOM...');
        console.log('📦 Estado del contenedor:', {
            exists: !!videoContainer,
            isConnected: videoContainer?.isConnected,
            parentElement: videoContainer?.parentElement?.tagName || 'no parent',
            offsetParent: videoContainer?.offsetParent !== null,
            display: videoContainer ? window.getComputedStyle(videoContainer).display : 'N/A'
        });
        
        if (!videoContainer) {
            console.error('❌ videoContainer es null o undefined');
            return;
        }
        
        if (!videoContainer.isConnected) {
            console.error('❌ El contenedor no está en el DOM!');
            console.error('❌ Intentando encontrar el contenedor en el modal...');
            
            // Intentar encontrar el contenedor en el modal
            const containerFromModal = modal.querySelector('#video-call-container');
            if (containerFromModal && containerFromModal.isConnected) {
                console.log('✅ Contenedor encontrado en el modal y está conectado');
                videoContainer = containerFromModal;
            } else {
                console.error('❌ No se pudo encontrar un contenedor válido en el DOM');
                // Esperar un poco y reintentar
                await new Promise(resolve => setTimeout(resolve, 500));
                const retryContainer = modal.querySelector('#video-call-container');
                if (retryContainer && retryContainer.isConnected) {
                    console.log('✅ Contenedor encontrado después de esperar');
                    videoContainer = retryContainer;
                } else {
                    console.error('❌ El contenedor sigue sin estar en el DOM después de esperar');
                    const errorMsg = modal.querySelector('#video-loading') || document.createElement('p');
                    errorMsg.id = 'video-loading';
                    errorMsg.style.cssText = 'text-align: center; color: #fff; position: absolute; z-index: 10;';
                    errorMsg.textContent = 'Error: El contenedor de videollamada no está disponible. Por favor, recarga la página.';
                    if (!modal.querySelector('#video-loading')) {
                        const container = modal.querySelector('#video-call-container');
                        if (container) {
                            container.appendChild(errorMsg);
                        }
                    }
                    return;
                }
            }
        }
        
        // Obtener el elemento de loading del modal
        const videoLoading = modal.querySelector('#video-loading');
        
        // Verificar si ya existe un callFrame y limpiarlo
        if (modal.callFrame) {
            console.log('🧹 Destruyendo callFrame existente antes de crear uno nuevo...');
            try {
                await modal.callFrame.leave().catch(() => {});
            } catch {}
            try {
                modal.callFrame.destroy();
            } catch {}
            modal.callFrame = null;
        }
        
        if (typeof window.DailyIframe === 'undefined') {
            console.error('❌ SDK de Daily.co no disponible');
            showVideoError(videoContainer, 'SDK de Daily.co no disponible. Por favor, recarga la página.');
            return;
        }
        
        // El loading se ocultará cuando se una exitosamente
        // No lo ocultamos aquí para mantener el mensaje visible
        
        // Limpiar cualquier contenido previo del contenedor ANTES de crear el frame
        // IMPORTANTE: No limpiar el #video-loading, solo ocultarlo
        const existingLoading = videoContainer.querySelector('#video-loading');
        if (existingLoading) {
            existingLoading.style.display = 'none';
        }
        
        // Remover cualquier iframe existente
        const existingIframe = videoContainer.querySelector('iframe');
        if (existingIframe) {
            existingIframe.remove();
        }
        
        // Garantizar dimensiones y visibilidad del contenedor
        // El contenedor ya tiene position: relative y display: flex del HTML
        // Solo asegurarnos de que tenga dimensiones mínimas
        if (!videoContainer.style.height || videoContainer.style.height === 'auto') {
            videoContainer.style.height = '500px';
        }
        if (!videoContainer.style.width || videoContainer.style.width === 'auto') {
            videoContainer.style.width = '100%';
        }
        
        // Asegurar que el contenedor sea visible y esté en el DOM
        videoContainer.style.display = 'flex';
        videoContainer.style.visibility = 'visible';
        videoContainer.style.position = 'relative';
        videoContainer.style.opacity = '1';
        
        // Verificar que el contenedor esté realmente visible en el DOM
        const containerComputed = window.getComputedStyle(videoContainer);
        const containerVisible = containerComputed.display !== 'none' && 
                                containerComputed.visibility !== 'hidden' &&
                                containerComputed.opacity !== '0' &&
                                videoContainer.offsetParent !== null;
        
        console.log('📦 Visibilidad del contenedor:', {
            display: containerComputed.display,
            visibility: containerComputed.visibility,
            opacity: containerComputed.opacity,
            offsetParent: videoContainer.offsetParent !== null,
            isConnected: videoContainer.isConnected,
            visible: containerVisible,
            width: containerComputed.width,
            height: containerComputed.height
        });
        
        if (!containerVisible) {
            console.warn('⚠️ El contenedor no está visible - esto puede causar problemas');
        }
        
        // Extraer roomName del URL para logging
        const roomName = roomUrl ? roomUrl.split('/').pop() : 'unknown';
        console.log('📹 Creando frame de videollamada:', { 
            roomUrl, 
            roomName,
            tokenPrefix: token ? token.slice(0, 15) + '...' : 'No token',
            tokenLength: token ? token.length : 0,
            containerHeight: videoContainer.style.height,
            containerWidth: videoContainer.style.width
        });
        
        // Crear el frame directamente en el contenedor
        // NO usar iframeAttributes porque no está soportado en esta versión del SDK
        const frameConfig = {
            showLeaveButton: false,
            showFullscreenButton: true,
            iframeStyle: {
                position: 'absolute',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                border: '0',
                borderRadius: '0.5rem',
                zIndex: 1
            }
        };
        
        // NO agregar iframeAttributes - lo aplicaremos manualmente después
        
        console.log('📹 Llamando a createFrame con config:', frameConfig);
        console.log('📦 Contenedor antes de createFrame:', {
            innerHTML: videoContainer.innerHTML.substring(0, 100),
            children: videoContainer.children.length,
            computedStyle: {
                display: window.getComputedStyle(videoContainer).display,
                position: window.getComputedStyle(videoContainer).position,
                height: window.getComputedStyle(videoContainer).height,
                width: window.getComputedStyle(videoContainer).width
            }
        });
        
        console.log('📹 Creando callFrame con DailyIframe.createFrame...');
        console.log('📦 Contenedor antes de createFrame:', {
            id: videoContainer.id,
            className: videoContainer.className,
            children: videoContainer.children.length,
            innerHTML: videoContainer.innerHTML.substring(0, 200)
        });
        
        // CRÍTICO: Asegurar que el contenedor esté en el DOM y visible antes de crear el frame
        if (!videoContainer.isConnected) {
            console.error('❌ El contenedor no está en el DOM!');
            showVideoError(videoContainer, 'Error: El contenedor de videollamada no está disponible.');
            return;
        }
        
        // Forzar que el contenedor tenga dimensiones válidas
        const containerRect = videoContainer.getBoundingClientRect();
        console.log('📐 Dimensiones del contenedor:', {
            width: containerRect.width,
            height: containerRect.height,
            top: containerRect.top,
            left: containerRect.left,
            visible: containerRect.width > 0 && containerRect.height > 0
        });
        
        if (containerRect.width === 0 || containerRect.height === 0) {
            console.warn('⚠️ El contenedor no tiene dimensiones válidas, forzando...');
            videoContainer.style.minHeight = '500px';
            videoContainer.style.minWidth = '100%';
            // Esperar un frame más para que se apliquen los estilos
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
        
        console.log('📹 Creando callFrame...');
        const callFrame = window.DailyIframe.createFrame(videoContainer, frameConfig);
        console.log('✅ callFrame creado:', {
            callFrame: callFrame,
            hasIframe: typeof callFrame.iframe === 'function',
            hasJoin: typeof callFrame.join === 'function',
            hasOn: typeof callFrame.on === 'function',
            hasDestroy: typeof callFrame.destroy === 'function'
        });
        
        // Guardar referencia al callFrame
        modal.callFrame = callFrame;
        
        // CRÍTICO: Esperar a que el iframe esté realmente en el DOM y conectado
        console.log('⏳ Esperando a que el iframe esté en el DOM...');
        let dailyIframe = null;
        let iframeReady = false;
        
        // Intentar obtener el iframe varias veces hasta que esté conectado
        for (let attempt = 0; attempt < 30; attempt++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            
            try {
                dailyIframe = callFrame.iframe();
            } catch (e) {
                dailyIframe = videoContainer.querySelector('iframe');
            }
            
            if (!dailyIframe) {
                dailyIframe = videoContainer.querySelector('iframe');
            }
            
            if (dailyIframe) {
                // CRÍTICO: Verificar que el iframe esté realmente en el DOM
                const isConnected = dailyIframe.isConnected;
                const isInContainer = videoContainer.contains(dailyIframe);
                const hasOffsetParent = dailyIframe.offsetParent !== null;
                
                console.log(`🔍 Intento ${attempt + 1}/30 - Iframe estado:`, {
                    exists: !!dailyIframe,
                    isConnected: isConnected,
                    isInContainer: isInContainer,
                    hasOffsetParent: hasOffsetParent,
                    src: dailyIframe.src || 'no src',
                    tagName: dailyIframe.tagName,
                    parentElement: dailyIframe.parentElement?.tagName || 'no parent'
                });
                
                // Si el iframe no está en el contenedor, agregarlo manualmente
                if (!isInContainer && isConnected) {
                    console.warn('⚠️ Iframe está conectado pero no está en el contenedor, agregándolo...');
                    videoContainer.appendChild(dailyIframe);
                } else if (!isConnected) {
                    console.warn('⚠️ Iframe no está conectado, intentando agregarlo al contenedor...');
                    // Remover de donde esté y agregarlo al contenedor
                    if (dailyIframe.parentElement) {
                        dailyIframe.parentElement.removeChild(dailyIframe);
                    }
                    videoContainer.appendChild(dailyIframe);
                }
                
                // Verificar nuevamente después de agregarlo
                if (dailyIframe.isConnected && videoContainer.contains(dailyIframe) && hasOffsetParent) {
                    console.log('✅ Iframe está conectado al DOM y visible');
                    iframeReady = true;
                    break;
                }
            }
        }
        
        if (!dailyIframe) {
            console.error('❌ Iframe no encontrado después de 3 segundos');
            showVideoError(videoContainer, 'Error: No se pudo crear el iframe de videollamada. Por favor, recarga la página.');
            return;
        }
        
        // Aplicar permisos y estilos al iframe
        dailyIframe.setAttribute('allow', 'camera; microphone; autoplay; display-capture; clipboard-read; clipboard-write; fullscreen');
        dailyIframe.style.display = 'block';
        dailyIframe.style.visibility = 'visible';
        dailyIframe.style.opacity = '1';
        dailyIframe.style.width = '100%';
        dailyIframe.style.height = '100%';
        dailyIframe.style.position = 'absolute';
        dailyIframe.style.top = '0';
        dailyIframe.style.left = '0';
        dailyIframe.style.zIndex = '1';
        
        // Verificar estado final
        const finalState = {
            isConnected: dailyIframe.isConnected,
            isInContainer: videoContainer.contains(dailyIframe),
            hasOffsetParent: dailyIframe.offsetParent !== null,
            allow: dailyIframe.getAttribute('allow'),
            src: dailyIframe.src || 'no src',
            display: window.getComputedStyle(dailyIframe).display,
            visibility: window.getComputedStyle(dailyIframe).visibility
        };
        
        console.log('✅ Iframe configurado:', finalState);
        
        if (!finalState.isConnected || !finalState.isInContainer) {
            console.error('❌ Iframe no está correctamente conectado después de todos los intentos');
            showVideoError(videoContainer, 'Error: El iframe de videollamada no se pudo conectar correctamente. Por favor, recarga la página.');
            return;
        }
        
        // Configurar controles
        setupVideoControls(modal, callFrame, appointmentId);
        
        // Trazas útiles (registrar ANTES del join)
        console.log('📝 Registrando event listeners en callFrame...');
        callFrame.on('joining-meeting', () => {
            console.log('🔵 [EVENTO] joining-meeting disparado');
            if (videoLoading) videoLoading.textContent = 'Uniéndose a la videollamada...';
        });
        callFrame.on('joined-meeting', (e) => {
            console.log('🟢 [EVENTO] joined-meeting disparado', e);
            const loading = videoContainer.querySelector('#video-loading');
            if (loading) {
                loading.style.display = 'none';
                console.log('✅ Loading ocultado después de joined-meeting');
            }
            
            // Verificar que el iframe sea visible
            setTimeout(() => {
                const iframe = videoContainer.querySelector('iframe');
                if (iframe) {
                    iframe.style.display = 'block';
                    iframe.style.visibility = 'visible';
                    iframe.style.opacity = '1';
                    console.log('✅ Iframe hecho visible después de joined-meeting');
                }
            }, 500);
        });
        callFrame.on('left-meeting', () => console.log('🟡 left-meeting'));
        callFrame.on('participant-updated', (e) => console.log('[participant-updated]', e));
        callFrame.on('loading', (e) => {
            console.log('[loading]', e);
            if (videoLoading) videoLoading.textContent = 'Cargando videollamada...';
        });
        callFrame.on('camera-error', (e) => {
            console.error('📷 camera-error', e);
            showVideoError(videoContainer, `Error de cámara: ${e.errorMsg || e.message || 'Error desconocido'}`);
        });
        callFrame.on('error', (e) => {
            console.error('❌ daily error', e);
            console.error('❌ Error completo:', JSON.stringify(e, null, 2));
            // Mostrar error si es crítico
            if (e?.errorMsg?.includes('not allowed') || e?.errorMsg?.includes('permission')) {
                showVideoError(videoContainer, `Error de permisos: ${e.errorMsg}. Verifica que el token sea válido y que tengas permisos para unirte a la sala.`);
            }
        });
        callFrame.on('meeting-error', (e) => {
            console.error('[meeting-error]', e);
            console.error('[meeting-error] completo:', JSON.stringify(e, null, 2));
            const errorMsg = e?.errorMsg || e?.message || e?.error?.message || 'Error desconocido';
            showVideoError(videoContainer, `Error en la reunión: ${errorMsg}`);
        });
        
        // Agregar más eventos para diagnóstico
        callFrame.on('nonfatal-error', (e) => {
            console.warn('⚠️ nonfatal-error', e);
        });
        
        callFrame.on('network-quality-change', (e) => {
            console.log('📶 network-quality-change', e);
        });
        
        // Verificar que tenemos token y URL antes de intentar unirse
        if (!roomUrl) {
            console.error('❌ No hay URL de sala disponible');
            showVideoError(videoContainer, 'Error: No se recibió la URL de la sala. Por favor, intenta nuevamente.');
            return;
        }
        
        if (!token) {
            console.error('❌ No hay token disponible para unirse a la sala');
            showVideoError(videoContainer, 'Error: No se recibió el token de videollamada. Por favor, intenta nuevamente.');
            return;
        }
        
        // Importante: esperar explícitamente el join y capturar error
        console.log('📹 join →', { roomUrl, roomName });
        
        // Sanitizar URL antes del join (defensivo)
        const validUrl = new URL(roomUrl).toString();
        
        // El iframe ya debería estar configurado arriba, pero verificamos una vez más
        console.log('🔍 Verificación final del iframe antes del join...');
        let finalIframe = null;
        try {
            finalIframe = callFrame.iframe();
        } catch (e) {
            finalIframe = videoContainer.querySelector('iframe');
        }
        
        if (!finalIframe) {
            finalIframe = videoContainer.querySelector('iframe');
        }
        
        if (finalIframe) {
            // Verificar que esté conectado
            if (!finalIframe.isConnected) {
                console.warn('⚠️ Iframe no está conectado, intentando forzar conexión...');
                if (!videoContainer.contains(finalIframe)) {
                    videoContainer.appendChild(finalIframe);
                }
            }
            
            // Asegurar permisos y visibilidad una vez más
            finalIframe.setAttribute('allow', 'camera; microphone; autoplay; display-capture; clipboard-read; clipboard-write; fullscreen');
            finalIframe.style.display = 'block';
            finalIframe.style.visibility = 'visible';
            finalIframe.style.opacity = '1';
            finalIframe.style.width = '100%';
            finalIframe.style.height = '100%';
            finalIframe.style.position = 'absolute';
            finalIframe.style.top = '0';
            finalIframe.style.left = '0';
            finalIframe.style.zIndex = '1';
            
            console.log('✅ Iframe final verificado:', {
                isConnected: finalIframe.isConnected,
                hasOffsetParent: finalIframe.offsetParent !== null,
                allow: finalIframe.getAttribute('allow'),
                src: finalIframe.src || 'no src',
                display: window.getComputedStyle(finalIframe).display,
                visibility: window.getComputedStyle(finalIframe).visibility
            });
        } else {
            console.error('❌ Iframe no encontrado antes del join');
            showVideoError(videoContainer, 'Error: No se pudo crear el iframe. Por favor, recarga la página.');
            return;
        }
        
        // Intentar el join - usar un enfoque más simple y directo
        console.log('📹 Intentando join con:', { url: validUrl, tokenLength: token.length });
        
        // Verificar que el iframe tenga permisos antes del join
        const iframeBeforeJoin = videoContainer.querySelector('iframe');
        if (iframeBeforeJoin) {
            const allowAttr = iframeBeforeJoin.getAttribute('allow');
            console.log('🔐 Permisos del iframe antes del join:', allowAttr);
            if (!allowAttr || !allowAttr.includes('camera') || !allowAttr.includes('microphone')) {
                console.error('❌ El iframe no tiene los permisos correctos');
                iframeBeforeJoin.setAttribute('allow', 'camera; microphone; autoplay; display-capture; clipboard-read; clipboard-write; fullscreen');
                console.log('✅ Permisos re-aplicados');
            }
        }
        
        // Hacer el join con mejor manejo de eventos y diagnóstico
        try {
            // Verificar contexto de seguridad
            const isSecureContext = window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost';
            if (!isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
                console.warn('⚠️ Contexto no seguro detectado. Para videollamadas, se recomienda usar HTTPS o localhost.');
            }
            
            // Verificar permisos del navegador ANTES del join
            let hasPermissions = false;
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                console.log('✅ Permisos de cámara/micrófono otorgados');
                hasPermissions = true;
                // Detener el stream inmediatamente - solo queríamos verificar permisos
                stream.getTracks().forEach(track => track.stop());
            } catch (permError) {
                console.warn('⚠️ Permisos de cámara/micrófono no otorgados:', permError.message);
                console.warn('⚠️ Error completo:', permError);
                
                // Mostrar mensaje más específico según el error
                let errorMsg = 'Por favor, permite el acceso a la cámara y el micrófono.';
                if (permError.name === 'NotAllowedError') {
                    errorMsg = 'Acceso a cámara/micrófono denegado. Haz clic en el candado en la barra de direcciones y permite los permisos.';
                } else if (permError.name === 'NotFoundError') {
                    errorMsg = 'No se encontraron dispositivos de cámara/micrófono. Verifica que estén conectados.';
                } else if (permError.name === 'NotReadableError') {
                    errorMsg = 'Los dispositivos están siendo usados por otra aplicación. Cierra otras aplicaciones que usen la cámara/micrófono.';
                }
                
                showVideoError(videoContainer, errorMsg);
                // No lanzar error aquí - intentar el join de todas formas, puede que funcione
            }
            
            // Esperar a que el evento 'joined-meeting' se dispare
            let joinedResolved = false;
            let joinError = null;
            let joiningStarted = false;
            
            const joinedHandler = () => {
                joinedResolved = true;
                console.log('✅ Evento joined-meeting recibido - join exitoso');
            };
            
            const joiningHandler = (e) => {
                joiningStarted = true;
                console.log('🔵 Evento joining-meeting recibido - proceso iniciado', e);
            };
            
            const errorHandler = (e) => {
                joinError = e;
                console.error('❌ Error durante el join:', e);
                console.error('❌ Detalles del error:', JSON.stringify(e, null, 2));
            };
            
            // Registrar los handlers ANTES del join
            console.log('📝 Registrando handlers de eventos para el join...');
            callFrame.on('joining-meeting', joiningHandler);
            callFrame.on('joined-meeting', joinedHandler);
            callFrame.on('error', errorHandler);
            callFrame.on('meeting-error', errorHandler);
            callFrame.on('nonfatal-error', (e) => {
                console.warn('⚠️ [EVENTO] nonfatal-error:', e);
            });
            callFrame.on('loading', (e) => {
                console.log('⏳ [EVENTO] loading:', e);
            });
            callFrame.on('loaded', (e) => {
                console.log('✅ [EVENTO] loaded:', e);
            });
            console.log('✅ Handlers de eventos registrados');
            
            // Iniciar el join
            console.log('📹 Iniciando join() con:', { 
                url: validUrl, 
                tokenLength: token.length,
                tokenPrefix: token.substring(0, 20) + '...',
                hasPermissions: hasPermissions,
                isSecureContext: isSecureContext,
                hostname: location.hostname
            });
            
            // Verificar el iframe una vez más justo antes del join
            let iframeBeforeJoin = null;
            try {
                iframeBeforeJoin = callFrame.iframe();
                console.log('✅ Iframe obtenido del callFrame antes del join');
            } catch (e) {
                console.warn('⚠️ No se pudo obtener iframe del callFrame:', e);
                iframeBeforeJoin = videoContainer.querySelector('iframe');
            }
            
            if (!iframeBeforeJoin) {
                iframeBeforeJoin = videoContainer.querySelector('iframe');
            }
            
            if (iframeBeforeJoin) {
                const allowAttr = iframeBeforeJoin.getAttribute('allow');
                console.log('🔐 Permisos del iframe justo antes del join:', allowAttr);
                if (!allowAttr || !allowAttr.includes('camera') || !allowAttr.includes('microphone')) {
                    console.warn('⚠️ Re-aplicando permisos al iframe...');
                    iframeBeforeJoin.setAttribute('allow', 'camera; microphone; autoplay; display-capture; clipboard-read; clipboard-write; fullscreen');
                }
                
                // Asegurar que el iframe sea completamente visible
                const computedStyle = window.getComputedStyle(iframeBeforeJoin);
                console.log('📐 Estilo computado del iframe:', {
                    display: computedStyle.display,
                    visibility: computedStyle.visibility,
                    opacity: computedStyle.opacity,
                    width: computedStyle.width,
                    height: computedStyle.height,
                    position: computedStyle.position,
                    zIndex: computedStyle.zIndex
                });
                
                // Forzar visibilidad si es necesario
                if (computedStyle.display === 'none') {
                    iframeBeforeJoin.style.display = 'block';
                    console.log('✅ Iframe display cambiado a block');
                }
                if (computedStyle.visibility === 'hidden') {
                    iframeBeforeJoin.style.visibility = 'visible';
                    console.log('✅ Iframe visibility cambiado a visible');
                }
            } else {
                console.warn('⚠️ Iframe no encontrado antes del join - Daily.co debería crearlo');
            }
            
            // Esperar solo un momento breve antes del join
            await new Promise(resolve => setTimeout(resolve, 300));
            
            console.log('📹 Llamando a callFrame.join() ahora...');
            console.log('📹 Parámetros del join:', {
                url: validUrl,
                tokenLength: token.length,
                hasIframe: !!iframeBeforeJoin,
                iframeSrc: iframeBeforeJoin?.src || 'no src',
                callFrameState: callFrame ? 'existe' : 'no existe'
            });
            
            // Verificar que el callFrame esté en un estado válido
            try {
                const participants = callFrame.participants();
                console.log('📊 Participantes antes del join:', participants);
            } catch (e) {
                console.log('📊 No se pueden obtener participantes antes del join (normal)');
            }
            
            // IMPORTANTE: Hacer el join de forma síncrona primero para que Daily.co inicie el proceso
            // No usar .catch() aquí porque queremos que los errores se manejen en el Promise.race
            console.log('📹 Ejecutando callFrame.join()...');
            
            // Verificar el estado del callFrame antes del join
            try {
                const meetingState = callFrame.meetingState();
                console.log('📊 Estado de la reunión antes del join:', meetingState);
            } catch (e) {
                console.log('📊 No se puede obtener el estado de la reunión (normal antes del join)');
            }
            
            // Intentar el join - usar try/catch para capturar errores inmediatos
            let joinPromise;
            try {
                console.log('📹 Llamando a callFrame.join() con:', { url: validUrl, tokenLength: token.length });
                
                // Verificar el iframe una última vez antes del join
                let finalIframe = null;
                try {
                    finalIframe = callFrame.iframe();
                } catch (e) {
                    finalIframe = videoContainer.querySelector('iframe');
                }
                
                if (finalIframe) {
                    console.log('📦 Iframe final antes del join:', {
                        src: finalIframe.src || 'no src',
                        hasSrc: !!finalIframe.src && finalIframe.src !== 'about:blank',
                        allow: finalIframe.getAttribute('allow'),
                        isConnected: finalIframe.isConnected,
                        offsetParent: finalIframe.offsetParent !== null
                    });
                }
                
                // Hacer el join - Daily.co debería manejar el iframe internamente
                console.log('📹 ========== EJECUTANDO callFrame.join() ==========');
                console.log('📹 Parámetros del join:', {
                    url: validUrl,
                    tokenLength: token.length,
                    tokenPrefix: token.substring(0, 30) + '...',
                    callFrameExists: !!callFrame,
                    callFrameType: typeof callFrame,
                    joinMethod: typeof callFrame.join
                });
                
                // Verificar que callFrame.join existe
                if (typeof callFrame.join !== 'function') {
                    console.error('❌ callFrame.join no es una función!', callFrame);
                    throw new Error('callFrame.join no es una función');
                }
                
                try {
                    // Pasar userName explícitamente para asegurar que Daily.co lo use
                    const fumigatorId = getId(fumigatorState.currentFumigatorData, 'fumigatorId');
                    const userName = `technician-${fumigatorId}`;
                    console.log('📹 Uniéndose a la videollamada con:', { url: validUrl, userName, tokenLength: token.length });
                    joinPromise = callFrame.join({ url: validUrl, token, userName });
                    console.log('✅ callFrame.join() llamado exitosamente con userName:', userName);
                    console.log('✅ Promesa devuelta:', {
                        isPromise: joinPromise instanceof Promise,
                        hasThen: typeof joinPromise?.then === 'function',
                        hasCatch: typeof joinPromise?.catch === 'function',
                        promiseType: typeof joinPromise
                    });
                    
                    // Verificar que la promesa sea válida
                    if (!joinPromise || typeof joinPromise.then !== 'function') {
                        console.error('❌ callFrame.join() no devolvió una promesa válida:', joinPromise);
                        throw new Error('callFrame.join() no devolvió una promesa válida');
                    }
                    
                    // Agregar handlers a la promesa para diagnóstico
                    joinPromise.then(
                        (result) => console.log('✅ join() promesa resuelta exitosamente:', result),
                        (error) => console.error('❌ join() promesa rechazada:', error)
                    );
                } catch (joinError) {
                    console.error('❌ Error al llamar callFrame.join():', joinError);
                    console.error('❌ Stack:', joinError.stack);
                    throw joinError;
                }
                
                // Verificar inmediatamente si el join se inició (después de un breve delay)
                setTimeout(() => {
                    console.log('🔍 Verificando estado después de 500ms...');
                    console.log('🔍 joiningStarted:', joiningStarted);
                    console.log('🔍 joinedResolved:', joinedResolved);
                    console.log('🔍 joinError:', joinError);
                    
                    if (!joiningStarted) {
                        console.warn('⚠️ El join no se inició después de 500ms');
                        
                        // Verificar el estado del iframe
                        let currentIframe = null;
                        try {
                            currentIframe = callFrame.iframe();
                        } catch (e) {
                            currentIframe = videoContainer.querySelector('iframe');
                        }
                        
                        if (currentIframe) {
                            console.log('📦 Estado del iframe después del join:', {
                                src: currentIframe.src || 'no src',
                                hasSrc: !!currentIframe.src && currentIframe.src !== 'about:blank',
                                allow: currentIframe.getAttribute('allow'),
                                readyState: currentIframe.readyState,
                                contentWindow: !!currentIframe.contentWindow,
                                display: window.getComputedStyle(currentIframe).display,
                                visibility: window.getComputedStyle(currentIframe).visibility,
                                isConnected: currentIframe.isConnected,
                                offsetParent: currentIframe.offsetParent !== null
                            });
                            
                            // Si el iframe no tiene src, intentar establecerlo manualmente
                            if (!currentIframe.src || currentIframe.src === 'about:blank') {
                                console.warn('⚠️ El iframe no tiene src - intentando establecerlo manualmente');
                                // NO establecer src manualmente - Daily.co lo maneja internamente
                                // Pero podemos verificar si el contenedor está visible
                                const containerVisible = window.getComputedStyle(videoContainer).display !== 'none' &&
                                                       window.getComputedStyle(videoContainer).visibility !== 'hidden';
                                console.log('📦 Contenedor visible:', containerVisible);
                            }
                        }
                        
                        // Verificar el estado del callFrame
                        try {
                            const state = callFrame.meetingState();
                            console.log('📊 Estado del callFrame después del join:', state);
                        } catch (e) {
                            console.warn('⚠️ No se pudo obtener el estado del callFrame:', e);
                        }
                    }
                }, 500);
            } catch (immediateError) {
                console.error('❌ callFrame.join() lanzó un error inmediatamente:', immediateError);
                throw immediateError;
            }
            
            // Timeout con mejor diagnóstico y sugerencias
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    if (!joinedResolved) {
                        let statusMsg = '';
                        if (!joiningStarted) {
                            statusMsg = 'El join no se inició. Posibles causas:\n';
                            statusMsg += '1. Permisos de cámara/micrófono bloqueados\n';
                            statusMsg += '2. Contexto no seguro (usa localhost en lugar de 127.0.0.1)\n';
                            statusMsg += '3. Token inválido o expirado\n';
                            statusMsg += '4. El iframe no puede acceder a los dispositivos';
                        } else {
                            statusMsg = 'El join se inició pero no se completó. Verifica:\n';
                            statusMsg += '1. Tu conexión a Internet\n';
                            statusMsg += '2. Que los permisos estén activos\n';
                            statusMsg += '3. Que no haya otras aplicaciones usando la cámara/micrófono';
                        }
                        
                        // Agregar sugerencia sobre localhost si está usando 127.0.0.1
                        if (location.hostname === '127.0.0.1') {
                            statusMsg += '\n\n💡 SUGERENCIA: Intenta acceder usando http://localhost:5500 en lugar de http://127.0.0.1:5500';
                        }
                        
                        reject(new Error(`Timeout: ${statusMsg}`));
                    }
                }, 30000); // 30 segundos
            });
            
            // Esperar a que se complete el join o el timeout
            try {
                await Promise.race([
                    joinPromise.then(() => {
                        console.log('✅ join() promesa resuelta');
                        // Esperar un momento para que el evento también se dispare
                        return new Promise(resolve => setTimeout(resolve, 2000));
                    }),
                    timeoutPromise
                ]);
            } catch (raceError) {
                // Si el timeout ganó, dar una última oportunidad
                console.warn('⚠️ Timeout o error en Promise.race, verificando estado...');
                
                // Esperar un poco más y verificar si realmente falló
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Verificar si hay participantes (el join puede haber funcionado silenciosamente)
                try {
                    const participants = callFrame.participants();
                    console.log('📊 Participantes después del timeout:', participants);
                    if (participants && Object.keys(participants).length > 0) {
                        console.log('✅ Hay participantes - el join funcionó a pesar del timeout');
                        joinedResolved = true;
                    } else if (joiningStarted) {
                        console.log('🔵 El join se inició pero no hay participantes aún');
                        // Dar más tiempo
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        const participants2 = callFrame.participants();
                        if (participants2 && Object.keys(participants2).length > 0) {
                            console.log('✅ Participantes aparecieron después de esperar más');
                            joinedResolved = true;
                        }
                    }
                } catch (e) {
                    console.warn('⚠️ No se pudo verificar participantes:', e);
                }
                
                if (!joinedResolved) {
                    throw raceError;
                }
            }
            
            // Verificar si realmente se unió
            if (joinedResolved) {
                console.log('✅ join() completado exitosamente (confirmado por evento)');
            } else if (joinError) {
                throw joinError;
            } else {
                console.warn('⚠️ join() se resolvió pero no se recibió el evento joined-meeting');
                // Intentar verificar el estado del callFrame una vez más
                try {
                    const participants = callFrame.participants();
                    console.log('📊 Participantes actuales:', participants);
                    if (participants && Object.keys(participants).length > 0) {
                        console.log('✅ Hay participantes - el join puede haber funcionado');
                        joinedResolved = true;
                    }
                } catch (e) {
                    console.warn('⚠️ No se pudo verificar participantes:', e);
                }
            }
            
            // Verificar el estado del iframe después del join
            setTimeout(() => {
                const iframeAfterJoin = videoContainer.querySelector('iframe');
                if (iframeAfterJoin) {
                    console.log('✅ Iframe después del join:', {
                        src: iframeAfterJoin.src,
                        hasSrc: !!iframeAfterJoin.src,
                        allow: iframeAfterJoin.getAttribute('allow'),
                        style: {
                            display: iframeAfterJoin.style.display,
                            visibility: iframeAfterJoin.style.visibility,
                            opacity: iframeAfterJoin.style.opacity,
                            width: iframeAfterJoin.style.width,
                            height: iframeAfterJoin.style.height
                        },
                        computedStyle: {
                            display: window.getComputedStyle(iframeAfterJoin).display,
                            visibility: window.getComputedStyle(iframeAfterJoin).visibility,
                            opacity: window.getComputedStyle(iframeAfterJoin).opacity,
                            width: window.getComputedStyle(iframeAfterJoin).width,
                            height: window.getComputedStyle(iframeAfterJoin).height,
                            position: window.getComputedStyle(iframeAfterJoin).position
                        }
                    });
                    
                    // Asegurar que el iframe sea visible y tenga dimensiones
                    iframeAfterJoin.style.display = 'block';
                    iframeAfterJoin.style.visibility = 'visible';
                    iframeAfterJoin.style.opacity = '1';
                    iframeAfterJoin.style.width = '100%';
                    iframeAfterJoin.style.height = '100%';
                    iframeAfterJoin.style.position = 'absolute';
                    iframeAfterJoin.style.top = '0';
                    iframeAfterJoin.style.left = '0';
                    iframeAfterJoin.style.zIndex = '1';
                    
                    console.log('✅ Iframe forzado a ser visible con dimensiones completas');
                    
                    // Ocultar el loading definitivamente
                    const loading = videoContainer.querySelector('#video-loading');
                    if (loading) {
                        loading.style.display = 'none';
                    }
                } else {
                    console.warn('⚠️ Iframe no encontrado después del join');
                    console.log('📦 Contenedor completo:', {
                        innerHTML: videoContainer.innerHTML.substring(0, 500),
                        children: Array.from(videoContainer.children).map(c => ({
                            tagName: c.tagName,
                            id: c.id,
                            className: c.className
                        }))
                    });
                }
                
                // Verificar participantes
                try {
                    const participants = callFrame.participants();
                    console.log('📊 Participantes después del join:', participants);
                } catch (e) {
                    console.warn('⚠️ No se pueden obtener participantes:', e);
                }
            }, 2000);
            
        } catch (err) {
            console.error('❌ join() falló:', err);
            console.error('❌ Detalles del error:', {
                message: err?.message,
                errorMsg: err?.errorMsg,
                error: err?.error,
                errorCode: err?.errorCode,
                stack: err?.stack
            });
            
            // Verificar el estado del callFrame
            try {
                const state = callFrame.participants();
                console.log('📊 Estado de participantes:', state);
            } catch (e) {
                console.warn('⚠️ No se pudo obtener el estado de participantes:', e);
            }
            
            // NO abrir automáticamente en nueva ventana - mostrar error en el modal
            const errorMsg = err?.errorMsg || err?.message || 'Error desconocido';
            showVideoError(videoContainer, `No se pudo conectar a la videollamada: ${errorMsg}. Por favor, verifica los permisos de cámara/micrófono y recarga la página.`);
            
            // Opcional: agregar botón para abrir en nueva ventana como fallback manual
            setTimeout(() => {
                const errorDiv = videoContainer.querySelector('div[style*="text-align: center"]');
                if (errorDiv && !errorDiv.querySelector('button')) {
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
            }, 100);
            
            throw err;
        }
        
    } catch (err) {
        console.error('❌ startVideoCall error', err);
        showVideoError(videoContainer, `Error al conectar: ${err?.errorMsg || err?.message || 'desconocido'}`);
    }
}

function setupVideoControls(modal, callFrame, appointmentId) {
    const toggleMic = modal.querySelector('#toggle-mic');
    const toggleCamera = modal.querySelector('#toggle-camera');
    const endCall = modal.querySelector('#end-call');
    
    let micEnabled = true;
    let cameraEnabled = true;
    
    if (toggleMic) {
        toggleMic.addEventListener('click', () => {
            micEnabled = !micEnabled;
            callFrame.setLocalAudio(micEnabled);
            toggleMic.innerHTML = micEnabled 
                ? '<i class="fas fa-microphone"></i> Micrófono'
                : '<i class="fas fa-microphone-slash"></i> Micrófono';
            toggleMic.classList.toggle('btn-danger', !micEnabled);
        });
    }
    
    if (toggleCamera) {
        toggleCamera.addEventListener('click', () => {
            cameraEnabled = !cameraEnabled;
            callFrame.setLocalVideo(cameraEnabled);
            toggleCamera.innerHTML = cameraEnabled
                ? '<i class="fas fa-video"></i> Cámara'
                : '<i class="fas fa-video-slash"></i> Cámara';
            toggleCamera.classList.toggle('btn-danger', !cameraEnabled);
        });
    }
    
    if (endCall) {
        endCall.addEventListener('click', () => {
            if (callFrame) {
                callFrame.leave();
            }
        });
    }
}

function showVideoError(videoContainer, message) {
    if (videoContainer) {
        videoContainer.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: #fff;">
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                <p>${message}</p>
            </div>
        `;
    }
}

export { fumigatorState };
