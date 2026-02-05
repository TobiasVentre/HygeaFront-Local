// ===================================
// FUMIGATOR PROFILE - Gestión de Perfil
// ===================================

import { 
    fumigatorState, 
    getId
} from './fumigator-core.js';

import { 
    showNotification,
    updateFumigatorProfileSection,
    setProfileFormEditable 
} from './fumigator-ui.js';

// ===================================
// INICIALIZACIÓN DE EDICIÓN DE PERFIL
// ===================================

/**
 * Inicializa la funcionalidad de edición de perfil
 */
export function initializeProfileEditing() {
    console.log('🔧 Inicializando edición de perfil');
    
    const editBtn = document.getElementById('editFumigatorProfile');
    const cancelBtn = document.getElementById('cancelProfileEdit');
    const profileForm = document.getElementById('fumigatorProfileForm');

    if (editBtn) {
        editBtn.addEventListener('click', function() {
            console.log('✏️ Modo edición activado');
            setProfileFormEditable(true);
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', function() {
            console.log('❌ Edición cancelada');
            setProfileFormEditable(false);
            // Recargar datos originales
            updateFumigatorProfileSection(fumigatorState.currentFumigatorData);
        });
    }

    if (profileForm) {
        profileForm.addEventListener('submit', handleProfileSubmit);
    }
}

/**
 * Maneja el envío del formulario de perfil
 */
async function handleProfileSubmit(e) {
    e.preventDefault();
    
    console.log('💾 Guardando perfil...');
    
    try {
        // Obtener valores del formulario
        const firstNameInput = document.getElementById('profileFirstNameInput');
        const lastNameInput = document.getElementById('profileLastNameInput');
        const emailInput = document.getElementById('profileEmailInput');
        const specialtyInput = document.getElementById('profileSpecialtyInput');
        const bioInput = document.getElementById('profileBioInput');
        
        const firstName = firstNameInput?.value?.trim() || '';
        const lastName = lastNameInput?.value?.trim() || '';
        const email = emailInput?.value?.trim() || '';
        const specialty = specialtyInput?.value?.trim() || '';
        const biography = bioInput?.value?.trim() || '';
        
        console.log('📝 Datos del formulario:', { firstName, lastName, email, specialty });
        
        // Validar que haya datos mínimos
        if (!firstName || !lastName) {
            showNotification('El nombre y apellido son obligatorios', 'error');
            return;
        }
        
        // Obtener el ID del fumigator
        const fumigatorId = getId(fumigatorState.currentFumigatorData, 'fumigatorId');

        if (!fumigatorId) {
            showNotification('No se pudo identificar el usuario. Por favor, recarga la página.', 'error');
            return;
        }
        
        // Construir el payload según la estructura esperada por el backend
        const payload = {
            FirstName: firstName,
            LastName: lastName,
            Specialty: specialty || null,
            Biography: biography || null,
        };
        
        console.log('📤 Enviando a DirectoryMS:', payload);
        
        // Importar Api
        const { Api } = await import('../api.js');
        
        // Guardar en el backend
        await Api.patch(`v1/technician/${fumigatorId}`, payload);
        console.log('✅ Perfil actualizado en DirectoryMS');
        
        // Actualizar los datos locales del usuario
        if (fumigatorState.currentUser) {
            fumigatorState.currentUser.firstName = firstName;
            fumigatorState.currentUser.lastName = lastName;
            if (email) {
                fumigatorState.currentUser.email = email;
            }
            
            // Actualizar en localStorage
            try {
                localStorage.setItem('user', JSON.stringify(fumigatorState.currentUser));
                const { state } = await import('../state.js');
                state.user = fumigatorState.currentUser;
                console.log('✅ Estado actualizado en localStorage');
            } catch (storageError) {
                console.warn('⚠️ No se pudo actualizar el localStorage', storageError);
            }
        }
        
        // Recargar datos del fumigator desde el backend
        const { loadFumigatorData } = await import('./fumigator-core.js');
        await loadFumigatorData();
        
        // Mostrar notificación de éxito
        showNotification('Perfil actualizado correctamente', 'success');
        
        // Desactivar modo edición
        setProfileFormEditable(false);
        
    } catch (error) {
        console.error('❌ Error al guardar el perfil:', error);
        const errorMessage = error.message || 'No se pudo guardar el perfil. Por favor, intenta nuevamente.';
        showNotification(errorMessage, 'error');
    }
}

// ===================================
// EXPORTACIONES
// ===================================

export { fumigatorState };