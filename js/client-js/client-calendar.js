// ============================================
// CALENDARIO PERSONALIZADO DE DISPONIBILIDAD
// ============================================

import { showNotification } from './client-notifications.js';
import { timeSpanToMinutes } from './client-utils.js';

// Constantes para mapeo de días
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEK_DAY_MAP = { 0: 7, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 }; // JS → Backend

/**
 * Carga fechas y horarios disponibles para un fumigator
 */
export async function loadAvailableDatesAndTimes(fumigatorId) {
    try {
        console.log('=== CARGANDO FECHAS Y HORARIOS DISPONIBLES ===');
        console.log('Fumigator ID:', fumigatorId);
        
        const { ApiScheduling } = await import('../api.js');
        
        const availabilitiesResponse = await ApiScheduling.get(`FumigatorAvailability/search?fumigatorId=${fumigatorId}`);
        const availabilities = Array.isArray(availabilitiesResponse) 
            ? availabilitiesResponse 
            : (availabilitiesResponse?.value || availabilitiesResponse || []);
        
        console.log('Disponibilidades recibidas:', availabilities.length);
        console.log('Detalles de disponibilidades:', availabilities.map(av => ({
            dayOfWeek: av.dayOfWeek || av.DayOfWeek,
            startTime: av.startTime || av.StartTime,
            endTime: av.endTime || av.EndTime,
            isActive: av.isActive ?? av.IsActive
        })));
        
        if (!availabilities || availabilities.length === 0) {
            showNotification('Este médico no tiene disponibilidades configuradas', 'warning');
            return;
        }

        const now = new Date();
        const fourWeeksLater = new Date(now.getTime() + 4 * 7 * 24 * 60 * 60 * 1000);
        
        console.log('Rango de fechas:', {
            desde: now.toISOString().split('T')[0],
            hasta: fourWeeksLater.toISOString().split('T')[0]
        });
        
        const appointmentsResponse = await ApiScheduling.get(
            `Appointments?fumigatorId=${fumigatorId}&startTime=${now.toISOString()}&endTime=${fourWeeksLater.toISOString()}`
        );
        const appointments = Array.isArray(appointmentsResponse) 
            ? appointmentsResponse 
            : (appointmentsResponse?.value || appointmentsResponse || []);
        
        console.log('Appointments existentes:', appointments.length);
        
        const availableDates = calculateAvailableDates(availabilities, appointments || [], now, fourWeeksLater);
        
        console.log('Fechas disponibles calculadas:', availableDates.length);
        console.log('Fechas:', availableDates.map(d => d.toISOString().split('T')[0]));
        
        const dateInput = document.getElementById('date');
        if (dateInput) {
            const minDate = now.toISOString().split('T')[0];
            const maxDate = fourWeeksLater.toISOString().split('T')[0];
            dateInput.min = minDate;
            dateInput.max = maxDate;
            dateInput.value = '';
            
            const availableDatesStr = availableDates.map(d => d.toISOString().split('T')[0]).join(',');
            dateInput.setAttribute('data-available-dates', availableDatesStr);
            dateInput.setAttribute('data-has-availability', 'true');
            dateInput.classList.add('has-availability');
            
            updateDateInputIndicator(dateInput, availableDates);
            initializeCustomCalendar(dateInput, availableDates);
        }
        
        console.log('✅ Calendario inicializado correctamente');
        
    } catch (error) {
        console.error('❌ Error al cargar disponibilidades:', error);
        showNotification('No se pudieron cargar las disponibilidades del médico', 'error');
    }
}

/**
 * Carga horarios disponibles para una fecha específica
 */
