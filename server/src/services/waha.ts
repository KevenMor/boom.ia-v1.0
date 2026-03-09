/**
 * Envio de mensagens via WAHA (WhatsApp HTTP API).
 * Usado por contacts (novo contato, mensagem do operador) e reminders.
 */
export async function sendViaWaha(
  wahaUrl: string,
  wahaApiKey: string,
  wahaSession: string,
  phone: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  const baseUrl = wahaUrl.replace(/\/+$/, "");
  const chatId = phone.includes("@") ? phone : `${phone}@c.us`;
  try {
    const resp = await fetch(`${baseUrl}/api/sendText`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(wahaApiKey ? { "X-Api-Key": wahaApiKey } : {}) },
      body: JSON.stringify({ session: wahaSession || "default", chatId, text: message }),
    });
    if (resp.ok) return { ok: true };
    return { ok: false, error: await resp.text() };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
