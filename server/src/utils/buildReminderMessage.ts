/**
 * Monta mensagem de lembrete a partir de template.
 * Placeholders: {titulo}, {horario}, {data}, {hora}
 * Formato pt-BR, timezone America/Sao_Paulo.
 */
export function buildReminderMessage(
  template: string,
  eventTitle: string,
  eventStartAt: string
): string {
  const startDate = new Date(eventStartAt);
  const timeStr = startDate.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  const dateStr = startDate.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo",
  });

  return template
    .replace(/\{titulo\}/gi, eventTitle)
    .replace(/\{horario\}/gi, timeStr)
    .replace(/\{data\}/gi, dateStr)
    .replace(/\{hora\}/gi, timeStr);
}
