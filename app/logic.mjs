// Reglas de presentacion, sin asumir que los procesos del servidor estan activos.
export function madridHour(when = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(when);
  return Number(parts.find((part) => part.type === 'hour').value);
}

export function mercadoAbierto(when = new Date()) {
  const hour = madridHour(when);
  return hour >= 6 || hour < 1; // 06:00 hasta las 00:59:59 del dia siguiente
}

export function equipoMaloAbierto(when = new Date()) {
  const hour = madridHour(when);
  return hour >= 12; // 12:00 hasta las 23:59:59
}

export function euros(centimos) {
  const n = Number(centimos);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0
  }).format(n / 100);
}
