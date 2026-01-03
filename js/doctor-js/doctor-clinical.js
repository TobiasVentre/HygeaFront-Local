// doctor-clinical.js - Gestión de historia clínica y pacientes

import { showNotification } from './doctor-ui.js';

let allPatientsList = [];

const STATUS_CONFIG = {
    completed: { label: 'Completada', bg: '#d1fae5', color: '#065f46' },
    signed: { label: 'Firmada', bg: '#dbeafe', color: '#1e40af' },
    default: { label: 'Pendiente', bg: '#fef3c7', color: '#92400e' }
};

const createHTML = {
    loading: (text) => `
        <div class="state-message state-loading">
            <i class="fas fa-spinner fa-spin state-icon"></i>
            <p>${text}</p>
        </div>
    `,

    error: (text) => `
        <div class="state-message state-error">
            <i class="fas fa-exclamation-circle state-icon"></i>
            <p>${text}</p>
        </div>
    `,

    empty: (icon, text) => `
        <div class="state-message state-empty">
            <i class="fas ${icon} state-icon"></i>
            <p>${text}</p>
        </div>
    `,

    card: (title, content, id) => `
        <div class="info-card">
            <h4 class="info-card-title">${title}</h4>
            <div id="${id}" class="info-card-content">${content}</div>
        </div>
    `,

    infoBlock: (label, text) => `
        <div class="info-block">
            <strong class="info-block-label">${label}:</strong>
            <p class="info-block-text">${text}</p>
        </div>
    `
};


export async function loadClinicalHistoryView() {
    const dashboardContent = document.querySelector('.dashboard-content');
    if (!dashboardContent) return;

    dashboardContent.querySelectorAll('.clinical-history-section, .patient-profile-section').forEach(el => el.remove());

    const historySection = document.createElement('div');
    historySection.className = 'dashboard-section clinical-history-section';
    historySection.innerHTML = `
    <div class="section-header">
        <div>
            <h3>Historia Clínica</h3>
            <p>Busca y accede al historial médico de tus pacientes</p>
        </div>
    </div>

    <div class="patient-search-container">
        
        <div class="search-wrapper">
            <i class="fas fa-search search-icon"></i>
            <input type="text" id="patient-search-input" 
                   class="patient-search-input"
                   placeholder="Buscar paciente por nombre, apellido o DNI...">
        </div>

        <div id="patients-list" class="patients-grid">
            ${createHTML.loading('Cargando pacientes...')}
        </div>

    </div>
`;

    dashboardContent.appendChild(historySection);

    await loadAllPatients();
    document.getElementById('patient-search-input')?.addEventListener('input', (e) => {
        filterPatients(e.target.value.toLowerCase().trim());
    });
}

async function loadAllPatients() {
    const patientsList = document.getElementById('patients-list');
    if (!patientsList) return;

    try {
        const { state } = await import('../state.js');
        const { ApiScheduling, Api } = await import('../api.js');
        const doctorId = state.doctorData?.doctorId || state.doctorData?.DoctorId;

        if (!doctorId) {
            patientsList.innerHTML = createHTML.error('No se pudo identificar al médico');
            return;
        }

        let patientsData = await ApiScheduling.get(`Appointments/doctor/${doctorId}/patients`);
        patientsData = Array.isArray(patientsData) ? patientsData : [patientsData];

        if (!patientsData?.length) {
            patientsList.innerHTML = createHTML.empty('fa-user-slash', 'No has atendido pacientes aún');
            allPatientsList = [];
            return;
        }

        const enrichedPatients = await Promise.all(patientsData.map(async (p) => {
            const patientId = p.patientId || p.PatientId;
            if (!patientId) return p;

            try {
                const fullPatient = await Api.get(`v1/Patient/${patientId}`);
                return {
                    patientId, PatientId: patientId,
                    name: fullPatient.name || fullPatient.Name || p.name || p.Name || '',
                    Name: fullPatient.name || fullPatient.Name || p.name || p.Name || '',
                    lastName: fullPatient.lastName || fullPatient.LastName || p.lastName || p.LastName || '',
                    LastName: fullPatient.lastName || fullPatient.LastName || p.lastName || p.LastName || '',
                    dni: fullPatient.dni || fullPatient.Dni || p.dni || p.Dni || '',
                    Dni: fullPatient.dni || fullPatient.Dni || p.dni || p.Dni || '',
                    ...fullPatient
                };
            } catch { return p; }
        }));

        enrichedPatients.sort((a, b) => {
            const nameA = `${a.name || a.Name || ''} ${a.lastName || a.LastName || ''}`.trim().toLowerCase();
            const nameB = `${b.name || b.Name || ''} ${b.lastName || b.LastName || ''}`.trim().toLowerCase();
            return nameA.localeCompare(nameB);
        });

        allPatientsList = enrichedPatients;
        renderPatientsList(allPatientsList);
    } catch (error) {
        console.error('❌ Error al cargar pacientes:', error);
        patientsList.innerHTML = createHTML.error('Error al cargar los pacientes del médico.');
    }
}

