// ============================================
// GESTIÓN DE PERFIL DEL PACIENTE
// ============================================

import { appState } from './patient-state.js';
import { showNotification } from './patient-notifications.js';
import { buildProfileData, toISODate } from './patient-utils.js';
import { updateWelcomeBanner } from './patient-dashboard.js';

/**
 * Carga y muestra el perfil del paciente
 */
export async function loadPatientProfile() {
    const dashboardContent = document.querySelector('.dashboard-content');
    if (!dashboardContent) return;
    
    // Eliminar secciones de perfil existentes
    const existingProfiles = dashboardContent.querySelectorAll('.profile-section');
    existingProfiles.forEach(profile => profile.remove());
    
    if (!appState.currentPatient) {
        const { loadPatientData } = await import('./patient-data.js');
        await loadPatientData();
    }

    const profileData = buildProfileData(appState.currentPatient, appState.currentUser);

    // Crear sección de perfil
    const profileSection = createProfileSection(profileData);
    dashboardContent.appendChild(profileSection);
}

/**
 * Crea la sección de perfil completa
 */
function createProfileSection(profileData) {
    const section = document.createElement('div');
    section.className = 'profile-section';
    
    const data = profileData || buildProfileData(null, appState.currentUser);
    
    section.innerHTML = `
        <div class="dashboard-section">
            <div class="section-header">
                <div>
                    <h3>Mi Perfil</h3>
                    <p>Gestiona tu información personal</p>
                </div>
                <div class="section-header-actions">
                    <button class="btn btn-secondary" id="editProfileBtn">
                        <i class="fas fa-edit"></i>
                        Editar Perfil
                    </button>
                </div>
            </div>
            
            <div class="profile-content" id="profileContent">
                ${createProfileViewHTML(data)}
            </div>
        </div>
    `;
    
    section.setAttribute('data-patient', JSON.stringify(data));
    
    setTimeout(() => {
        const editBtn = section.querySelector('#editProfileBtn');
        if (editBtn) {
            editBtn.addEventListener('click', function() {
                const savedData = JSON.parse(section.getAttribute('data-patient') || '{}');
                toggleProfileEdit(savedData);
            });
        }
    }, 100);
    
    return section;
}

/**
 * Crea HTML de vista del perfil
 */
