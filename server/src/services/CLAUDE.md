# services

## Propósito
Lógica de negócio: tools, integrações, delivery, crypto, embeds Chatwoot, Asaas, RAG. Funções exportadas (não classes). Tools retornam `{ success, result, error }`.

## Inventário

| Arquivo | Papel |
|---------|--------|
| tool-executor.ts | switch `tool_type` (estoque, FIPE, Omnibees, hospedagem, unidade, galeria, handoff, notificar, chatwoot_assign, park, artaxnet, lotes…) |
| supabase.ts | `createNexusClient()` |
| crypto.ts | AES API keys (`ENCRYPTION_KEY`) |
| delivery.ts | Chatwoot/WAHA + jitter |
| waha.ts / provider-api.ts | WAHA / OpenAI+Gemini |
| fipe.ts / omnibees-availability.ts / artaxnet-availability.ts | APIs externas |
| lodging-consulta.ts / park-day-consulta.ts / find-nearest-unit.ts | hospedagem / parque / geo |
| lot-status.ts | status de lotes |
| chatwoot-labels.ts / chatwoot-agent-mirror.ts / chatwoot-embed-*.ts / chatwoot-crm-embed*.ts | Chatwoot |
| crm-contact-sync.ts / contact-conversation-resolve.ts | CRM |
| asaas-client.ts / asaas-customers.ts / asaas-charges.ts | Asaas |
| followup-guard.ts / followup-queue.ts | follow-ups |
| financeiro-campaign-*.ts | campanhas em lote |
| tenant-modules.ts / tenant-ai-global.ts / authorization.ts / audit.ts | ACL / toggle / auth / logs |
| transcribe.ts / extractDocument.ts / rag-document-ingest.ts / rag-ingest-vicentim.ts | mídia + RAG |
| video-url-probe.ts / ack-recovery.ts | mídia / ACK |

## Fluxos
1. `chat-local → executeTool → serviço → ToolExecutionResult`
2. `delivery → Chatwoot/WAHA + jitter`
3. `financeiro-campaign-runner → WAHA → persist`

## Cuidados
- Nunca logar keys. Timeout em fetch externo. Omnibees é frágil.
- Não quebrar `ToolExecutionResult` sem atualizar chat-local.
- Google Maps opcional → Haversine.
