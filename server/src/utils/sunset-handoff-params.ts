import {
  messageDeclaresLodgingReservationInterest,
} from "./sunset-lodging-params.js";
import { messageDeclaresGratitudeOrConversationClose } from "./sunset-park-params.js";

type ChatMessage = { role: string; content?: string };

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export type SunsetHandoffReason = "setor_reservas" | "excursao" | "atendimento_geral";

const HANDOFF_REASON_LABELS: Record<SunsetHandoffReason, string> = {
  setor_reservas: "Setor de reservas",
  excursao: "Excursões",
  atendimento_geral: "Setor responsável",
};

/** Cliente pediu informações sobre excursão. */
export function messageDeclaresExcursionIntent(text: string): boolean {
  const t = normalizeText(text);
  return /excurs[aã]o|excurs[oõ]es|pacote de excurs|grupo escolar|visita escolar/.test(t);
}

export function conversationDeclaresExcursionIntent(messages: ChatMessage[]): boolean {
  return messages
    .filter((m) => m.role === "user" && m.content)
    .some((m) => messageDeclaresExcursionIntent(m.content!));
}

/** Cliente pediu atendimento humano ou transferência explícita. */
export function messageDeclaresHumanAgentRequest(text: string): boolean {
  const t = normalizeText(text);
  return /falar com (um |uma )?(alguem|humano|atendente|pessoa|gerente|supervisor|responsavel)|quero (um )?atendente|me transfere|transferir (para|pra)|passa (para|pra) (um )?(humano|atendente)|atendimento humano|falar com uma pessoa/.test(
    t
  );
}

/** Assuntos fora do escopo da Julia (não cobertos no prompt). */
export function messageDeclaresOutOfScopeTopic(text: string): boolean {
  const t = normalizeText(text);
  if (
    /cancel(ar|amento)|estorno|reembolso|nota fiscal|reclam|insatisfeit|problema com (a )?reserva|trabalhar|emprego|vaga de|parceria|patrocin|evento corporativo|buffet|aniversario de 15|formatura|casamento|ingresso perdido|perdi (o )?ingresso|extravi/.test(
      t
    )
  ) {
    return true;
  }
  if (/nao (sei|consigo)|fora do (seu )?escopo|outro assunto|assunto diferente/.test(t) && t.length < 120) {
    return true;
  }
  return false;
}

export function resolveSunsetHandoffReason(messages: ChatMessage[]): SunsetHandoffReason | null {
  const lastUser = [...messages].reverse().find((m) => m.role === "user" && m.content?.trim());
  if (!lastUser?.content) return null;
  const text = lastUser.content;

  if (messageDeclaresGratitudeOrConversationClose(text)) return null;

  if (messageDeclaresExcursionIntent(text) || conversationDeclaresExcursionIntent(messages)) {
    return "excursao";
  }

  if (messageDeclaresLodgingReservationInterest(text)) {
    return "setor_reservas";
  }

  if (messageDeclaresHumanAgentRequest(text) || messageDeclaresOutOfScopeTopic(text)) {
    return "atendimento_geral";
  }

  return null;
}

export function shouldAutoInvokeSunsetHandoff(messages: ChatMessage[]): boolean {
  return resolveSunsetHandoffReason(messages) !== null;
}

export function buildSunsetHandoffToolArgs(reason: SunsetHandoffReason): { reason: string } {
  return { reason: HANDOFF_REASON_LABELS[reason] };
}
