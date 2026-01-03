// ==== DOCTOR CALENDAR WRAPPER =====

import {
    loadAvailableDatesAndTimes,
    loadAvailableTimes
} from "../patients-js/patient-calendar.js";

function ensureHiddenDoctorSelect(doctorId) {
    let doctorSelect = document.getElementById("doctor");

    // En doctor.html no existe este select, lo creamos oculto
    if (!doctorSelect) {
        doctorSelect = document.createElement("select");
        doctorSelect.id = "doctor";
        doctorSelect.style.display = "none";
        document.body.appendChild(doctorSelect);
    }

    doctorSelect.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = String(doctorId);
    opt.selected = true;
    doctorSelect.appendChild(opt);
}

/**
 * Inicializa el calendario del modal de reprogramación del DOCTOR,
 * reutilizando toda la lógica de patient-calendar.js
 */
export async function loadDoctorAvailableDates(doctorId) {
    // nos aseguramos de que el date/time tengan los ids esperados
    const dateInput = document.getElementById("date");
    const calendarContainer = document.getElementById("custom-calendar");

    if (!dateInput || !calendarContainer) {
        console.error("❌ No se encontraron #date o #custom-calendar en el modal del doctor.");
        return;
    }

    // ocultamos el input nativo (UX igual a paciente)
    dateInput.style.display = "none";
    calendarContainer.classList.add("custom-calendar");

    // select oculto con el doctorId para que el calendario del paciente lo lea
    ensureHiddenDoctorSelect(doctorId);

    // Esto calcula disponibilidades, appointments y arma el calendario custom
    await loadAvailableDatesAndTimes(doctorId);
}

export async function loadDoctorAvailableTimes(doctorId, selectedDate) {
    ensureHiddenDoctorSelect(doctorId);
    await loadAvailableTimes(doctorId, selectedDate);
}
