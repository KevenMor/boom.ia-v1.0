import {
  messageDeclaresLodgingReservationInterest,
  messageDeclaresMultiFamilyLodgingGroup,
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

  // "6 ou 7 famílias" em hospedagem ≠ excursão (regressão Ariane jul/2026)
  if (messageDeclaresMultiFamilyLodgingGroup(text)) {
    // segue: pode cair em reservas só se houver interesse explícito depois
  } else if (messageDeclaresExcursionIntent(text) || conversationDeclaresExcursionIntent(messages)) {
    return "excursao";
  }

  if (messageDeclaresLodgingReservationInterest(text)) {
    return "setor_reservas";
  }

  // Confirmação curta / escolha após interesse em reservar já declarado no fio
  if (
    conversationDeclaresLodgingReservationInterest(messages) &&
    messageLooksLikeHandoffConfirmation(text)
  ) {
    return "setor_reservas";
  }

  if (messageDeclaresHumanAgentRequest(text) || messageDeclaresOutOfScopeTopic(text)) {
    return "atendimento_geral";
  }

  return null;
}

/** Já houve interesse explícito em reservar em alguma mensagem do usuário. */
export function conversationDeclaresLodgingReservationInterest(messages: ChatMessage[]): boolean {
  return messages
    .filter((m) => m.role === "user" && m.content)
    .some((m) => messageDeclaresLodgingReservationInterest(m.content!));
}

/** Confirmação curta que, no fio de reserva, deve fechar handoff. */
export function messageLooksLikeHandoffConfirmation(text: string): boolean {
  const t = normalizeText(text).trim();
  if (!t || t.length > 80) return false;
  return /^(sim|ok|pode|pode ser|vamos|fechou|fechamos|quero|isso|certeza|perfeito|otimo|bom|manda|segue|encaminha|pode encaminhar)([!.?…]|\s|$)/.test(
    t
  );
}

/**
 * Julia anunciou encaminhamento no texto (sem tool). Usado como rede de segurança pós-resposta.
 */
export function assistantAnnouncesSunsetHandoff(text: string): boolean {
  const t = normalizeText(text);
  return (
    /vou (te )?encaminhar|encaminhar (para|pro|ao) (o )?setor|setor de reservas dar continuidade|setor responsavel/.test(
      t
    ) && /encaminh|setor|reserva|humano|atendente/.test(t)
  );
}

export function resolveSunsetHandoffReasonFromAssistantText(text: string): SunsetHandoffReason {
  const t = normalizeText(text);
  if (/excurs/.test(t)) return "excursao";
  if (/reserva/.test(t)) return "setor_reservas";
  return "atendimento_geral";
}

export function shouldAutoInvokeSunsetHandoff(messages: ChatMessage[]): boolean {
  return resolveSunsetHandoffReason(messages) !== null;
}

export function buildSunsetHandoffToolArgs(reason: SunsetHandoffReason): { reason: string } {
  return { reason: HANDOFF_REASON_LABELS[reason] };
}
