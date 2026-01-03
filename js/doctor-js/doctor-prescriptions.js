// doctor-prescriptions.js
// Módulo para gestión de prescripciones médicas

import { showNotification } from './doctor-ui.js';
import { getId, updateCounter } from './doctor-core.js';

let allPatientsList = [];

/**
 * Inicializa el modal de prescripciones
 */
export function initializePrescriptionModal() {
    const modal = document.getElementById('prescription-modal');
    const closeModal = document.querySelector('.close-modal');
    const cancelBtn = document.getElementById('cancel-prescription');
    const form = document.getElementById('prescription-form');
    
    if (closeModal) {
        closeModal.addEventListener('click', closePrescriptionModal);
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closePrescriptionModal);
    }
    
    if (form) {
        form.addEventListener('submit', handlePrescriptionSubmit);
    }
    
    // Cerrar modal al hacer clic fuera
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closePrescriptionModal();
            }
        });
    }
    
    // Inicializar autocompletado de pacientes
    initializePatientAutocomplete();
}

/**
 * Abre el modal de prescripción
 */
export function openPrescriptionModal(patientName = null, patientId = null, encounterId = null, appointmentId = null) {
    console.log('💊 openPrescriptionModal llamado', { patientName, patientId, encounterId, appointmentId });
    
    // Intentar encontrar el modal con retry si no está disponible inmediatamente
    let modal = document.getElementById('prescription-modal');
    
    if (!modal) {
        console.warn('⚠️ Modal no encontrado inmediatamente, verificando DOM...');
        console.log('🔍 Estado del documento:', {
            readyState: document.readyState,
            bodyExists: !!document.body,
            allModals: document.querySelectorAll('[id*="modal"]').length
        });
        
        // Intentar múltiples veces con delays progresivos
        let attempts = 0;
        const maxAttempts = 5;
        const checkModal = () => {
            attempts++;
            modal = document.getElementById('prescription-modal');
            
            if (modal) {
                console.log(`✅ Modal encontrado en intento ${attempts}`);
                showPrescriptionModal(modal, patientName, patientId, encounterId, appointmentId);
            } else if (attempts < maxAttempts) {
                console.log(`🔄 Reintentando encontrar modal (intento ${attempts}/${maxAttempts})...`);
                setTimeout(checkModal, 100 * attempts); // Delay progresivo: 100ms, 200ms, 300ms, 400ms, 500ms
            } else {
                console.error('❌ Modal de receta no encontrado después de', maxAttempts, 'intentos');
                console.error('🔍 Verificando si el modal existe en el HTML...');
                const allElements = document.querySelectorAll('*');
                const modalElements = Array.from(allElements).filter(el => el.id && el.id.includes('prescription'));
                console.log('📋 Elementos con "prescription" en el ID:', modalElements.map(el => el.id));
                
                showNotification('Error: No se pudo abrir el modal de receta. Por favor, recarga la página.', 'error');
            }
        };
        
        setTimeout(checkModal, 50);
        return;
    }
    
    showPrescriptionModal(modal, patientName, patientId, encounterId, appointmentId);
}

/**
 * Muestra el modal de prescripción (función auxiliar)
 */
function showPrescriptionModal(modal, patientName, patientId, encounterId, appointmentId) {
    if (!modal) {
        console.error('Modal de receta no encontrado en el DOM');
        showNotification('Error: No se pudo abrir el modal de receta', 'error');
        return;
    }
    
    // Mostrar el modal
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modal.style.zIndex = '10000';
    
    const form = document.getElementById('prescription-form');
    if (!form) {
        console.error('Formulario de receta no encontrado');
        return;
    }
    
    // Limpiar formulario
    form.reset();
    
    // Ocultar sugerencias
    const suggestionsContainer = document.getElementById('patient-suggestions');
    if (suggestionsContainer) {
        suggestionsContainer.style.display = 'none';
    }
    
    // Prellenar el nombre del paciente si se proporciona
    if (patientName) {
        const patientNameInput = document.getElementById('prescription-patient-name');
        if (patientNameInput) {
            patientNameInput.value = patientName;
            console.log('Nombre del paciente prellenado:', patientName);
        }
    }
    
    // Guardar IDs en campos ocultos
    if (patientId) {
        updatePatientIdField(patientId);
        console.log('PatientId guardado:', patientId);
    } else {
        updatePatientIdField(null);
    }
    
    // Guardar encounterId y appointmentId
    let encounterIdField = document.getElementById('prescription-encounter-id');
    if (!encounterIdField) {
        encounterIdField = document.createElement('input');
        encounterIdField.type = 'hidden';
        encounterIdField.id = 'prescription-encounter-id';
        encounterIdField.name = 'encounter-id';
        form.appendChild(encounterIdField);
    }
    encounterIdField.value = encounterId || '';
    
    let appointmentIdField = document.getElementById('prescription-appointment-id');
    if (!appointmentIdField) {
        appointmentIdField = document.createElement('input');
        appointmentIdField.type = 'hidden';
        appointmentIdField.id = 'prescription-appointment-id';
        appointmentIdField.name = 'appointment-id';
        form.appendChild(appointmentIdField);
    }
    appointmentIdField.value = appointmentId || '';
    
    console.log('✅ Modal de receta abierto correctamente', { encounterId, appointmentId });
}

