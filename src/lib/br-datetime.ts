/** Formata dígitos enquanto o utilizador escreve: dd/mm/aaaa */
export function formatBrDateInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/** Formata dígitos: hh:mm (24h) */
export function formatBrTimeInput(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}:${d.slice(2, 4)}`;
}

/** Converte data/hora em formato brasileiro para ISO (UTC local do browser). */
export function parseBrDateTimeToIso(dateBr: string, timeBr: string): string | null {
  const dateTrim = dateBr.trim();
  const timeTrim = timeBr.trim();
  const dm = dateTrim.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!dm) return null;
  const day = parseInt(dm[1], 10);
  const month = parseInt(dm[2], 10);
  const year = parseInt(dm[3], 10);
  const tm = timeTrim.match(/^(\d{1,2}):(\d{2})$/);
  if (!tm) return null;
  let hour = parseInt(tm[1], 10);
  const minute = parseInt(tm[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
  return dt.toISOString();
}

/** A partir de ISO, devolve strings para inputs dd/mm/aaaa e hh:mm (hora local). */
export function isoToBrDateAndTime(iso: string): { dateBr: string; timeBr: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { dateBr: "", timeBr: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    dateBr: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    timeBr: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}
