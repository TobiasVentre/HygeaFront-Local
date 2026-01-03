// ===================================
// DOCTOR UI - Interfaz y Notificaciones
// ===================================

import { doctorState, DEFAULT_AVATAR_URL, getDoctorAvatarUrl, getDoctorDisplayName } from './doctor-core.js';



// ===================================
// ACTUALIZACIÓN DEL HEADER
// ===================================

const updateElement = (id, content, isHTML = false) => {
    const el = document.getElementById(id);
    if (el) isHTML ? (el.innerHTML = content) : (el.textContent = content);
    return !!el;
};

const setAvatarSrc = (id, url, altText) => {
    const el = document.getElementById(id);
    if (el) {
        el.src = url;
        el.alt = altText;
        el.onerror = () => { el.src = DEFAULT_AVATAR_URL; };
    }
};

export function updateDoctorHeader(doctorInfo) {
    console.log('🔄 Actualizando header del doctor', doctorInfo);
    
    const displayName = getDoctorDisplayName(doctorInfo);
    const avatarUrl = getDoctorAvatarUrl();
    
    // Nombre de bienvenida
    const firstName = doctorInfo?.firstName ?? doctorInfo?.FirstName ?? doctorState.currentUser?.firstName ?? '';
    const lastName = doctorInfo?.lastName ?? doctorInfo?.LastName ?? doctorInfo?.Lastname ?? doctorState.currentUser?.lastName ?? '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
    
    updateElement('welcome-name', fullName 
        ? `Hola, Dr ${fullName}` 
        : `Hola, Dr ${doctorState.currentUser?.email?.split('@')[0] || 'Profesional'}`);
    
    // Mensaje de bienvenida
    const welcomeMsg = document.getElementById('welcome-message');
    if (welcomeMsg && !welcomeMsg.dataset.custom) {
        welcomeMsg.textContent = 'Panel de gestión médica';
    }
    
    // Avatares
    setAvatarSrc('userMenuAvatar', avatarUrl, `Foto de ${displayName}`);
    setAvatarSrc('profile-avatar', avatarUrl, `Foto de perfil de ${displayName}`);
    
    // Nombre del menú
    updateElement('userMenuName', doctorState.currentUser?.firstName || 'Mi cuenta');
    
    updateDoctorProfileSection(doctorInfo);
}

export function updateDoctorProfileSection(doctorInfo) {
    if (!document.getElementById('doctorProfileSection')) return;
    
    const info = doctorInfo || {};
    const displayName = getDoctorDisplayName(info);
    const avatarUrl = getDoctorAvatarUrl();
    
    setAvatarSrc('doctor-avatar-preview', avatarUrl, `Foto de ${displayName}`);
    
    const fields = [
        ['profileFirstNameInput', info.firstName ?? info.FirstName ?? doctorState.currentUser?.firstName ?? ''],
        ['profileLastNameInput', info.lastName ?? info.LastName ?? doctorState.currentUser?.lastName ?? ''],
        ['profileEmailInput', doctorState.currentUser?.email ?? info.email ?? info.Email ?? ''],
        ['profileSpecialtyInput', info.specialty ?? info.Specialty ?? ''],
        ['profileBioInput', info.biography ?? info.Biography ?? ''],
        ['doctor-image-url-input', doctorState.currentUser?.imageUrl && doctorState.currentUser.imageUrl !== DEFAULT_AVATAR_URL ? doctorState.currentUser.imageUrl : '']
    ];
    
    fields.forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    });
}

// ===================================
// SISTEMA DE NOTIFICACIONES
// ===================================

const NOTIFICATION_CONFIG = {
    success: { icon: 'fa-check-circle', border: '#10b981' },
    error: { icon: 'fa-exclamation-circle', border: '#dc2626' },
    warning: { icon: 'fa-exclamation-triangle', border: '#f59e0b' },
    info: { icon: 'fa-info-circle', border: '#10b981' }
};

export function showNotification(message, type = 'info') {
    console.log(`📢 Notificación [${type}]:`, message);
    
    const config = NOTIFICATION_CONFIG[type] || NOTIFICATION_CONFIG.info;
    const notification = document.createElement('div');
    
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `position: fixed; top: 20px; right: 20px; background: white; border-radius: 8px; 
        box-shadow: 0 4px 20px rgba(0,0,0,0.15); padding: 1rem; z-index: 10001; animation: slideIn 0.3s ease-out; 
        max-width: 350px; border-left: 4px solid ${config.border};`;
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.75rem; color: #1f2937;">
            <i class="fas ${config.icon}" style="color: ${config.border}; font-size: 1.25rem;"></i>
            <span style="flex: 1; font-size: 0.9rem;">${message}</span>
            <button class="close-notification" style="background: none; border: none; color: #6b7280; cursor: pointer; font-size: 1.25rem; padding: 0;">&times;</button>
        </div>
    `;
    
    if (!document.querySelector('#notification-styles')) {
        const styles = document.createElement('style');
        styles.id = 'notification-styles';
        styles.textContent = `
            @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
            @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
        `;
        document.head.appendChild(styles);
    }
    
    const close = () => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    };
    
    notification.querySelector('.close-notification').addEventListener('click', close);
    document.body.appendChild(notification);
    setTimeout(close, 5000);
}

// ===================================
// FUNCIONES DE ACTUALIZACIÓN DE UI
// ===================================

export function setProfileFormEditable(editable) {
    const inputs = ['profileFirstNameInput', 'profileLastNameInput', 'profileEmailInput', 
                    'profileSpecialtyInput', 'profileBioInput']
        .map(id => document.getElementById(id))
        .filter(Boolean);
    
    inputs.forEach(input => {
        input.disabled = !editable;
        input.style.cursor = editable ? 'text' : 'not-allowed';
    });
    
    const editBtn = document.getElementById('editDoctorProfile');
    const actions = document.getElementById('profileActions');
    
    if (editBtn) editBtn.style.display = editable ? 'none' : 'inline-flex';
    if (actions) actions.classList.toggle('hidden', !editable);
}

export function setActiveNav(section) {
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
        item.classList.toggle('active', item.getAttribute('data-section') === section);
    });
}

export { doctorState };