/**
 * Cierra el modal de prescripción
 */
export function closePrescriptionModal() {
    const modal = document.getElementById('prescription-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

/**
 * Maneja el envío del formulario de prescripción
 */
async function handlePrescriptionSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const patientId = formData.get('patient-id');
    const encounterId = formData.get('encounter-id');
    const appointmentId = formData.get('appointment-id');
    
    const prescription = {
        patient: formData.get('patient-name'),
        patientId: patientId ? parseInt(patientId) : null,
        encounterId: encounterId ? parseInt(encounterId) : null,  // ✅ YA viene parseado
        appointmentId: appointmentId ? parseInt(appointmentId) : null,
        diagnosis: formData.get('diagnosis'),
        medication: formData.get('medication'),
        dosage: formData.get('dosage'),
        frequency: formData.get('frequency'),
        duration: formData.get('duration'),
        additionalInstructions: formData.get('additional-instructions')
    };
    
    // Validar campos requeridos
    if (!prescription.patient || !prescription.diagnosis || !prescription.medication || 
        !prescription.dosage || !prescription.frequency || !prescription.duration) {
        showNotification('Por favor, complete todos los campos requeridos', 'error');
        return;
    }
    
    const { state } = await import('../state.js');
    const currentDoctorData = state.doctorData;
    
    if (!currentDoctorData?.doctorId) {
        showNotification('No se pudo identificar al médico', 'error');
        return;
    }
    
    if (!prescription.patientId) {
        showNotification('No se pudo identificar al paciente', 'error');
        return;
    }
    
    try {
        const { ApiClinical } = await import('../api.js');
        
        // ✅ CAMBIO PRINCIPAL: Solo buscar encounter si NO tenemos uno
        let finalEncounterId = prescription.encounterId;
        
        if (!finalEncounterId && prescription.appointmentId) {
            console.log('🔍 No hay encounterId, buscando por appointmentId:', prescription.appointmentId);
            try {
                const encounters = await ApiClinical.get(`v1/Encounter?appointmentId=${prescription.appointmentId}`);
                if (encounters && Array.isArray(encounters) && encounters.length > 0) {
                    finalEncounterId = encounters[0].encounterId || encounters[0].EncounterId;
                    console.log('✅ Encounter encontrado:', finalEncounterId);
                } else {
                    console.warn('⚠️ No se encontró encounter para appointmentId:', prescription.appointmentId);
                }
            } catch (err) {
                console.warn('⚠️ Error al buscar encounter:', err);
            }
        } else if (finalEncounterId) {
            console.log('✅ EncounterId ya proporcionado:', finalEncounterId);
        }
        
        // ✅ CAMBIO CRÍTICO: Solo incluir encounterId si realmente tenemos uno válido
        const prescriptionData = {
            patientId: prescription.patientId,
            doctorId: currentDoctorData.doctorId,
            diagnosis: prescription.diagnosis,
            medication: prescription.medication,
            dosage: prescription.dosage,
            frequency: prescription.frequency,
            duration: prescription.duration,
            additionalInstructions: prescription.additionalInstructions || ""
        };
        
        // Solo agregar encounterId si existe y es válido
        if (finalEncounterId && finalEncounterId > 0) {
            prescriptionData.encounterId = finalEncounterId;
            console.log('✅ Incluyendo encounterId en payload:', finalEncounterId);
        } else {
            console.log('ℹ️ No se incluyó encounterId en el payload (no disponible)');
        }
        
        console.log('📋 Creando receta con datos:', prescriptionData);
        
        const response = await ApiClinical.post('v1/Prescription', prescriptionData);
        
        console.log('✅ Receta creada exitosamente:', response);
        showNotification(`Receta generada exitosamente para ${prescription.patient}`, 'success');
        
        // Actualizar contador
        updateCounter('prescriptions-today', 1);
        
        // Cerrar modal
        closePrescriptionModal();
        
    } catch (error) {
        console.error('❌ Error al guardar la receta:', error);
        console.error('   Status:', error.status);
        console.error('   Message:', error.message);
        
        let errorMessage = 'Error al guardar la receta';
        
        if (error.details) {
            console.error('   Details:', error.details);
            const detailsArray = Object.entries(error.details).map(([field, errors]) => {
                const errorList = Array.isArray(errors) ? errors.join(', ') : errors;
                return `${field}: ${errorList}`;
            });
            errorMessage += ':\n' + detailsArray.join('\n');
        } else if (error.message) {
            errorMessage += `: ${error.message}`;
        }
        
        showNotification(errorMessage, 'error');
    }
}

/**
 * Inicializa el autocompletado de pacientes
 */
function initializePatientAutocomplete() {
    const patientInput = document.getElementById('prescription-patient-name');
    const suggestionsContainer = document.getElementById('patient-suggestions');
    
    if (!patientInput || !suggestionsContainer) return;
    
    let searchTimeout = null;
    
    // Event listener para cuando el usuario escribe
    patientInput.addEventListener('input', async function(e) {
        const searchTerm = this.value.trim();
        
        // Limpiar timeout anterior
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        
        // Si el campo está vacío, ocultar sugerencias
        if (searchTerm.length < 2) {
            suggestionsContainer.style.display = 'none';
            updatePatientIdField(null);
            return;
        }
        
        // Esperar 300ms antes de buscar (debounce)
        searchTimeout = setTimeout(async () => {
            try {
                const patients = await searchPatients(searchTerm);
                displayPatientSuggestions(patients, suggestionsContainer, patientInput);
            } catch (error) {
                console.error('Error al buscar pacientes:', error);
                suggestionsContainer.style.display = 'none';
            }
        }, 300);
    });
    
    // Ocultar sugerencias al hacer clic fuera
    document.addEventListener('click', function(e) {
        if (!patientInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
            suggestionsContainer.style.display = 'none';
        }
    });
    
    // Manejar navegación con teclado
    patientInput.addEventListener('keydown', function(e) {
        const suggestions = suggestionsContainer.querySelectorAll('.patient-suggestion-item');
        const activeSuggestion = suggestionsContainer.querySelector('.patient-suggestion-item.active');
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (activeSuggestion) {
                activeSuggestion.classList.remove('active');
                const next = activeSuggestion.nextElementSibling;
                if (next) {
                    next.classList.add('active');
                    next.scrollIntoView({ block: 'nearest' });
                } else if (suggestions.length > 0) {
                    suggestions[0].classList.add('active');
                }
            } else if (suggestions.length > 0) {
                suggestions[0].classList.add('active');
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (activeSuggestion) {
                activeSuggestion.classList.remove('active');
                const prev = activeSuggestion.previousElementSibling;
                if (prev) {
                    prev.classList.add('active');
                    prev.scrollIntoView({ block: 'nearest' });
                } else if (suggestions.length > 0) {
                    suggestions[suggestions.length - 1].classList.add('active');
                }
            }
        } else if (e.key === 'Enter' && activeSuggestion) {
            e.preventDefault();
            activeSuggestion.click();
        } else if (e.key === 'Escape') {
            suggestionsContainer.style.display = 'none';
        }
    });
}

/**
 * Busca pacientes en la API
 */
async function searchPatients(searchTerm) {
    try {
        const { Api } = await import('../api.js');
        
        // Obtener todos los pacientes
        const patients = await Api.get('v1/Patient/all');
        
        if (!Array.isArray(patients)) {
            return [];
        }
        
        // Filtrar pacientes que coincidan con el término de búsqueda
        const searchLower = searchTerm.toLowerCase();
        const filtered = patients.filter(patient => {
            const firstName = (patient.name || patient.Name || '').toLowerCase();
            const lastName = (patient.lastName || patient.LastName || '').toLowerCase();
            const dni = (patient.dni || patient.Dni || '').toString();
            const fullName = `${firstName} ${lastName}`.trim();
            
            return fullName.includes(searchLower) || 
                   firstName.includes(searchLower) || 
                   lastName.includes(searchLower) ||
                   dni.includes(searchTerm);
        });
        
        // Limitar a 10 resultados
        return filtered.slice(0, 10);
    } catch (error) {
        console.error('Error al buscar pacientes:', error);
        showNotification('Error al buscar pacientes. Intenta nuevamente.', 'error');
        return [];
    }
}

/**
 * Muestra las sugerencias de pacientes
 */
function displayPatientSuggestions(patients, container, input) {
    container.innerHTML = '';
    
    if (patients.length === 0) {
        container.innerHTML = '<div style="padding: 1rem; text-align: center; color: #6b7280;">No se encontraron pacientes</div>';
        container.style.display = 'block';
        return;
    }
    
    patients.forEach(patient => {
        const patientId = patient.patientId || patient.PatientId;
        const firstName = patient.name || patient.Name || '';
        const lastName = patient.lastName || patient.LastName || '';
        const dni = patient.dni || patient.Dni || 'N/A';
        const fullName = `${firstName} ${lastName}`.trim() || 'Paciente sin nombre';
        
        const suggestionItem = document.createElement('div');
        suggestionItem.className = 'patient-suggestion-item';
        suggestionItem.style.cssText = 'padding: 0.75rem 1rem; cursor: pointer; border-bottom: 1px solid #f3f4f6; transition: background-color 0.2s;';
        suggestionItem.innerHTML = `
        <div class="suggestion-name">${fullName}</div>
        <div class="suggestion-dni">DNI: ${dni}</div>
    `;

        
        // Estilos hover
        suggestionItem.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#f3f4f6';
            container.querySelectorAll('.patient-suggestion-item').forEach(item => {
                if (item !== this) item.classList.remove('active');
            });
            this.classList.add('active');
        });
        
        suggestionItem.addEventListener('mouseleave', function() {
            this.style.backgroundColor = '';
        });
        
        // Seleccionar paciente al hacer clic
        suggestionItem.addEventListener('click', function() {
            input.value = fullName;
            updatePatientIdField(patientId);
            container.style.display = 'none';
        });
        
        container.appendChild(suggestionItem);
    });
    
    container.style.display = 'block';
}

