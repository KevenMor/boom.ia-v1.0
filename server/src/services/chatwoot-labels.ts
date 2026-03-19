/**
 * Serviço para etiquetagem de leads no Chatwoot.
 * Criação sob demanda (lazy): a etiqueta do dia é criada na primeira vez que marcar_lead for chamado.
 */

import { getChatwootAuthHeaders } from "./delivery.js";

export interface ChatwootLabelConfig {
  chatwoot_url: string;
  chatwoot_api_token: string;
  chatwoot_account_id: number | string;
  chatwoot_use_bearer?: boolean;
  chatwoot_auth_style?: string;
}

/** Formato da etiqueta: leadsDD-MM-YYYY (Brasília) */
function getLeadLabelTitle(): string {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const parts = formatter.formatToParts(new Date());
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const year = parts.find((p) => p.type === "year")?.value ?? String(new Date().getFullYear());
  return `leads${day}-${month}-${year}`;
}

function buildBaseUrl(config: ChatwootLabelConfig): string {
  const url = (config.chatwoot_url || "").replace(/\/+$/, "");
  const accountId = config.chatwoot_account_id;
  return `${url}/api/v1/accounts/${accountId}`;
}

function getAuthHeaders(config: ChatwootLabelConfig): Record<string, string> {
  const auth = getChatwootAuthHeaders(config.chatwoot_api_token, config as unknown as Record<string, unknown>);
  return { "Content-Type": "application/json", ...auth };
}

/**
 * Verifica se a etiqueta do dia existe no Chatwoot. Se não existir, cria.
 * Retorna o título da etiqueta (ex.: leads18-03-2026).
 */
export async function ensureLeadLabelExists(config: ChatwootLabelConfig): Promise<string> {
  const title = getLeadLabelTitle();
  const baseUrl = buildBaseUrl(config);
  const headers = getAuthHeaders(config);

  // GET /labels - listar etiquetas existentes
  const listRes = await fetch(`${baseUrl}/labels`, { headers });
  if (!listRes.ok) {
    const errText = await listRes.text();
    throw new Error(`Chatwoot GET labels failed (${listRes.status}): ${errText.slice(0, 200)}`);
  }

  const listData = (await listRes.json()) as {
    payload?: Array<string | { title?: string; name?: string }>;
  };
  const rawLabels = Array.isArray(listData?.payload) ? listData.payload : [];
  const labelTitles = rawLabels.map((l) =>
    typeof l === "string" ? l : (l?.title || l?.name || "")
  );
  const exists = labelTitles.includes(title);
  if (exists) return title;

  // POST /labels - criar etiqueta (Rails: params.require(:label).permit(...))
  const createRes = await fetch(`${baseUrl}/labels`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      label: {
        title,
        description: "novos leads do dia",
        color: "#6233D0",
        show_on_sidebar: true,
      },
    }),
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Chatwoot POST labels failed (${createRes.status}): ${errText.slice(0, 200)}`);
  }

  return title;
}

/**
 * Garante que a etiqueta do dia existe e aplica à conversa no Chatwoot.
 * O Chatwoot substitui as labels ao fazer POST, então obtemos as atuais e fazemos merge.
 * Retorna o título da etiqueta aplicada (ex.: leads18-03-2026).
 */
export async function addLeadLabelToConversation(
  config: ChatwootLabelConfig,
  chatwootConversationId: number
): Promise<string> {
  const title = await ensureLeadLabelExists(config);
  const baseUrl = buildBaseUrl(config);
  const headers = getAuthHeaders(config);

  // GET labels atuais (API retorna { payload: ["label1", "label2"] })
  let existingLabels: string[] = [];
  const getRes = await fetch(`${baseUrl}/conversations/${chatwootConversationId}/labels`, { headers });
  if (getRes.ok) {
    const getData = (await getRes.json()) as { payload?: string[] };
    existingLabels = Array.isArray(getData?.payload) ? getData.payload : [];
  }

  const labelsToSet = existingLabels.includes(title)
    ? existingLabels
    : [...existingLabels, title];

  const res = await fetch(`${baseUrl}/conversations/${chatwootConversationId}/labels`, {
    method: "POST",
    headers,
    body: JSON.stringify({ labels: labelsToSet }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Chatwoot POST conversation labels failed (${res.status}): ${errText.slice(0, 200)}`);
  }

  return title;
}
