const dateFormatter = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const dateTimeFormatter = new Intl.DateTimeFormat('es-CO', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** Fecha sin hora ("2026-10-15") → "15 oct 2026". Se usa UTC para no correr el día. */
export function formatDate(isoDate: string): string {
  return dateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

/** Fecha y hora ISO → hora local del usuario. */
export function formatDateTime(isoDateTime: string): string {
  return dateTimeFormatter.format(new Date(isoDateTime));
}

/** "YYYY-MM-DD" de hoy en la zona horaria del usuario. */
export function todayIso(now: Date = new Date()): string {
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

/** Días entre dos fechas "YYYY-MM-DD" (positivo si `to` es posterior). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Fecha límite en lenguaje natural: "Vence en 2 días", "Vence hoy", "Vencida hace 3 días". */
export function dueRelative(dueDate: string | null, today: string = todayIso()): string {
  if (!dueDate) return 'Sin fecha límite';
  const days = daysBetween(today, dueDate);
  if (days === 0) return 'Vence hoy';
  if (days === 1) return 'Vence mañana';
  if (days > 1) return `Vence en ${String(days)} días`;
  return days === -1 ? 'Venció ayer' : `Vencida hace ${String(-days)} días`;
}

export type DueState = 'overdue' | 'today' | null;

export function dueState(dueDate: string | null, today: string = todayIso()): DueState {
  if (!dueDate) return null;
  if (dueDate < today) return 'overdue';
  return dueDate === today ? 'today' : null;
}