/**
 * Actualiza el campo oculto con el ID del paciente
 */
function updatePatientIdField(patientId) {
    const form = document.getElementById('prescription-form');
    if (!form) return;
    
    let hiddenInput = document.getElementById('prescription-patient-id');
    if (!hiddenInput) {
        hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.id = 'prescription-patient-id';
        hiddenInput.name = 'patient-id';
        form.appendChild(hiddenInput);
    }
    
    hiddenInput.value = patientId || '';
}

/**
 * Carga la vista de prescripciones
 */
export async function loadPrescriptionsView() {
    const dashboardContent = document.querySelector('.dashboard-content');
    if (!dashboardContent) return;

    // Ocultar dashboard principal
    const mainDashboard = document.getElementById('mainDashboardSection');
    if (mainDashboard) {
        mainDashboard.style.display = 'none';
    }

    // Eliminar secciones anteriores
    const existingPrescriptions = dashboardContent.querySelectorAll('.prescriptions-section');
    existingPrescriptions.forEach(section => section.remove());

    const { state } = await import('../state.js');
    const currentDoctorData = state.doctorData;

    // Verificar que tenemos el doctorId
    let doctorId = getId(currentDoctorData, 'doctorId');
    if (!doctorId) {
        console.warn('No hay doctorId disponible para cargar recetas');
        const prescriptionsSection = document.createElement('div');
        prescriptionsSection.className = 'dashboard-section prescriptions-section';
        prescriptionsSection.innerHTML = `
        <div class="section-header">
            <div>
                <h3>Recetas Médicas</h3>
                <p>Recetas emitidas por ti</p>
            </div>
        </div>

        <div class="doctor-id-error">
            <i class="fas fa-exclamation-circle doctor-id-error-icon"></i>
            <p>No se pudo obtener el ID del doctor. Por favor, recarga la página.</p>
        </div>
    `;

        dashboardContent.appendChild(prescriptionsSection);
        return;
    }

    // Crear sección de recetas
    const prescriptionsSection = document.createElement('div');
    prescriptionsSection.className = 'dashboard-section prescriptions-section';
    prescriptionsSection.innerHTML = `
        <div class="section-header">
            <div>
                <h3>Recetas Médicas</h3>
                <p>Recetas emitidas por ti</p>
            </div>
        </div>

        <div id="prescriptions-list" class="prescriptions-list">
            <div class="loading-prescriptions">
                <i class="fas fa-spinner fa-spin loading-icon"></i>
                <p>Cargando recetas...</p>
            </div>
        </div>
    `;

    dashboardContent.appendChild(prescriptionsSection);

    // Cargar recetas
    await loadDoctorPrescriptions(doctorId);
}

