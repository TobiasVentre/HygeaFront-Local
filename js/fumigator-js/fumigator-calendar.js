// ==== FUMIGATOR CALENDAR WRAPPER =====

import {
    loadAvailableDatesAndTimes,
    loadAvailableTimes
} from "../clients-js/client-calendar.js";

function ensureHiddenFumigatorSelect(fumigatorId) {
    let fumigatorSelect = document.getElementById("fumigator");

    // En fumigator.html no existe este select, lo creamos oculto
    if (!fumigatorSelect) {
        fumigatorSelect = document.createElement("select");
        fumigatorSelect.id = "fumigator";
        fumigatorSelect.style.display = "none";
        document.body.appendChild(fumigatorSelect);
    }

    fumigatorSelect.innerHTML = "";
    const opt = document.createElement("option");
    opt.value = String(fumigatorId);
    opt.selected = true;
    fumigatorSelect.appendChild(opt);
}

/**
 * Inicializa el calendario del modal de reprogramación del FUMIGATOR,
 * reutilizando toda la lógica de client-calendar.js
 */
export async function loadFumigatorAvailableDates(fumigatorId) {
    // nos aseguramos de que el date/time tengan los ids esperados
    const dateInput = document.getElementById("date");
    const calendarContainer = document.getElementById("custom-calendar");

    if (!dateInput || !calendarContainer) {
        console.error("❌ No se encontraron #date o #custom-calendar en el modal del fumigator.");
        return;
    }

    // ocultamos el input nativo (UX igual a cliente)
    dateInput.style.display = "none";
    calendarContainer.classList.add("custom-calendar");

    // select oculto con el fumigatorId para que el calendario del cliente lo lea
    ensureHiddenFumigatorSelect(fumigatorId);

    // Esto calcula disponibilidades, appointments y arma el calendario custom
    await loadAvailableDatesAndTimes(fumigatorId);
}

export async function loadFumigatorAvailableTimes(fumigatorId, selectedDate) {
    ensureHiddenFumigatorSelect(fumigatorId);
    await loadAvailableTimes(fumigatorId, selectedDate);
}