export function createProfileViewHTML(patient) {
    return `
        <div class="profile-container-modern">
            <div class="profile-content-card">
                <div class="profile-section">
                    <div class="section-header">
                        <div class="section-icon-wrapper" style="background: #3b82f6;">
                            <i class="fas fa-user"></i>
                        </div>
                        <h3 class="section-title">Información Personal</h3>
                    </div>
                    <p class="section-subtitle">Actualiza tus datos personales</p>

                    <div class="info-grid">
                        <div class="info-field">
                            <label class="field-label">Nombre</label>
                            <div class="field-value">${patient.name || '-'}</div>
                        </div>
                        <div class="info-field">
                            <label class="field-label">Apellido</label>
                            <div class="field-value">${patient.lastName || '-'}</div>
                        </div>
                        <div class="info-field">
                            <label class="field-label">Email</label>
                            <div class="field-value">${patient.email || '-'}</div>
                        </div>
                        <div class="info-field">
                            <label class="field-label">Teléfono</label>
                            <div class="field-value">${patient.phone || '-'}</div>
                        </div>
                        <div class="info-field">
                            <label class="field-label">DNI</label>
                            <div class="field-value">${patient.dni || '-'}</div>
                        </div>
                        <div class="info-field">
                            <label class="field-label">Fecha de Nacimiento</label>
                            <div class="field-value">${patient.birthDate || '-'}</div>
                        </div>
                        <div class="info-field full-width">
                            <label class="field-label">Dirección</label>
                            <div class="field-value">${patient.address || '-'}</div>
                        </div>
                    </div>
                </div>

                <div class="profile-section">
                    <div class="section-header">
                        <div class="section-icon-wrapper" style="background: #10b981;">
                            <i class="fas fa-notes-medical"></i>
                        </div>
                        <h3 class="section-title">Información Médica</h3>
                    </div>
                    <p class="section-subtitle">Información de cobertura médica</p>

                    <div class="info-grid">
                        <div class="info-field">
                            <label class="field-label">Obra Social</label>
                            <div class="field-value">${patient.medicalInsurance || 'No especificada'}</div>
                        </div>
                        <div class="info-field">
                            <label class="field-label">Número de Afiliado</label>
                            <div class="field-value">${patient.insuranceNumber || 'No especificado'}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Crea HTML de edición del perfil
 */
export function createProfileEditHTML(patient) {
    return `
        <form id="profileEditForm" class="profile-edit-modern">
            <div class="profile-container-modern">
                <div class="profile-content-card">
                    <div class="profile-section">
                        <div class="section-header">
                            <div class="section-icon-wrapper" style="background: #3b82f6;">
                                <i class="fas fa-user"></i>
                            </div>
                            <h3 class="section-title">Información Personal</h3>
                        </div>
                        <p class="section-subtitle">Actualiza tus datos personales</p>

                        <div class="form-grid">
                            <div class="form-field">
                                <label for="edit-name">Nombre</label>
                                <input type="text" id="edit-name" name="Name" value="${patient.name || ''}" required>
                            </div>

                            <div class="form-field">
                                <label for="edit-lastName">Apellido</label>
                                <input type="text" id="edit-lastName" name="LastName" value="${patient.lastName || ''}" required>
                            </div>

                            <div class="form-field">
                                <label for="edit-email">Email</label>
                                <input type="email" id="edit-email" name="Email" value="${patient.email || ''}" disabled>
                                <small class="field-hint">El email no puede ser modificado</small>
                            </div>

                            <div class="form-field">
                                <label for="edit-phone">Teléfono</label>
                                <input type="tel" id="edit-phone" name="Phone" value="${patient.phone || ''}" placeholder="+54 9 11 1234-5678">
                            </div>

                            <div class="form-field">
                                <label for="edit-dni">DNI</label>
                                <input type="text" id="edit-dni" name="Dni" value="${patient.dni || ''}" required>
                            </div>

                            <div class="form-field">
                                <label for="edit-birthDate">Fecha de Nacimiento</label>
                                <input type="date" id="edit-birthDate" name="DateOfBirth" value="${toISODate(patient.birthDate) || ''}" required>
                            </div>

                            <div class="form-field full-width">
                                <label for="edit-address">Dirección</label>
                                <input type="text" id="edit-address" name="Adress" value="${patient.address || ''}" placeholder="Calle, número, ciudad">
                            </div>
                        </div>
                    </div>

                    <div class="profile-section">
                        <div class="section-header">
                            <div class="section-icon-wrapper" style="background: #10b981;">
                                <i class="fas fa-notes-medical"></i>
                            </div>
                            <h3 class="section-title">Información Médica</h3>
                        </div>
                        <p class="section-subtitle">Información de cobertura médica</p>

                        <div class="form-grid">
                            <div class="form-field">
                                <label for="edit-HealthPlan">Obra Social</label>
                                <input type="text" id="edit-HealthPlan" name="HealthPlan" value="${patient.medicalInsurance || ''}" placeholder="Ej: OSDE, Swiss Medical">
                            </div>

                            <div class="form-field">
                                <label for="edit-MembershipNumber">Número de Afiliado</label>
                                <input type="text" id="edit-MembershipNumber" name="MembershipNumber" value="${patient.insuranceNumber || ''}" placeholder="123456789">
                            </div>
                        </div>
                    </div>

                    <div class="form-actions">
                        <button type="button" class="btn-cancel" id="cancelEditBtn">
                            Cancelar
                        </button>
                        <button type="submit" class="btn-save">
                            <i class="fas fa-save"></i>
                            Guardar Cambios
                        </button>
                    </div>
                </div>
            </div>
        </form>
    `;
}

/**
 * Alterna entre vista y edición del perfil
 */
export function toggleProfileEdit(patientData) {
    const profileContent = document.getElementById('profileContent');
    const editBtn = document.getElementById('editProfileBtn');
    const profileSection = document.querySelector('.profile-section');

    if (!profileContent || !editBtn) return;

    const isEditing = profileContent.querySelector('.profile-edit-modern');

    if (isEditing) {
        // Cambiar a modo vista
        profileContent.innerHTML = createProfileViewHTML(patientData);
        editBtn.innerHTML = '<i class="fas fa-edit"></i> Editar Perfil';
        editBtn.className = 'btn btn-secondary';
        if (profileSection) {
            profileSection.setAttribute('data-patient', JSON.stringify(patientData));
        }
    } 
    else {
        // Cambiar a modo edición
        profileContent.innerHTML = createProfileEditHTML(patientData);
        editBtn.innerHTML = '<i class="fas fa-times"></i> Cancelar';
        editBtn.className = 'btn btn-secondary';
        
        const form = document.getElementById('profileEditForm');
        const cancelBtn = document.getElementById('cancelEditBtn');

        if (form) {
            form.addEventListener('submit', async function (e) {
                e.preventDefault();
                await saveProfileChanges(form, patientData);
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', function () {
                toggleProfileEdit(patientData);
            });
        }
    }
}

/**
 * Guarda cambios del perfil
 */
async function saveProfileChanges(form, originalData) {
    try {
        // Mostrar loading
        const submitBtn = form.querySelector('.btn-save');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

        const formData = new FormData(form);
        const birthDateISO = formData.get('DateOfBirth');
        
        const updatedData = {
            name: formData.get('Name'),
            lastName: formData.get('LastName'),
            dni: formData.get('Dni'),
            birthDate: birthDateISO ? birthDateISO.split('T')[0] : '',
            address: formData.get('Adress'),
            phone: formData.get('Phone'),
            medicalInsurance: formData.get('HealthPlan'),
            insuranceNumber: formData.get('MembershipNumber'),
        };

        // Preparar payload para el backend
        const apiPayload = {
            Name: updatedData.name,
            LastName: updatedData.lastName,
            Dni: parseInt(updatedData.dni, 10) || 0,
            DateOfBirth: updatedData.birthDate,
            Adress: updatedData.address,
            Phone: updatedData.phone,
            HealthPlan: updatedData.medicalInsurance,
            MembershipNumber: updatedData.insuranceNumber,
        };

        // RUTA CORREGIDA: api.js está en js/
        const { Api } = await import('../api.js');
        const patientId = appState.currentPatient?.patientId;
        if (!patientId) {
            throw new Error('No se pudo identificar al paciente para actualizar.');
        }

        // Actualizar datos del paciente
        await Api.patch(`v1/Patient/${patientId}`, apiPayload);

        // Actualizar el estado global
        appState.currentPatient = {
            ...appState.currentPatient,
            ...updatedData,
            patientId,
        };

        // Actualizar el atributo data-patient
        const profileSection = document.querySelector('.profile-section');
        if (profileSection) {
            profileSection.setAttribute('data-patient', JSON.stringify(appState.currentPatient));
        }

        // Mostrar notificación de éxito
        showNotification('✓ Perfil actualizado exitosamente', 'success');

        // Volver a modo vista
        toggleProfileEdit(appState.currentPatient);
        
        // Actualizar banner de bienvenida
        updateWelcomeBanner();

    } catch (error) {
        console.error('Error al guardar perfil:', error);
        showNotification('Error al guardar los cambios. Por favor intenta nuevamente.', 'error');
        
        // Restaurar botón
        const submitBtn = form.querySelector('.btn-save');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
        }
    }
}