export async function loadAvailableTimes(fumigatorId, selectedDate) {
    try {
        console.log('=== CARGANDO HORARIOS PARA FECHA ===');
        console.log('Fumigator ID:', fumigatorId);
        console.log('Fecha seleccionada:', selectedDate);
        
        const { ApiScheduling } = await import('../api.js');
        const timeSelect = document.getElementById('time');
        if (!timeSelect) return;

        timeSelect.innerHTML = '<option value="">Cargando horarios...</option>';

        const availabilitiesResponse = await ApiScheduling.get(`FumigatorAvailability/search?fumigatorId=${fumigatorId}`);
        const availabilities = Array.isArray(availabilitiesResponse) 
            ? availabilitiesResponse 
            : (availabilitiesResponse?.value || availabilitiesResponse || []);
        
        if (!availabilities || availabilities.length === 0) {
            timeSelect.innerHTML = '<option value="">Sin disponibilidades</option>';
            return;
        }

        // FIX: Crear fecha correctamente sin conversión de zona horaria
        const [year, month, day] = selectedDate.split('-').map(Number);
        const selectedDateObj = new Date(year, month - 1, day);
        const dayOfWeekJS = selectedDateObj.getDay(); // 0-6
        const backendDayOfWeek = WEEK_DAY_MAP[dayOfWeekJS];
        const dayName = DAY_NAMES[dayOfWeekJS];

        console.log('Análisis de día:', {
            fecha: selectedDate,
            dayOfWeekJS,
            backendDayOfWeek,
            dayName
        });

        // FIX: Filtro mejorado con logs
        const dayAvailabilities = availabilities.filter(av => {
            const avDay = av.dayOfWeek || av.DayOfWeek;
            const isActive = av.isActive !== false && av.IsActive !== false;
            
            let matches = false;
            
            // Comparar por número de enum (1-7)
            if (typeof avDay === 'number') {
                matches = avDay === backendDayOfWeek;
                console.log(`  Comparación numérica: ${avDay} === ${backendDayOfWeek} → ${matches}`);
            }
            // Comparar por nombre (case-insensitive)
            else if (typeof avDay === 'string') {
                matches = avDay.toLowerCase() === dayName.toLowerCase();
                console.log(`  Comparación string: "${avDay}" === "${dayName}" → ${matches}`);
            }
            
            const result = isActive && matches;
            console.log(`  Disponibilidad: dayOfWeek=${avDay}, isActive=${isActive}, matches=${matches}, resultado=${result}`);
            
            return result;
        });

        console.log(`Disponibilidades encontradas para ${dayName}:`, dayAvailabilities.length);

        if (dayAvailabilities.length === 0) {
            timeSelect.innerHTML = '<option value="">No hay disponibilidad este día</option>';
            showNotification('No hay horarios disponibles para este día', 'info');
            return;
        }

        // Obtener appointments del día
        const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
        const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
        
        const appointmentsResponse = await ApiScheduling.get(
            `Appointments?fumigatorId=${fumigatorId}&startTime=${startOfDay.toISOString()}&endTime=${endOfDay.toISOString()}`
        );
        const appointments = Array.isArray(appointmentsResponse) 
            ? appointmentsResponse 
            : (appointmentsResponse?.value || appointmentsResponse || []);
        
        console.log('Appointments del día:', appointments.length);
        
        const availableSlots = calculateAvailableTimeSlots(dayAvailabilities, appointments || [], selectedDate);
        
        console.log('Slots calculados:', availableSlots.length);

        if (availableSlots.length === 0) {
            timeSelect.innerHTML = '<option value="">No hay horarios disponibles</option>';
            showNotification('Todos los horarios están ocupados', 'info');
            return;
        }

        // Llenar select con horarios
        timeSelect.innerHTML = '<option value="">Seleccionar hora</option>';
        availableSlots.forEach(slot => {
            const option = document.createElement('option');
            
            if (typeof slot === 'object' && slot.isoString) {
                option.value = JSON.stringify({
                    isoString: slot.isoString,
                    localHours: slot.localHours,
                    localMinutes: slot.localMinutes,
                    date: slot.date ? slot.date.toISOString() : slot.isoString
                });
                const hours = String(slot.localHours).padStart(2, '0');
                const minutes = String(slot.localMinutes).padStart(2, '0');
                option.textContent = `${hours}:${minutes}`;
            } else {
                option.value = slot;
                const slotDate = new Date(slot);
                const hours = String(slotDate.getHours()).padStart(2, '0');
                const minutes = String(slotDate.getMinutes()).padStart(2, '0');
                option.textContent = `${hours}:${minutes}`;
            }
            
            timeSelect.appendChild(option);
        });

        console.log('✅ Horarios cargados exitosamente');

    } catch (error) {
        console.error('❌ Error al cargar horarios disponibles:', error);
        showNotification('No se pudieron cargar los horarios disponibles', 'error');
        const timeSelect = document.getElementById('time');
        if (timeSelect) {
            timeSelect.innerHTML = '<option value="">Error al cargar</option>';
        }
    }
}

