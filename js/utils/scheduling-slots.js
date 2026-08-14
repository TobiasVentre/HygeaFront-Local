/**
 * Calculo de horarios libres a partir de la disponibilidad de los tecnicos.
 *
 * Vive aparte porque lo usan dos paneles: el cliente al pedir un servicio y la
 * entidad proveedora al cargar una orden en nombre de un cliente. Son la misma
 * cuenta y tienen que dar el mismo resultado.
 */

/** Cada cuantos minutos se ofrece un horario de arranque. */
export const SUGGESTION_STEP_MINUTES = 30;

/** Reservas que ocupan la agenda del tecnico. El backend responde el estado
 *  como numero o como texto segun el endpoint, asi que se contemplan los dos. */
const ACTIVE_RESERVATION_STATUSES = new Set([1, 2, 3, "Created", "Confirmed", "InProgress"]);
export function overlapsPeriod(startAtUtc, endAtUtc, period) {
  const periodStart = new Date(period.startAtUtc ?? period.StartAtUtc);
  const periodEnd = new Date(period.endAtUtc ?? period.EndAtUtc);
  const candidateStart = new Date(startAtUtc);
  const candidateEnd = new Date(endAtUtc);

  return periodStart < candidateEnd && candidateStart < periodEnd;
}

export function buildSuggestedSlots(technicians, snapshotsByTechnician, durationMinutes) {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    return [];
  }

  const suggestions = new Map();
  const now = new Date();

  technicians.forEach((technician, index) => {
    const technicianId = technician.id ?? technician.Id;
    const snapshot = snapshotsByTechnician[index] || {};
    const slots = snapshot.availability || [];
    const absences = snapshot.absences || [];
    const reservations = (snapshot.reservations || []).filter((reservation) => {
      const status = reservation.status ?? reservation.Status;
      return ACTIVE_RESERVATION_STATUSES.has(status);
    });

    slots.forEach((rawSlot) => {
      const slot = {
        id: rawSlot.id ?? rawSlot.Id,
        startAtUtc: rawSlot.startAtUtc ?? rawSlot.StartAtUtc,
        endAtUtc: rawSlot.endAtUtc ?? rawSlot.EndAtUtc
      };

      const slotStart = new Date(slot.startAtUtc);
      const slotEnd = new Date(slot.endAtUtc);

      for (let cursor = new Date(slotStart); cursor.getTime() + durationMinutes * 60000 <= slotEnd.getTime(); cursor = new Date(cursor.getTime() + SUGGESTION_STEP_MINUTES * 60000)) {
        const startAtUtc = cursor.toISOString();
        const endAtUtc = new Date(cursor.getTime() + durationMinutes * 60000).toISOString();

        if (new Date(endAtUtc) <= now) continue;
        if (absences.some((absence) => overlapsPeriod(startAtUtc, endAtUtc, absence))) continue;
        if (reservations.some((reservation) => overlapsPeriod(startAtUtc, endAtUtc, reservation))) continue;

        const key = `${startAtUtc}|${endAtUtc}`;
        if (!suggestions.has(key)) {
          suggestions.set(key, {
            startAtUtc,
            endAtUtc,
            technicianIds: new Set()
          });
        }

        suggestions.get(key).technicianIds.add(technicianId);
      }
    });
  });

  return Array.from(suggestions.values())
    .map((slot) => ({
      startAtUtc: slot.startAtUtc,
      endAtUtc: slot.endAtUtc,
      availableTechnicianCount: slot.technicianIds.size
    }))
    .sort((left, right) => new Date(left.startAtUtc) - new Date(right.startAtUtc));
}
