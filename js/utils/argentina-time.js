export const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";
const ARGENTINA_OFFSET_MINUTES = -3 * 60;

function pad(value) {
  return String(value).padStart(2, "0");
}

function parseDateInput(dateValue) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateValue || "").trim());
  if (!match) {
    throw new Error("Fecha invalida. Se esperaba formato YYYY-MM-DD.");
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function parseTimeInput(timeValue) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(timeValue || "").trim());
  if (!match) {
    throw new Error("Hora invalida. Se esperaba formato HH:mm.");
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2])
  };
}

function getFormatterParts(value, options) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ARGENTINA_TIME_ZONE,
    ...options
  });

  return formatter.formatToParts(new Date(value)).reduce((accumulator, part) => {
    if (part.type !== "literal") {
      accumulator[part.type] = part.value;
    }

    return accumulator;
  }, {});
}

export function argentinaDateTimeToUtcDate(dateValue, timeValue) {
  const { year, month, day } = parseDateInput(dateValue);
  const { hour, minute } = parseTimeInput(timeValue);
  const utcMillis = Date.UTC(year, month - 1, day, hour, minute, 0, 0) - ARGENTINA_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcMillis);
}

export function argentinaDateTimeToUtcIso(dateValue, timeValue) {
  return argentinaDateTimeToUtcDate(dateValue, timeValue).toISOString();
}

export function addMinutesUtcIso(utcValue, minutesToAdd) {
  const date = new Date(utcValue);
  return new Date(date.getTime() + minutesToAdd * 60 * 1000).toISOString();
}

export function formatArgentinaDateTime(value, options = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("es-AR", {
    timeZone: ARGENTINA_TIME_ZONE,
    ...options
  }).format(date);
}

export function formatArgentinaDate(value, options = {}) {
  return formatArgentinaDateTime(value, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    ...options
  });
}

export function formatArgentinaTime(value, options = {}) {
  return formatArgentinaDateTime(value, {
    hour: "2-digit",
    minute: "2-digit",
    ...options
  });
}

export function getArgentinaDateInputValue(value = new Date()) {
  const parts = getFormatterParts(value, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getArgentinaTimeInputValue(value) {
  const parts = getFormatterParts(value, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });

  return `${parts.hour}:${parts.minute}`;
}

export function shiftArgentinaDate(dateValue, days) {
  const { year, month, day } = parseDateInput(dateValue);
  const shifted = new Date(Date.UTC(year, month - 1, day + days, 0, 0, 0, 0));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

export function getArgentinaRangeStartUtcIso(daysFromToday = 0) {
  const dateValue = shiftArgentinaDate(getArgentinaDateInputValue(), daysFromToday);
  return argentinaDateTimeToUtcIso(dateValue, "00:00");
}

export function getArgentinaRangeEndUtcIso(daysFromToday = 0) {
  const dateValue = shiftArgentinaDate(getArgentinaDateInputValue(), daysFromToday);
  return argentinaDateTimeToUtcIso(dateValue, "23:59");
}