/**
 * Calcula fechas disponibles basándose en las disponibilidades
 * FIX: Lógica corregida con logs detallados
 */
function calculateAvailableDates(availabilities, appointments, startDate, endDate) {
    console.log('=== CALCULANDO FECHAS DISPONIBLES ===');
    
    const availableDates = [];
    const currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0); // Normalizar a medianoche
    
    let daysChecked = 0;
    
    while (currentDate <= endDate) {
        daysChecked++;
        const dayOfWeekJS = currentDate.getDay(); // 0-6
        const backendDayOfWeek = WEEK_DAY_MAP[dayOfWeekJS];
        const dayName = DAY_NAMES[dayOfWeekJS];
        const dateStr = currentDate.toISOString().split('T')[0];
        
        // FIX: Verificar disponibilidad correctamente
        const hasAvailability = availabilities.some(av => {
            const avDay = av.dayOfWeek || av.DayOfWeek;
            const isActive = av.isActive !== false && av.IsActive !== false;
            
            if (!isActive) return false;
            
            // Comparar por número (1-7)
            if (typeof avDay === 'number') {
                return avDay === backendDayOfWeek;
            }
            
            // Comparar por nombre (case-insensitive)
            if (typeof avDay === 'string') {
                return avDay.toLowerCase() === dayName.toLowerCase();
            }
            
            return false;
        });
        
        if (daysChecked <= 7) { // Log solo primera semana
            console.log(`${dateStr} (${dayName}): ${hasAvailability ? '✅' : '❌'}`);
        }
        
        if (hasAvailability) {
            availableDates.push(new Date(currentDate));
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    console.log(`Total días verificados: ${daysChecked}`);
    console.log(`Fechas disponibles: ${availableDates.length}`);
    
    return availableDates;
}

/**
 * Calcula slots de tiempo disponibles
 */
function calculateAvailableTimeSlots(availabilities, appointments, selectedDate) {
    console.log('=== CALCULANDO SLOTS DE TIEMPO ===');
    
    const slots = [];
    const [year, month, day] = selectedDate.split('-').map(Number);
    const baseDate = new Date(year, month - 1, day, 0, 0, 0, 0);
    
    availabilities.forEach((av, index) => {
        const startTime = av.startTime || av.StartTime;
        const endTime = av.endTime || av.EndTime;
        const durationMinutes = av.durationMinutes || av.DurationMinutes || 30;
        
        console.log(`Disponibilidad ${index + 1}:`, {
            startTime,
            endTime,
            durationMinutes
        });
        
        const startMinutes = timeSpanToMinutes(startTime);
        const endMinutes = timeSpanToMinutes(endTime);
        
        console.log(`  Minutos: ${startMinutes} - ${endMinutes}`);
        
        let slotsGenerated = 0;
        
        for (let minutes = startMinutes; minutes + durationMinutes <= endMinutes; minutes += durationMinutes) {
            const slotStartLocal = new Date(baseDate);
            slotStartLocal.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
            
            const slotEndLocal = new Date(slotStartLocal);
            slotEndLocal.setMinutes(slotEndLocal.getMinutes() + durationMinutes);
            
            // Verificar solapamiento
            const isOccupied = appointments.some(apt => {
                const aptStart = new Date(apt.startTime || apt.StartTime);
                const aptEnd = new Date(apt.endTime || apt.EndTime);
                return (slotStartLocal < aptEnd && slotEndLocal > aptStart);
            });
            
            const now = new Date();
            const isFuture = slotStartLocal > now;
            
            if (!isOccupied && isFuture) {
                slots.push({
                    isoString: slotStartLocal.toISOString(),
                    localHours: Math.floor(minutes / 60),
                    localMinutes: minutes % 60,
                    date: slotStartLocal
                });
                slotsGenerated++;
            }
        }
        
        console.log(`  Slots generados: ${slotsGenerated}`);
    });
    
    slots.sort((a, b) => {
        const timeA = a.localHours * 60 + a.localMinutes;
        const timeB = b.localHours * 60 + b.localMinutes;
        return timeA - timeB;
    });
    
    console.log(`Total slots disponibles: ${slots.length}`);
    
    return slots;
}

/**
 * Actualiza indicador visual de fechas disponibles
 */
function updateDateInputIndicator(dateInput, availableDates) {
    const existingIndicator = dateInput.parentElement?.querySelector('.available-dates-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    if (!availableDates || availableDates.length === 0) {
        return;
    }
    
    const indicator = document.createElement('div');
    indicator.className = 'available-dates-indicator';
    indicator.innerHTML = `
        <small style="color: #10b981; font-weight: 600; display: flex; align-items: center; gap: 0.25rem; margin-top: 0.25rem;">
            <i class="fas fa-calendar-check" style="font-size: 0.75rem;"></i>
            <span>${availableDates.length} día${availableDates.length !== 1 ? 's' : ''} disponible${availableDates.length !== 1 ? 's' : ''}</span>
        </small>
    `;
    
    const wrapper = dateInput.closest('.custom-date-picker-wrapper') || dateInput.parentElement;
    if (wrapper) {
        wrapper.appendChild(indicator);
    }
}

// ... (resto de funciones del calendario sin cambios)

/**
 * Inicializa calendario personalizado
 */
function initializeCustomCalendar(dateInput, availableDates) {
    const customCalendar = document.getElementById('custom-calendar');
    if (!customCalendar) return;
    
    const availableDatesSet = new Set(availableDates.map(d => d.toISOString().split('T')[0]));
    
    function renderCalendar(year, month) {
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = firstDay.getDay();
        
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                          'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        
        let html = `
            <div class="custom-calendar-header">
                <button type="button" class="calendar-nav-btn" data-action="prev">
                    <i class="fas fa-chevron-left"></i>
                </button>
                <div class="calendar-month-year">
                    <span>${monthNames[month]} ${year}</span>
                </div>
                <button type="button" class="calendar-nav-btn" data-action="next">
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
            <div class="custom-calendar-weekdays">
                ${dayNames.map(day => `<div class="calendar-weekday">${day}</div>`).join('')}
            </div>
            <div class="custom-calendar-days">
        `;
        
        const prevMonth = month === 0 ? 11 : month - 1;
        const prevYear = month === 0 ? year - 1 : year;
        const daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
        
        for (let i = startingDayOfWeek - 1; i >= 0; i--) {
            const day = daysInPrevMonth - i;
            html += `<div class="calendar-day calendar-day-other">${day}</div>`;
        }
        
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isAvailable = availableDatesSet.has(dateStr);
            const isToday = dateStr === new Date().toISOString().split('T')[0];
            const isSelected = dateInput.value === dateStr;
            
            let dayClass = 'calendar-day';
            if (isAvailable) {
                dayClass += ' calendar-day-available';
            } else {
                dayClass += ' calendar-day-unavailable';
            }
            if (isToday) dayClass += ' calendar-day-today';
            if (isSelected) dayClass += ' calendar-day-selected';
            
            html += `<div class="${dayClass}" data-date="${dateStr}" ${isAvailable ? '' : 'style="cursor: not-allowed; opacity: 0.5;"'}>${day}</div>`;
        }
        
        const remainingDays = 42 - (startingDayOfWeek + daysInMonth);
        for (let day = 1; day <= remainingDays; day++) {
            html += `<div class="calendar-day calendar-day-other">${day}</div>`;
        }
        
        html += '</div>';
        customCalendar.innerHTML = html;
        customCalendar.setAttribute('data-year', year);
        customCalendar.setAttribute('data-month', month);
        
        const navButtons = customCalendar.querySelectorAll('.calendar-nav-btn');
        navButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.getAttribute('data-action');
                let newMonth = parseInt(customCalendar.getAttribute('data-month'));
                let newYear = parseInt(customCalendar.getAttribute('data-year'));
                
                if (action === 'prev') {
                    newMonth--;
                    if (newMonth < 0) {
                        newMonth = 11;
                        newYear--;
                    }
                } else {
                    newMonth++;
                    if (newMonth > 11) {
                        newMonth = 0;
                        newYear++;
                    }
                }
                renderCalendar(newYear, newMonth);
            });
        });
        
        const availableDays = customCalendar.querySelectorAll('.calendar-day-available');
        availableDays.forEach(dayEl => {
            dayEl.addEventListener('click', async (e) => {
                e.stopPropagation();
                const selectedDate = dayEl.getAttribute('data-date');
                dateInput.value = selectedDate;
                
                customCalendar.querySelectorAll('.calendar-day-selected').forEach(el => {
                    el.classList.remove('calendar-day-selected');
                });
                dayEl.classList.add('calendar-day-selected');
                
                const fumigatorId = parseInt(document.getElementById('fumigator')?.value);
                if (fumigatorId) {
                    await loadAvailableTimes(fumigatorId, selectedDate);
                }
            });
        });
    }
    
    const today = new Date();
    renderCalendar(today.getFullYear(), today.getMonth());
    customCalendar.setAttribute('data-initialized', 'true');
}