function renderPatientsList(patients) {
    const patientsList = document.getElementById('patients-list');
    if (!patientsList) return;

    if (!patients?.length) {
        patientsList.innerHTML = createHTML.empty('fa-user-slash', 'No hay pacientes registrados');
        return;
    }

    // ================================
    // Filtrar pacientes únicos por ID
    // ================================
    const uniquePatientsMap = new Map();
    patients.forEach(p => {
        const id = p.patientId || p.PatientId;
        if (!uniquePatientsMap.has(id)) {
            uniquePatientsMap.set(id, p);
        }
    });
    const uniquePatients = Array.from(uniquePatientsMap.values());

    // ================================
    // Render
    // ================================
    patientsList.innerHTML = uniquePatients.map(p => {
        const id = p.patientId || p.PatientId;
        const name = `${p.name || p.Name || ''} ${p.lastName || p.LastName || ''}`.trim() || 'Sin nombre';
        const dni = p.dni || p.Dni || 'N/A';
        const initial = (p.name || p.Name || 'P').charAt(0).toUpperCase();

        return `
            <div class="patient-card" data-patient-id="${id}">
                <div class="patient-card-inner">
                    <div class="patient-avatar">${initial}</div>

                    <div class="patient-info">
                        <h4 class="patient-name">${name}</h4>
                        <p class="patient-dni"><i class="fas fa-id-card"></i> DNI: ${dni}</p>
                    </div>

                    <i class="fas fa-chevron-right patient-arrow"></i>
                </div>
            </div>
        `;

    }).join('');

    patientsList.querySelectorAll('.patient-card').forEach(card => {
        card.addEventListener('click', function() {
            const id = parseInt(this.dataset.patientId);
            if (id) viewPatientProfile(id);
        });
    });
}


function filterPatients(searchTerm) {
    if (!searchTerm) {
        renderPatientsList(allPatientsList);
        return;
    }

    const filtered = allPatientsList.filter(p => {
        const search = [p.name || p.Name, p.lastName || p.LastName, p.dni || p.Dni].join(' ').toLowerCase();
        return search.includes(searchTerm);
    });

    renderPatientsList(filtered);
}

export async function viewPatientProfile(patientId) {
    const dashboardContent = document.querySelector('.dashboard-content');
    if (!dashboardContent) return;

    const historySection = dashboardContent.querySelector('.clinical-history-section');
    if (historySection) historySection.style.display = 'none';
    dashboardContent.querySelector('.patient-profile-section')?.remove();

    const profileSection = document.createElement('div');
    profileSection.className = 'dashboard-section patient-profile-section';
    profileSection.innerHTML = `
        <div class="section-header patient-profile-header">
            <div class="profile-header-left">
                <button id="back-to-patients" class="btn btn-secondary profile-back-btn">
                    <i class="fas fa-arrow-left"></i> Volver
                </button>

                <div>
                    <h3 id="patient-profile-name">Cargando...</h3>
                    <p>Perfil e historial médico del paciente</p>
                </div>
            </div>
        </div>

        <div id="patient-profile-content" class="patient-profile-grid">
            ${createHTML.card('Información del Paciente', '<p class="text-muted">Cargando información...</p>', 'patient-info-details')}
            ${createHTML.card('Historial Médico', '<p class="text-muted">Cargando historial...</p>', 'patient-history-list')}
        </div>
    `;

    dashboardContent.appendChild(profileSection);

    document.getElementById('back-to-patients')?.addEventListener('click', () => {
        profileSection.remove();
        if (historySection) historySection.style.display = '';
    });

    await Promise.all([loadPatientProfileData(patientId), loadPatientHistory(patientId)]);
}

