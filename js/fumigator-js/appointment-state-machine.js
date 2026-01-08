// =============================================
// APPOINTMENT STATE MACHINE (FUMIGATOR)
// =============================================

// Estados definitivos: no admiten cambios
export const FINAL_STATES = ["COMPLETED", "CANCELLED", "NO_SHOW"];

// Evaluar si un estado es final
export function isFinalState(state) {
    if (!state) return false;
    return FINAL_STATES.includes(state.toUpperCase());
}

// Transiciones válidas para el FUMIGATOR
export function getAllowedTransitionsFrom(state) {
    state = (state || "").toUpperCase();

    switch (state) {
        case "SCHEDULED":
            return ["CONFIRMED", "CANCELLED", "RESCHEDULED"];

        case "CONFIRMED":
            return ["IN_PROGRESS", "CANCELLED", "RESCHEDULED"];

        case "IN_PROGRESS":
            return ["COMPLETED", "NO_SHOW"];

        case "COMPLETED":
        case "CANCELLED":
        case "NO_SHOW":
            return []; // Final → no transiciones

        default:
            return [];
    }
}

// Validación de transición
export function canTransition(current, next) {
    if (!current || !next) return false;
    return getAllowedTransitionsFrom(current).includes(next);
}

// Validación por rol
export function canFumigatorEditState(state) {
    return !isFinalState(state);
}