/**
 * Inicializa calendario vacío
 */
export function initializeEmptyCalendar() {
    const customCalendar = document.getElementById('custom-calendar');
    if (!customCalendar) return;
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    
    let html = `
        <div class="custom-calendar-header">
            <button type="button" class="calendar-nav-btn" data-action="prev">
                <i class="fas fa-chevron-left"></i>
            </button>
            <div class="calendar-month-year">
                <span>${monthNames[currentMonth]} ${currentYear}</span>
            </div>
            <button type="button" class="calendar-nav-btn" data-action="next">
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>
        <div class="custom-calendar-weekdays">
            ${dayNames.map(day => `<div class="calendar-weekday">${day}</div>`).join('')}
        </div>
        <div class="custom-calendar-days">
    `;
    
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();
    
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        html += `<div class="calendar-day calendar-day-other">${day}</div>`;
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = dateStr === new Date().toISOString().split('T')[0];
        let dayClass = 'calendar-day calendar-day-unavailable';
        if (isToday) dayClass += ' calendar-day-today';
        html += `<div class="${dayClass}" style="cursor: not-allowed; opacity: 0.5;">${day}</div>`;
    }
    
    const remainingDays = 42 - (startingDayOfWeek + daysInMonth);
    for (let day = 1; day <= remainingDays; day++) {
        html += `<div class="calendar-day calendar-day-other">${day}</div>`;
    }
    
    html += '</div>';
    customCalendar.innerHTML = html;
    customCalendar.setAttribute('data-year', currentYear);
    customCalendar.setAttribute('data-month', currentMonth);
    customCalendar.setAttribute('data-initialized', 'true');
}