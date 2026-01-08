// fumigator-clinical.js - Gestión de historia clínica y clientes

import { showNotification } from './fumigator-ui.js';

let allClientsList = [];

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

    dashboardContent.querySelectorAll('.clinical-history-section, .client-profile-section').forEach(el => el.remove());

    const historySection = document.createElement('div');
    historySection.className = 'dashboard-section clinical-history-section';
    historySection.innerHTML = `
    <div class="section-header">
        <div>
            <h3>Historia Clínica</h3>
            <p>Busca y accede al historial médico de tus clientes</p>
        </div>
    </div>

    <div class="client-search-container">
        
        <div class="search-wrapper">
            <i class="fas fa-search search-icon"></i>
            <input type="text" id="client-search-input" 
                   class="client-search-input"
                   placeholder="Buscar cliente por nombre, apellido o DNI...">
        </div>

        <div id="clients-list" class="clients-grid">
            ${createHTML.loading('Cargando clientes...')}
        </div>

    </div>
`;

    dashboardContent.appendChild(historySection);

    await loadAllClients();
    document.getElementById('client-search-input')?.addEventListener('input', (e) => {
        filterClients(e.target.value.toLowerCase().trim());
    });
}

async function loadAllClients() {
    const clientsList = document.getElementById('clients-list');
    if (!clientsList) return;

    try {
        const { state } = await import('../state.js');
        const { ApiScheduling, Api } = await import('../api.js');
        const fumigatorId = state.fumigatorData?.fumigatorId || state.fumigatorData?.FumigatorId;

        if (!fumigatorId) {
            clientsList.innerHTML = createHTML.error('No se pudo identificar al médico');
            return;
        }

        let clientsData = await ApiScheduling.get(`Appointments/fumigator/${fumigatorId}/clients`);
        clientsData = Array.isArray(clientsData) ? clientsData : [clientsData];

        if (!clientsData?.length) {
            clientsList.innerHTML = createHTML.empty('fa-user-slash', 'No has atendido clientes aún');
            allClientsList = [];
            return;
        }

        const enrichedClients = await Promise.all(clientsData.map(async (p) => {
            const clientId = p.clientId || p.ClientId;
            if (!clientId) return p;

            try {
                const fullClient = await Api.get(`v1/Client/${clientId}`);
                return {
                    clientId, ClientId: clientId,
                    name: fullClient.name || fullClient.Name || p.name || p.Name || '',
                    Name: fullClient.name || fullClient.Name || p.name || p.Name || '',
                    lastName: fullClient.lastName || fullClient.LastName || p.lastName || p.LastName || '',
                    LastName: fullClient.lastName || fullClient.LastName || p.lastName || p.LastName || '',
                    dni: fullClient.dni || fullClient.Dni || p.dni || p.Dni || '',
                    Dni: fullClient.dni || fullClient.Dni || p.dni || p.Dni || '',
                    ...fullClient
                };
            } catch { return p; }
        }));

        enrichedClients.sort((a, b) => {
            const nameA = `${a.name || a.Name || ''} ${a.lastName || a.LastName || ''}`.trim().toLowerCase();
            const nameB = `${b.name || b.Name || ''} ${b.lastName || b.LastName || ''}`.trim().toLowerCase();
            return nameA.localeCompare(nameB);
        });

        allClientsList = enrichedClients;
        renderClientsList(allClientsList);
    } catch (error) {
        console.error('❌ Error al cargar clientes:', error);
        clientsList.innerHTML = createHTML.error('Error al cargar los clientes del médico.');
    }
}

