// ============================================
// UTILIDADES GENERALES
// ============================================

/**
 * Formatea una fecha al formato argentino (DD/MM/YYYY)
 */
export function formatDate(value) {
    if (!value) return '';
    let date = value;

    if (typeof value === 'string') {
        const normalized = value.replace(/T.*/, '');
        const [year, month, day] = normalized.split('-');
        if (year && month && day) {
            date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
        } else {
            date = new Date(normalized);
        }
    }

    if (value instanceof Date) date = value;
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
            const [year, month, day] = value.split('-');
            return `${day}/${month}/${year}`;
        }
        return value;
    }

    return date.toLocaleDateString('es-AR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/**
 * Formatea la hora de una fecha (HH:mm)
 */
export function formatTime(date) {
    if (!date) return '';
    const d = new Date(date);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

/**
 * Convierte fecha en formato display (DD/MM/YYYY) a ISO (YYYY-MM-DD)
 */
export function toISODate(displayDate) {
    if (!displayDate) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(displayDate)) return displayDate;

    const match = displayDate.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
    if (match) {
        const [, day, month, year] = match;
        return `${year}-${month}-${day}`;
    }

    const date = new Date(displayDate);
    if (Number.isNaN(date.getTime())) return '';

    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Obtiene la sección activa del sidebar
 */
export function getActiveSection() {
    const activeItem = document.querySelector(".nav-item.active");
    return activeItem ? activeItem.dataset.section : null;
}

/**
 * Normaliza datos del cliente desde el backend
 */
export function normalizeClient(rawClient) {
    if (!rawClient) return null;

    let birthDate = rawClient.birthDate ?? rawClient.dateOfBirth ?? rawClient.DateOfBirth ?? '';
    if (birthDate) {
        if (typeof birthDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(birthDate)) {
            birthDate = birthDate.split('T')[0];
        }
    }

    let healthPlan = rawClient.healthPlan ?? rawClient.HealthPlan ?? '';
    healthPlan = healthPlan && healthPlan.trim() ? healthPlan.trim() : '';
    
    let membershipNumber = rawClient.membershipNumber ?? rawClient.MembershipNumber ?? '';
    membershipNumber = membershipNumber && membershipNumber.trim() ? membershipNumber.trim() : '';

    return {
        clientId: rawClient.clientId ?? rawClient.ClientId ?? null,
        name: rawClient.name ?? rawClient.firstName ?? rawClient.Name ?? '',
        lastName: rawClient.lastName ?? rawClient.LastName ?? '',
        email: rawClient.email ?? '',
        phone: rawClient.phone ?? rawClient.Phone ?? '',        
        address: rawClient.address ?? rawClient.adress ?? rawClient.Adress ?? '',
        dni: (rawClient.dni ?? rawClient.Dni ?? '').toString(),
        birthDate: birthDate,
        medicalInsurance: healthPlan,
        insuranceNumber: membershipNumber,
        userId: rawClient.userId ?? rawClient.UserId ?? null
    };
}

/**
 * Construye objeto de perfil con valores por defecto
 */
export function buildProfileData(client, user) {
    const defaults = {
        clientId: client?.clientId ?? null,
        name: 'Cliente',
        lastName: '',
        email: user?.email || 'sin-correo@cuidarmed.com',
        address: '',
        phone: '',
        birthDate: '',
        dni: '',
        medicalInsurance: '',
        insuranceNumber: '',
    };

    return {
        ...defaults,
        ...client,
        email: client?.email || defaults.email,
        birthDate: formatDate(client?.birthDate) || defaults.birthDate,
    };
}

/**
 * Convierte TimeSpan (formato "HH:mm:ss") a minutos desde medianoche
 */
export function timeSpanToMinutes(timeSpan) {
    if (typeof timeSpan === 'string') {
        const parts = timeSpan.split(':');
        return parseInt(parts[0]) * 60 + parseInt(parts[1]);
    }
    if (timeSpan.hours !== undefined) {
        return timeSpan.hours * 60 + (timeSpan.minutes || 0);
    }
    return 0;
}