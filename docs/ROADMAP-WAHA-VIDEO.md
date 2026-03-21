# Roadmap — Envio de vídeo via WAHA (vídeo nativo em vez de documento)

Enviar vídeos de inventário diretamente pela API do WAHA para manter como **vídeo** (reprodução nativa) em vez de documento, inclusive acima de 16MB.

**Status:** ⬜ Pendente

---

## Contexto

- **Situação atual:** O envio passa pelo Chatwoot → API do WhatsApp. Vídeos até 16MB vão como vídeo; acima disso o código envia como `application/octet-stream` (documento).
- **Problema:** Vídeos >16MB chegam como arquivo, não como vídeo reproduzível.
- **Solução:** WAHA tem `POST /api/sendVideo` que envia como vídeo nativo. Usa WhatsApp Web (pode aceitar até ~64MB como vídeo).

---

## Tarefas

| # | Tarefa | Status |
|---|--------|--------|
| 1 | Criar `sendVideoViaWaha()` em `server/src/services/waha.ts` | ⬜ |
| 2 | Integrar no fluxo de delivery quando WAHA configurado + `external_user_id` | ⬜ |
| 3 | Garantir conversão de link Google Drive → URL direta (`toDirectDownloadUrl`) | ⬜ |
| 4 | Fallback: se WAHA falhar, manter envio via Chatwoot (ou link) | ⬜ |
| 5 | Testar vídeos 16–64MB via WAHA | ⬜ |

---

## Referências

- WAHA docs: `POST /api/sendVideo` com `file.url`, `file.mimetype`, `file.filename`
- `server/src/services/waha.ts` — hoje só `sendViaWaha` (texto)
- `server/src/services/delivery.ts` — `sendChatwootVideoMessage` (lógica atual)
- `server/src/utils/videoUrl.ts` — `toDirectDownloadUrl` para Google Drive
