export const fechaGuatemala = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Guatemala',
  dateStyle: 'short',
});

export function rangoMes(mes: string) {
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(mes)) return { desde: '', hasta: '' };
  const ultimoDia = new Date(`${mes}-01T00:00:00Z`);
  ultimoDia.setUTCMonth(ultimoDia.getUTCMonth() + 1, 0);
  return { desde: `${mes}-01`, hasta: ultimoDia.toISOString().slice(0, 10) };
}

export function rangoActual(periodo: 'dia' | 'semana' | 'mes') {
  const hasta = fechaGuatemala.format(new Date());
  if (periodo === 'dia') return { desde: hasta, hasta };
  if (periodo === 'mes') return { desde: `${hasta.slice(0, 7)}-01`, hasta };
  const lunes = new Date(`${hasta}T00:00:00Z`);
  lunes.setUTCDate(lunes.getUTCDate() - ((lunes.getUTCDay() + 6) % 7));
  return { desde: lunes.toISOString().slice(0, 10), hasta };
}