/**
 * Carga las prescripciones del doctor
 */
async function loadDoctorPrescriptions(doctorId) {
    const prescriptionsList = document.getElementById('prescriptions-list');
    if (!prescriptionsList) return;

    try {
        const { ApiClinical, Api } = await import('../api.js');
        
        // Obtener recetas del doctor
        const prescriptions = await ApiClinical.get(`v1/Prescription/doctor/${doctorId}`);
        
        if (!prescriptions || prescriptions.length === 0) {
            prescriptionsList.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: #6b7280;">
                    <i class="fas fa-file-medical" style="font-size: 3rem; margin-bottom: 1rem; color: #d1d5db;"></i>
                    <h4 style="margin-bottom: 0.5rem; color: #111827;">No hay recetas registradas</h4>
                    <p>Cuando emitas recetas médicas, aparecerán aquí.</p>
                </div>
            `;
            return;
        }

        // Obtener información de pacientes para cada receta
        const prescriptionsWithPatients = await Promise.all(
            prescriptions.map(async (prescription) => {
                let patientName = 'Paciente desconocido';
                let patientDni = '';
                
                try {
                    const patientId = prescription.patientId || prescription.PatientId;
                    if (patientId) {
                        const patient = await Api.get(`v1/Patient/${patientId}`);
                        const name = patient.name || patient.Name || '';
                        const lastName = patient.lastName || patient.LastName || '';
                        patientName = `${name} ${lastName}`.trim() || 'Paciente sin nombre';
                        patientDni = patient.dni || patient.Dni || '';
                    }
                } catch (err) {
                    console.warn('Error al cargar información del paciente:', err);
                }

                return {
                    ...prescription,
                    patientName,
                    patientDni
                };
            })
        );

        // Renderizar recetas
        renderPrescriptionsList(prescriptionsWithPatients);
    } catch (error) {
        console.error('Error al cargar recetas:', error);
        prescriptionsList.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: #ef4444;">
                <i class="fas fa-exclamation-circle" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                <p>Error al cargar las recetas. Por favor, intenta nuevamente.</p>
            </div>
        `;
    }
}

/**
 * Renderiza la lista de prescripciones
 */
function renderPrescriptionsList(prescriptions) {
    const prescriptionsList = document.getElementById('prescriptions-list');
    if (!prescriptionsList) return;

    prescriptionsList.innerHTML = prescriptions.map(p => {

        const prescriptionId = p.prescriptionId || p.PrescriptionId;
        const patientName = p.patientName || 'Paciente desconocido';
        const patientDni = p.patientDni || '';
        const diagnosis = p.diagnosis || p.Diagnosis || 'Sin diagnóstico';
        const medication = p.medication || p.Medication || 'Sin medicamento';
        const dosage = p.dosage || p.Dosage || '–';
        const frequency = p.frequency || p.Frequency || '–';
        const duration = p.duration || p.Duration || '–';
        const extra = p.additionalInstructions || p.AdditionalInstructions || '';

        let prescriptionDate = "Fecha no disponible";
        try {
            const date = new Date(p.prescriptionDate || p.PrescriptionDate);
            prescriptionDate = date.toLocaleDateString("es-AR", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric"
            });
        } catch {}

        return `
    <div class="prescription-item">

        <!-- HEADER estilo consultation-header -->
        <div class="prescription-header">
            <div class="prescription-icon-wrapper">
                <div class="prescription-icon">
                    <i class="fas fa-prescription-bottle-alt"></i>
                </div>
            </div>

            <div class="prescription-info">
                <h4 class="prescription-patient">${patientName}</h4>

                <div class="prescription-meta">
                    <span class="prescription-date">
                        <i class="fas fa-calendar-alt"></i> ${prescriptionDate}
                    </span>

                    ${patientDni ? `
                    <span class="prescription-dni">
                        <i class="fas fa-id-card"></i> DNI: ${patientDni}
                    </span>` : ''}
                </div>
            </div>
        </div>

        <!-- CUERPO estilo consultation-body -->
        <div class="prescription-body">
            <div class="prescription-grid">
                <div class="prescription-field"><strong>Diagnóstico:</strong> ${diagnosis}</div>
                <div class="prescription-field"><strong>Medicamento:</strong> ${medication}</div>
                <div class="prescription-field"><strong>Dosis:</strong> ${dosage}</div>
                <div class="prescription-field"><strong>Frecuencia:</strong> ${frequency}</div>
                <div class="prescription-field"><strong>Duración:</strong> ${duration}</div>
            </div>

            ${extra ? `
            <div class="prescription-extra">
                <strong>Instrucciones adicionales:</strong>
                <p>${extra}</p>
            </div>` : ''}
        </div>

    </div>
        `;
    }).join('');
}





// Exportar todas las funciones necesarias
export { allPatientsList };