const z = n => String(n).padStart(2, '0');
export const iso = d => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
export const hoy = () => iso(new Date());
const parse = s => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
export const fLarga = s => parse(s).toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fCorta = s => s ? parse(s).toLocaleDateString('es-HN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
export const fDia = s => parse(s).toLocaleDateString('es-HN', { weekday: 'short', day: 'numeric', month: 'short' });

export function edad(fn) {
  const n = new Date(), b = parse(fn);
  let e = n.getFullYear() - b.getFullYear();
  if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) e--;
  if (e < 1) return ((n.getFullYear() - b.getFullYear()) * 12 + n.getMonth() - b.getMonth()) + ' meses';
  return e + ' años';
}

export const ESTADOS = { programada: 'Por confirmar', confirmada: 'Confirmada', atendida: 'Atendida', cancelada: 'Cancelada', no_asistio: 'No asistió' };
export const ROLES = { admin: 'Administrador', medico: 'Médico' };
export const abierta = c => c.estado === 'programada' || c.estado === 'confirmada';

export function plazoSeg(s) {
  if (s.estado === 'agendado') return { cls: 'ok', txt: 'Agendado ' + (s.cita_fecha ? fDia(s.cita_fecha) + ' ' + s.cita_hora : '') };
  if (s.estado === 'cumplido') return { cls: 'neutral', txt: 'Cumplido' };
  if (s.estado === 'cerrado') return { cls: 'neutral', txt: 'Cerrado sin cita' };
  const n = diffDays(hoy(), s.fecha_objetivo);
  if (n < 0) return { cls: 'bad', txt: `Vencido hace ${-n} ${n === -1 ? 'día' : 'días'}` };
  if (n === 0) return { cls: 'warn', txt: 'Vence hoy' };
  if (n <= 7) return { cls: 'warn', txt: `En ${n} ${n === 1 ? 'día' : 'días'}` };
  return { cls: 'neutral', txt: `En ${n} días` };
}
