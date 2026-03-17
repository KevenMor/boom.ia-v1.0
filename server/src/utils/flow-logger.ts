/**
 * Logs estruturados para fluxo de mensagens e follow-ups.
 * Formato: [TAG] contexto | status | detalhe
 * Objetivo: ler uma linha e entender o que aconteceu.
 */

const shortId = (id: string | undefined | null) => (id ? `${String(id).slice(0, 8)}…` : "—");

export const msgLog = {
  /** Webhook recebeu mensagem e disparou para queue */
  webhookQueued: (agentId: string, reason?: string) =>
    console.log(`[MSG] agent=${shortId(agentId)} | webhook→queue | OK (queued)${reason ? ` ${reason}` : ""}`),

  webhookQueueTimeout: (agentId: string) =>
    console.log(`[MSG] agent=${shortId(agentId)} | webhook→queue | OK (queued, timeout 1.5s — processamento em background)`),

  webhookQueueFailed: (agentId: string, status: number, body: string) =>
    console.warn(`[MSG] agent=${shortId(agentId)} | webhook→queue | ERRO status=${status} ${body.slice(0, 80)}`),

  /** Queue processou e chamou chat-local */
  queueChatOk: (agentId: string, convId: string | null) =>
    console.log(`[MSG] agent=${shortId(agentId)} conv=${shortId(convId)} | queue→chat | OK`),

  queueChatFailed: (agentId: string, err: string) =>
    console.error(`[MSG] agent=${shortId(agentId)} | queue→chat | ERRO ${err.slice(0, 100)}`),

  queueContentEmpty: (agentId: string) =>
    console.warn(`[MSG] agent=${shortId(agentId)} | queue | fullContent vazio — usando fallback`),

  /** Delivery enviou ao Chatwoot */
  deliveryOk: (agentId: string, convId: string | null) =>
    console.log(`[MSG] agent=${shortId(agentId)} conv=${shortId(convId)} | delivery→chatwoot | OK (sent)`),

  deliveryFallback: (agentId: string) =>
    console.warn(`[MSG] agent=${shortId(agentId)} | delivery→chatwoot | FALLBACK (resposta vazia)`),

  /** Chat-local — início e fim */
  chatStart: (agentId: string, model: string, mode: "dual" | "single") =>
    console.log(`[MSG] agent=${shortId(agentId)} | chat-local | start | model=${model} ${mode}`),

  chatOk: (agentId: string) =>
    console.log(`[MSG] agent=${shortId(agentId)} | chat-local | OK`),

  chatError: (agentId: string, err: string) =>
    console.error(`[MSG] agent=${shortId(agentId)} | chat-local | ERRO ${err.slice(0, 80)}`),

  /** Decrypt fallback (reduzir ruído) */
  decryptFallback: (providerId: string) =>
    console.warn(`[MSG] provider=${shortId(providerId)} | decrypt falhou, usando env var`),
};

export const followupLog = {
  /** Cron: nenhum item pendente */
  cronNoPending: () =>
    console.log(`[FollowUp] cron | 0 pending`),

  /** Cron: processando */
  cronStart: (count: number) =>
    console.log(`[FollowUp] cron | ${count} items a processar`),

  /** Item processado com sucesso */
  sent: (itemId: string, convId: string, attempt: number, maxAttempts: number) =>
    console.log(`[FollowUp] item=${shortId(itemId)} conv=${shortId(convId)} attempt=${attempt}/${maxAttempts} | OK (sent)`),

  /** Próximo agendado */
  nextScheduled: (convId: string, nextAttempt: number, maxAttempts: number, delayMin: number) =>
    console.log(`[FollowUp] conv=${shortId(convId)} | próximo agendado attempt ${nextAttempt}/${maxAttempts} em ${delayMin}min`),

  /** Cancelado (com motivo) */
  cancelled: (itemId: string, reason: string, detail?: string) =>
    console.log(`[FollowUp] item=${shortId(itemId)} | CANCELLED (${reason})${detail ? ` ${detail}` : ""}`),

  /** Reagendado (quiet hours) */
  rescheduled: (itemId: string, reason: string) =>
    console.log(`[FollowUp] item=${shortId(itemId)} | REAGENDADO (${reason})`),

  /** Erro ao processar */
  error: (itemId: string, convId: string, attempt: number, maxAttempts: number, reason: string) =>
    console.error(`[FollowUp] item=${shortId(itemId)} conv=${shortId(convId)} attempt=${attempt}/${maxAttempts} | ERRO (${reason})`),

  /** Erro ao buscar pendentes */
  fetchFailed: (err: string) =>
    console.error(`[FollowUp] cron | ERRO fetch ${err}`),
};