function renderClientsList(clients) {
    const clientsList = document.getElementById('clients-list');
    if (!clientsList) return;

    if (!clients?.length) {
        clientsList.innerHTML = createHTML.empty('fa-user-slash', 'No hay clientes registrados');
        return;
    }

    // ================================
    // Filtrar clientes únicos por ID
    // ================================
    const uniqueClientsMap = new Map();
    clients.forEach(p => {
        const id = p.clientId || p.ClientId;
        if (!uniqueClientsMap.has(id)) {
            uniqueClientsMap.set(id, p);
        }
    });
    const uniqueClients = Array.from(uniqueClientsMap.values());

    // ================================
    // Render
    // ================================
    clientsList.innerHTML = uniqueClients.map(p => {
        const id = p.clientId || p.ClientId;
        const name = `${p.name || p.Name || ''} ${p.lastName || p.LastName || ''}`.trim() || 'Sin nombre';
        const dni = p.dni || p.Dni || 'N/A';
        const initial = (p.name || p.Name || 'P').charAt(0).toUpperCase();

        return `
            <div class="client-card" data-client-id="${id}">
                <div class="client-card-inner">
                    <div class="client-avatar">${initial}</div>

                    <div class="client-info">
                        <h4 class="client-name">${name}</h4>
                        <p class="client-dni"><i class="fas fa-id-card"></i> DNI: ${dni}</p>
                    </div>

                    <i class="fas fa-chevron-right client-arrow"></i>
                </div>
            </div>
        `;

    }).join('');

    clientsList.querySelectorAll('.client-card').forEach(card => {
        card.addEventListener('click', function() {
            const id = parseInt(this.dataset.clientId);
            if (id) viewClientProfile(id);
        });
    });
}


function filterClients(searchTerm) {
    if (!searchTerm) {
        renderClientsList(allClientsList);
        return;
    }

    const filtered = allClientsList.filter(p => {
        const search = [p.name || p.Name, p.lastName || p.LastName, p.dni || p.Dni].join(' ').toLowerCase();
        return search.includes(searchTerm);
    });

    renderClientsList(filtered);
}

export async function viewClientProfile(clientId) {
    const dashboardContent = document.querySelector('.dashboard-content');
    if (!dashboardContent) return;

    const historySection = dashboardContent.querySelector('.clinical-history-section');
    if (historySection) historySection.style.display = 'none';
    dashboardContent.querySelector('.client-profile-section')?.remove();

    const profileSection = document.createElement('div');
    profileSection.className = 'dashboard-section client-profile-section';
    profileSection.innerHTML = `
        <div class="section-header client-profile-header">
            <div class="profile-header-left">
                <button id="back-to-clients" class="btn btn-secondary profile-back-btn">
                    <i class="fas fa-arrow-left"></i> Volver
                </button>

                <div>
                    <h3 id="client-profile-name">Cargando...</h3>
                    <p>Perfil e historial médico del cliente</p>
                </div>
            </div>
        </div>

        <div id="client-profile-content" class="client-profile-grid">
            ${createHTML.card('Información del Cliente', '<p class="text-muted">Cargando información...</p>', 'client-info-details')}
            ${createHTML.card('Historial Médico', '<p class="text-muted">Cargando historial...</p>', 'client-history-list')}
        </div>
    `;

    dashboardContent.appendChild(profileSection);

    document.getElementById('back-to-clients')?.addEventListener('click', () => {
        profileSection.remove();
        if (historySection) historySection.style.display = '';
    });

    await Promise.all([loadClientProfileData(clientId), loadClientHistory(clientId)]);
}

