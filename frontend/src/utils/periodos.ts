export const fechaGuatemala = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Guatemala',
  dateStyle: 'short',
});

export function rangoActual(periodo: 'dia' | 'semana' | 'mes') {
  const hasta = fechaGuatemala.format(new Date());
  if (periodo === 'dia') return { desde: hasta, hasta };
  if (periodo === 'mes') return { desde: `${hasta.slice(0, 7)}-01`, hasta };
  const lunes = new Date(`${hasta}T00:00:00Z`);
  lunes.setUTCDate(lunes.getUTCDate() - ((lunes.getUTCDay() + 6) % 7));
  return { desde: lunes.toISOString().slice(0, 10), hasta };
}
