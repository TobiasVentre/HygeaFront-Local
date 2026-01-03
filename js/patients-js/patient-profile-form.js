// ============================================
// FORMULARIO Y GUARDADO DE PERFIL
// ============================================

import { showNotification } from '../shared/notifications.js';
import { toggleProfileEdit } from './profile.js';
import { updateWelcomeBanner } from '../inicio/dashboard.js';

/**
 * Guarda cambios del perfil
 */
export async function saveProfileChanges(form, originalData) {
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
        if (typeof updateWelcomeBanner === 'function') {
            updateWelcomeBanner();
        }

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