async function loadPatientProfileData(patientId) {
    try {
        const { Api } = await import('../api.js');
        const p = await Api.get(`v1/Patient/${patientId}`);
        if (!p) throw new Error('Paciente no encontrado');

        const name = `${p.name || p.Name || ''} ${p.lastName || p.LastName || ''}`.trim() || 'Sin nombre';
        const age = calculateAge(p.dateOfBirth || p.DateOfBirth);

        document.getElementById('patient-profile-name').textContent = name;
        document.getElementById('patient-info-details').innerHTML = [
            ['DNI', p.dni || p.Dni || 'N/A'],
            ['Edad', `${age} años`],
            ['Dirección', p.adress || p.Adress || 'No especificada'],
            ['Teléfono', p.phone || p.Phone || 'No especificado'],
            ['Obra Social', p.healthPlan || p.HealthPlan || 'No especificado'],
            ['Nº Afiliado', p.membershipNumber || p.MembershipNumber || 'N/A']
        ].map(([label, value]) => `<div style="margin-bottom: 1rem;"><strong style="color: #6b7280; display: block; margin-bottom: 0.25rem;">${label}:</strong><span style="color: #111827;">${value}</span></div>`).join('');
    } catch (error) {
        document.getElementById('patient-info-details').innerHTML = '<p style="color: #ef4444;">Error al cargar información</p>';
    }
}

function calculateAge(dateOfBirth) {
    if (!dateOfBirth) return 'N/A';
    try {
        const birth = new Date(dateOfBirth);
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
        return age;
    } catch { return 'N/A'; }
}

async function loadPatientHistory(patientId) {
    const historyList = document.getElementById('patient-history-list');
    if (!historyList) return;

    try {
        const { ApiClinical, Api } = await import('../api.js');
        const now = new Date();
        const threeYears = new Date(now.getFullYear() - 3, 0, 1);
        const encounters = await ApiClinical.get(`v1/Encounter?patientId=${patientId}&from=${threeYears.toISOString()}&to=${now.toISOString()}`);
        const list = Array.isArray(encounters) ? encounters : (encounters?.value || []);

        if (!list?.length) {
            historyList.innerHTML = createHTML.empty('fa-file-medical', 'No hay historial médico registrado');
            return;
        }

        const doctorsMap = await loadDoctorsMap(list, Api);

        historyList.innerHTML = list.map(enc => {
            const id = enc.encounterId || enc.EncounterId;
            const date = new Date(enc.date || enc.Date);
            const doctorName = doctorsMap.get(enc.doctorId || enc.DoctorId) || 'Dr. Sin nombre';
            const status = (enc.status || enc.Status || '').toLowerCase();
            const config = STATUS_CONFIG[status] || STATUS_CONFIG.default;

            return `
                <div class="encounter-card">
                    <div class="encounter-card-header">
                        <div class="encounter-card-header-left">
                            <div class="encounter-date-row">
                                <i class="fas fa-calendar-alt"></i>
                                <strong>${date.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
                            </div>

                            <div class="encounter-doctor-row">
                                <i class="fas fa-user-md"></i>
                                <span>${doctorName}</span>
                            </div>
                        </div>

                        <span class="encounter-status-badge" style="background:${config.bg}; color:${config.color};">
                            ${config.label}
                        </span>
                    </div>

                    ${createHTML.infoBlock('Motivo de consulta', enc.reasons || enc.Reasons || 'Sin motivo especificado')}
                    ${createHTML.infoBlock('Diagnóstico', enc.assessment || enc.Assessment || 'Sin diagnóstico')}

                    <button onclick="viewEncounterDetailsFromDoctor(${id})" class="btn btn-primary encounter-view-btn">
                        <i class="fas fa-eye"></i> Ver detalles completos
                    </button>
                </div>
            `;

        }).join('');
    } catch (error) {
        historyList.innerHTML = createHTML.error('Error al cargar el historial médico');
    }
}

async function loadDoctorsMap(encounters, Api) {
    const doctorsMap = new Map();
    for (const enc of encounters) {
        const doctorId = enc.doctorId || enc.DoctorId;
        if (doctorId && !doctorsMap.has(doctorId)) {
            try {
                const doctor = await Api.get(`v1/Doctor/${doctorId}`);
                const name = `${doctor.firstName || doctor.FirstName || ''} ${doctor.lastName || doctor.LastName || ''}`.trim();
                doctorsMap.set(doctorId, name || `Dr. ID ${doctorId}`);
            } catch {
                doctorsMap.set(doctorId, `Dr. ID ${doctorId}`);
            }
        }
    }
    return doctorsMap;
}

