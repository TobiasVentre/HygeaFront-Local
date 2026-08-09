// Presentacion compartida de ordenes de servicio.
//
// Los tres paneles (cliente, proveedor y tecnico) muestran la misma orden con
// el mismo lenguaje: color por estado, icono, badge temporal y linea de
// progreso. Esto vivia copiado en los tres `*-main.js`, asi que cualquier
// cambio de criterio habia que hacerlo tres veces.

import { formatArgentinaDate, formatArgentinaTime, getArgentinaDateInputValue } from "./argentina-time.js";

export const ORDER_STATUS_TONES = {
  Created: "created",
  Approved: "approved",
  Confirmed: "confirmed",
  InProgress: "progress",
  Finalized: "finalized",
  Exception: "exception",
  Closed: "closed",
  1: "created",
  2: "confirmed",
  3: "progress",
  4: "finalized",
  5: "exception",
  6: "closed",
  7: "approved"
};

export const ORDER_STATUS_ICONS = {
  created: "fa-file-circle-plus",
  approved: "fa-circle-check",
  confirmed: "fa-calendar-check",
  progress: "fa-spray-can",
  finalized: "fa-flag-checkered",
  exception: "fa-triangle-exclamation",
  closed: "fa-lock"
};

export const ORDER_PROGRESS_STEPS = [
  { tone: "created", label: "Creada" },
  { tone: "approved", label: "Aprobada" },
  { tone: "confirmed", label: "Confirmada" },
  { tone: "progress", label: "En ejecucion" },
  { tone: "finalized", label: "Finalizada" }
];

export const ORDER_PROGRESS_RANKS = {
  created: 0,
  approved: 1,
  confirmed: 2,
  progress: 3,
  finalized: 4,
  closed: 5,
  exception: -1
};

export function getOrderStatusTone(status) {
  return ORDER_STATUS_TONES[status] || "created";
}

export function getOrderStatusIcon(status) {
  return ORDER_STATUS_ICONS[getOrderStatusTone(status)] || "fa-circle-info";
}

export function getOrderProgressRank(status) {
  const rank = ORDER_PROGRESS_RANKS[getOrderStatusTone(status)];
  return Number.isInteger(rank) ? rank : 0;
}

export function formatCompactDuration(totalMinutes) {
  const normalizedMinutes = Math.max(0, Math.round(Number(totalMinutes || 0)));
  if (normalizedMinutes <= 0) return "Sin duracion";

  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;

  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
}

export function getOrderDurationMinutes(order) {
  const start = new Date(order?.scheduledStartAtUtc);
  const end = new Date(order?.scheduledEndAtUtc);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}

export function getDayOffsetFromToday(value) {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const [targetYear, targetMonth, targetDay] = getArgentinaDateInputValue(date).split("-").map(Number);
  const [todayYear, todayMonth, todayDay] = getArgentinaDateInputValue().split("-").map(Number);

  return Math.round((Date.UTC(targetYear, targetMonth - 1, targetDay) - Date.UTC(todayYear, todayMonth - 1, todayDay)) / 86400000);
}

// `compact` acorta las etiquetas para las tarjetas del tecnico, donde el
// contexto ya es una visita ("Vencida ayer" en vez de "Visita vencida ayer").
export function getOrderTimingBadge(order, { compact = false } = {}) {
  const dayOffset = getDayOffsetFromToday(order?.scheduledStartAtUtc);
  if (dayOffset === null) return null;

  const tone = getOrderStatusTone(order?.status);

  if (tone === "finalized" || tone === "closed" || tone === "exception") {
    if (dayOffset > 0) return { tone: "neutral", icon: "fa-calendar-day", label: `Agendada en ${dayOffset} dias` };
    if (dayOffset === 0) return { tone: "neutral", icon: "fa-clock-rotate-left", label: "Visita de hoy" };
    if (dayOffset === -1) return { tone: "neutral", icon: "fa-clock-rotate-left", label: "Visita de ayer" };
    return { tone: "neutral", icon: "fa-clock-rotate-left", label: `Hace ${Math.abs(dayOffset)} dias` };
  }

  if (dayOffset < 0) {
    const prefix = compact ? "Vencida" : "Visita vencida";
    return {
      tone: "late",
      icon: "fa-triangle-exclamation",
      label: dayOffset === -1 ? `${prefix} ayer` : `${prefix} hace ${Math.abs(dayOffset)} dias`
    };
  }

  if (dayOffset === 0) {
    const time = formatArgentinaTime(order.scheduledStartAtUtc, { hourCycle: "h23" });
    return { tone: "today", icon: "fa-bolt", label: compact ? `Hoy ${time}` : `Visita hoy ${time}` };
  }

  if (dayOffset === 1) {
    return {
      tone: "soon",
      icon: "fa-hourglass-half",
      label: `Visita el ${formatArgentinaDate(order.scheduledStartAtUtc, { weekday: "long", day: undefined, month: undefined })}`
    };
  }

  return { tone: dayOffset <= 7 ? "soon" : "neutral", icon: "fa-calendar-day", label: `En ${dayOffset} dias` };
}

export function getInitials(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);

  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

// El markup del progreso es identico salvo el prefijo de clases que usa cada
// panel; se parametriza en vez de duplicarlo.
export function renderOrderProgressTrack(order, { prefix, statusLabel, escapeHtml }) {
  const tone = getOrderStatusTone(order.status);
  if (tone === "exception") return "";

  const currentRank = getOrderProgressRank(order.status);
  const isClosed = tone === "closed";
  const lastStepIndex = ORDER_PROGRESS_STEPS.length - 1;

  const steps = ORDER_PROGRESS_STEPS.map((step, index) => {
    const isDone = isClosed || index < currentRank;
    const isCurrent = !isClosed && index === currentRank;
    const label = isClosed && index === lastStepIndex ? "Cerrada" : step.label;

    return `
      <li class="${prefix}__step ${isDone ? "is-done" : isCurrent ? "is-current" : ""}">
        <span class="${prefix}__dot" aria-hidden="true"></span>
        <span class="${prefix}__label">${escapeHtml(label)}</span>
      </li>
    `;
  }).join("");

  const completedRatio = isClosed ? 1 : Math.min(1, Math.max(0, currentRank / lastStepIndex));
  const currentStepNumber = Math.min(ORDER_PROGRESS_STEPS.length, currentRank + 1);

  return `
    <div class="${prefix}" style="--order-progress: ${completedRatio.toFixed(2)}">
      <ol class="${prefix}__steps" aria-label="Progreso de la orden">
        ${steps}
      </ol>
      <p class="${prefix}__caption">
        Paso ${currentStepNumber} de ${ORDER_PROGRESS_STEPS.length} &middot; <strong>${escapeHtml(statusLabel)}</strong>
      </p>
    </div>
  `;
}
