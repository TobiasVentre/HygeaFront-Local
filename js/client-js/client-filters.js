// client-filters.js

import { applyStylesAfterFilterChange } from './client-ui.js';
import { loadClientAppointments } from './client-appointments.js';

// Función para inicializar los filtros
export function initializeFilters() {
    const statusFilter = document.getElementById('status-filter');
    
    if (statusFilter) {
        // Cuando cambie el filtro, recargamos las citas con el nuevo estado
        statusFilter.addEventListener('change', async () => {
            console.log('🔄 Filtro cambiado, recargando turnos...');
            await loadClientAppointments();
            
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