export async function viewEncounterDetails(encounterId) {
    try {
        const { ApiClinical, Api } = await import('../api.js');
        const enc = await ApiClinical.get(`v1/Encounter/${encounterId}`);
        if (!enc) {
            showNotification('No se encontraron los detalles', 'error');
            return;
        }

        const [patientName, doctorName] = await Promise.all([
            loadPersonName(Api, enc.patientId || enc.PatientId, 'Patient', 'Paciente'),
            loadPersonName(Api, enc.doctorId || enc.DoctorId, 'Doctor', 'Dr.')
        ]);

        const date = new Date(enc.date || enc.Date);
        const modal = createModal('Detalles de la Consulta', 'Consulta médica completa', generateEncounterDetailsHTML(enc, date, patientName, doctorName));
        
        document.body.appendChild(modal);
        modal.querySelector('.close-modal')?.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    } catch (error) {
        showNotification('Error al cargar los detalles', 'error');
    }
}

async function loadPersonName(Api, id, type, prefix) {
    if (!id) return `${prefix} desconocido`;
    try {
        const person = await Api.get(`v1/${type}/${id}`);
        const firstName = person.firstName || person.FirstName || person.name || person.Name || '';
        const lastName = person.lastName || person.LastName || '';
        return `${firstName} ${lastName}`.trim() || `${prefix} sin nombre`;
    } catch {
        return `${prefix} ID ${id}`;
    }
}

function generateEncounterDetailsHTML(enc, date, patientName, doctorName) {
    const info = [
        ['calendar', 'Fecha', date.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })],
        ['clock', 'Hora', date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })],
        ['user', 'Paciente', patientName],
        ['user-md', 'Médico', doctorName],
        ['flag', 'Estado', enc.status || enc.Status || 'Pendiente']
    ];

    const soap = [
        ['Subjetivo (S)', enc.subjective || enc.Subjective || 'No especificado'],
        ['Objetivo (O)', enc.objetive || enc.Objetive || enc.objective || enc.Objective || 'No especificado'],
        ['Evaluación (A)', enc.assessment || enc.Assessment || 'No especificado'],
        ['Plan (P)', enc.plan || enc.Plan || 'No especificado']
    ];

    return `
            <div class="encounter-info-section">
                
                <div class="encounter-info-header">
                    <i class="fas fa-info-circle"></i>
                    <h4>Información General</h4>
                </div>

                <div class="encounter-info-grid">
                    ${info.map(([icon, label, value]) => `
                        <div class="encounter-info-item">
                            <span class="info-label"><i class="fas fa-${icon}"></i> ${label}:</span>
                            <span class="info-value">${value}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="encounter-info-section mt-2">
                <div class="encounter-info-header">
                    <i class="fas fa-stethoscope"></i>
                    <h4>Motivo de Consulta</h4>
                </div>
                <p class="encounter-text">
                    ${enc.reasons || enc.Reasons || 'Sin motivo especificado'}
                </p>
            </div>

            <div class="encounter-info-section mt-2">
                <div class="encounter-info-header">
                    <i class="fas fa-file-medical"></i>
                    <h4>Notas SOAP</h4>
                </div>

                <div class="soap-list">
                    ${soap.map(([label, value]) => `
                        <div class="soap-item">
                            <strong class="soap-label">${label}:</strong>
                            <p class="soap-text">${value}</p>
                        </div>
                    `).join('')}
                </div>
            </div>

            ${enc.notes || enc.Notes ? `
                <div class="encounter-info-section mt-2">
                    <div class="encounter-info-header">
                        <i class="fas fa-sticky-note"></i>
                        <h4>Notas Adicionales</h4>
                    </div>
                    <p class="encounter-text pre">
                        ${enc.notes || enc.Notes}
                    </p>
                </div>
            ` : ''}
        `;
}

function createModal(title, subtitle, body) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
    <div class="modal-content modal-content-clean">
        <div class="modal-header">
            <div>
                <h3>${title}</h3>
                <p class="modal-subtitle">${subtitle}</p>
            </div>
            <button class="close-modal">&times;</button>
        </div>
        <div class="modal-body">
            ${body}
        </div>
    </div>
`;

    return modal;
}

window.viewEncounterDetailsFromDoctor = viewEncounterDetails;
export { allPatientsList };