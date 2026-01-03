// patient-filters.js

import { applyStylesAfterFilterChange } from './patient-ui.js';
import { loadPatientAppointments } from './patient-appointments.js';

// Función para inicializar los filtros
export function initializeFilters() {
    const statusFilter = document.getElementById('status-filter');
    
    if (statusFilter) {
        // Cuando cambie el filtro, recargamos las citas con el nuevo estado
        statusFilter.addEventListener('change', async () => {
            console.log('🔄 Filtro cambiado, recargando turnos...');
            await loadPatientAppointments();
            
            // ✅ Aplicar estilos después de filtrar
            setTimeout(() => {
                if (typeof applyStylesAfterFilterChange === 'function') {
                    applyStylesAfterFilterChange();
                } else if (typeof window.applyStylesAfterFilterChange === 'function') {
                    window.applyStylesAfterFilterChange();
                }
            }, 200);
        });
    }
}

export function getStatusFilter() {
    const statusFilter = document.getElementById('status-filter');
    return statusFilter ? statusFilter.value : '';
}