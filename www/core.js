export function validateKickVodUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return { valid: false, reason: 'Escribe el enlace del VOD.' };
  let url; try { url = new URL(value.trim()); } catch { return { valid: false, reason: 'El enlace no tiene un formato válido.' }; }
  if (url.protocol !== 'https:' || !['kick.com', 'www.kick.com'].includes(url.hostname.toLowerCase())) return { valid: false, reason: 'Usa un enlace HTTPS de kick.com.' };
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2 || !['videos', 'video'].includes(parts[1].toLowerCase())) return { valid: false, reason: 'El enlace debe apuntar a la sección de videos de un canal.' };
  return { valid: true, normalizedUrl: url.toString() };
}
export function parseTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{1,3}:[0-5]\d:[0-5]\d$/.test(value.trim())) return null;
  const [h,m,s] = value.trim().split(':').map(Number); return h*3600+m*60+s;
}
export function validateTimeRange(start,end) {
  const a=parseTimestamp(start), b=parseTimestamp(end);
  if (a===null || b===null) return {valid:false,reason:'Usa el formato HH:MM:SS para inicio y final.'};
  if (b<=a) return {valid:false,reason:'El final debe ser posterior al inicio.'};
  return {valid:true,startSeconds:a,endSeconds:b,durationSeconds:b-a};
}
export function normalizeChannelName(value) {
  const name=String(value??'').trim().replace(/^@/,'');
  if (!/^[a-zA-Z0-9_]{1,25}$/.test(name)) return {valid:false,reason:'El usuario debe tener entre 1 y 25 letras, números o guiones bajos.'};
  return {valid:true,name:name.toLowerCase()};
}
export function formatPeriod(value,type='month') {
  if(type==='year'){const year=String(value??'').slice(0,4);return /^\d{4}$/.test(year)?year:'PERIODO';}
  const match=/^(\d{4})-(\d{2})$/.exec(String(value??''));
  if(!match||Number(match[2])<1||Number(match[2])>12)return 'PERIODO';
  return new Intl.DateTimeFormat('es-MX',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(Number(match[1]),Number(match[2])-1,1))).replace('.','').toUpperCase();
}