async function loadClientProfileData(clientId) {
    try {
        const { Api } = await import('../api.js');
        const p = await Api.get(`v1/Client/${clientId}`);
        if (!p) throw new Error('Cliente no encontrado');

        const name = `${p.name || p.Name || ''} ${p.lastName || p.LastName || ''}`.trim() || 'Sin nombre';
        const age = calculateAge(p.dateOfBirth || p.DateOfBirth);

        document.getElementById('client-profile-name').textContent = name;
        document.getElementById('client-info-details').innerHTML = [
            ['DNI', p.dni || p.Dni || 'N/A'],
            ['Edad', `${age} años`],
            ['Dirección', p.adress || p.Adress || 'No especificada'],
            ['Teléfono', p.phone || p.Phone || 'No especificado'],
            ['Obra Social', p.healthPlan || p.HealthPlan || 'No especificado'],
            ['Nº Afiliado', p.membershipNumber || p.MembershipNumber || 'N/A']
        ].map(([label, value]) => `<div style="margin-bottom: 1rem;"><strong style="color: #6b7280; display: block; margin-bottom: 0.25rem;">${label}:</strong><span style="color: #111827;">${value}</span></div>`).join('');
    } catch (error) {
        document.getElementById('client-info-details').innerHTML = '<p style="color: #ef4444;">Error al cargar información</p>';
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

async function loadClientHistory(clientId) {
    const historyList = document.getElementById('client-history-list');
    if (!historyList) return;

    try {
        const { ApiClinical, Api } = await import('../api.js');
        const now = new Date();
        const threeYears = new Date(now.getFullYear() - 3, 0, 1);
        const encounters = await ApiClinical.get(`v1/Encounter?clientId=${clientId}&from=${threeYears.toISOString()}&to=${now.toISOString()}`);
        const list = Array.isArray(encounters) ? encounters : (encounters?.value || []);

        if (!list?.length) {
            historyList.innerHTML = createHTML.empty('fa-file-medical', 'No hay historial médico registrado');
            return;
        }

        const fumigatorsMap = await loadFumigatorsMap(list, Api);

        historyList.innerHTML = list.map(enc => {
            const id = enc.encounterId || enc.EncounterId;
            const date = new Date(enc.date || enc.Date);
            const fumigatorName = fumigatorsMap.get(enc.fumigatorId || enc.FumigatorId) || 'Dr. Sin nombre';
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

                            <div class="encounter-fumigator-row">
                                <i class="fas fa-user-md"></i>
                                <span>${fumigatorName}</span>
                            </div>
                        </div>

                        <span class="encounter-status-badge" style="background:${config.bg}; color:${config.color};">
                            ${config.label}
                        </span>
                    </div>

                    ${createHTML.infoBlock('Motivo de consulta', enc.reasons || enc.Reasons || 'Sin motivo especificado')}
                    ${createHTML.infoBlock('Diagnóstico', enc.assessment || enc.Assessment || 'Sin diagnóstico')}

                    <button onclick="viewEncounterDetailsFromFumigator(${id})" class="btn btn-primary encounter-view-btn">
                        <i class="fas fa-eye"></i> Ver detalles completos
                    </button>
                </div>
            `;

        }).join('');
    } catch (error) {
        historyList.innerHTML = createHTML.error('Error al cargar el historial médico');
    }
}

async function loadFumigatorsMap(encounters, Api) {
    const fumigatorsMap = new Map();
    for (const enc of encounters) {
        const fumigatorId = enc.fumigatorId || enc.FumigatorId;
        if (fumigatorId && !fumigatorsMap.has(fumigatorId)) {
            try {
                const fumigator = await Api.get(`v1/Fumigator/${fumigatorId}`);
                const name = `${fumigator.firstName || fumigator.FirstName || ''} ${fumigator.lastName || fumigator.LastName || ''}`.trim();
                fumigatorsMap.set(fumigatorId, name || `Dr. ID ${fumigatorId}`);
            } catch {
                fumigatorsMap.set(fumigatorId, `Dr. ID ${fumigatorId}`);
            }
        }
    }
    return fumigatorsMap;
}

export async function viewEncounterDetails(encounterId) {
    try {
        const { ApiClinical, Api } = await import('../api.js');
        const enc = await ApiClinical.get(`v1/Encounter/${encounterId}`);
        if (!enc) {
            showNotification('No se encontraron los detalles', 'error');
            return;
        }

        const [clientName, fumigatorName] = await Promise.all([
            loadPersonName(Api, enc.clientId || enc.ClientId, 'Client', 'Cliente'),
            loadPersonName(Api, enc.fumigatorId || enc.FumigatorId, 'Fumigator', 'Dr.')
        ]);

        const date = new Date(enc.date || enc.Date);
        const modal = createModal('Detalles de la Consulta', 'Consulta médica completa', generateEncounterDetailsHTML(enc, date, clientName, fumigatorName));
        
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

function generateEncounterDetailsHTML(enc, date, clientName, fumigatorName) {
    const info = [
        ['calendar', 'Fecha', date.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })],
        ['clock', 'Hora', date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })],
        ['user', 'Cliente', clientName],
        ['user-md', 'Médico', fumigatorName],
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

window.viewEncounterDetailsFromFumigator = viewEncounterDetails;
export { allClientsList };