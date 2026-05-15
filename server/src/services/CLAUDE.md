# services

## Propósito
Camada de lógica de negócio do backend — implementa tools do agente, integrações externas, delivery de mensagens, criptografia e controle de módulos.

## Arquitetura
- Padrão: serviços como funções exportadas (não classes). Cada arquivo = um domínio.
- Fluxo principal: `chat-local.ts` chama `tool-executor.ts` que despacha para serviços específicos (fipe, omnibees, lodging, etc.).
- Dependências internas: `../utils/*`, `../config/env.ts`, `../lib/*`.
- Dependências externas: @supabase/supabase-js, undici (fetch), bullmq, crypto (Node).

## Arquivos-chave
| Arquivo | Responsabilidade |
|---------|-----------------|
| tool-executor.ts | Engine de execução de tools — despacha consultar_estoque, consultar_fipe, consultar_disponibilidade, consultar_hospedagem, consultar_unidade, notificar_agendamento, handoff, enviar_galeria, marcar_lead, chatwoot_assign |
| supabase.ts | Factory createNexusClient() — cria cliente Supabase com service role key |
| crypto.ts | encrypt/decrypt de API keys usando ENCRYPTION_KEY (AES) |
| delivery.ts | Entrega de mensagens ao Chatwoot/WAHA com humanização (jitter delays entre partes) |
| waha.ts | Cliente WAHA WhatsApp API |
| provider-api.ts | Abstração de chamada ao provider LLM (OpenAI/Gemini) |
| fipe.ts | Integração API FIPE (preços de veículos) |
| omnibees-availability.ts | Consulta disponibilidade hoteleira via Omnibees |
| find-nearest-unit.ts | Unidade mais próxima (Google Maps API ou Haversine fallback) |
| lodging-consulta.ts | Consulta de disponibilidade de hospedagem interna |
| chatwoot-labels.ts | Adiciona labels em conversas Chatwoot |
| tenant-modules.ts | Verifica se módulo está habilitado para tenant |
| tenant-ai-global.ts | Toggle global de IA por tenant |
| authorization.ts | Verificações de auth/permissão |
| followup-guard.ts | Guard de deduplicação de follow-ups |
| followup-queue.ts | Agendamento de jobs BullMQ para follow-ups |
| financeiro-campaign-runner.ts | Execução de campanhas financeiras |
| financeiro-campaign-queue.ts | Fila BullMQ para campanhas |
| financeiro-campaign-persist.ts | Persistência de resultados de campanha |
| financeiro-campaign-memory.ts | Memória de campanhas (evita duplicação) |
| crm-contact-sync.ts | Upsert de contatos no CRM |
| audit.ts | Logging de auditoria |
| transcribe.ts | Transcrição de áudio |
| extractDocument.ts | Extração de documentos de mensagens |
| rag-ingest-vicentim.ts | Ingestão RAG para tenant específico |
| video-url-probe.ts | Probe de URLs de vídeo |
| ack-recovery.ts | Recovery de ACKs perdidos |

## Decisões técnicas
- `tool-executor.ts` usa normalização de busca (NFD + lowercase) para inventário — suporta sinônimos de cor e tipo de veículo.
- Criptografia AES para API keys — nunca armazenadas em texto plano no banco.
- Delivery com jitter (humanização) — simula digitação humana para não parecer bot.
- Google Maps API é opcional — fallback Haversine quando `GOOGLE_MAPS_API_KEY` ausente.
- Omnibees usa scraping/API proprietária — frágil a mudanças no provider.

## Convenções
- Funções nomeadas com prefixo do domínio: `run*`, `execute*`, `create*`.
- Testes lado-a-lado: `*.test.ts`.
- Erros retornados como `{ success: false, error: string }` (não throw).

## Fluxos críticos
1. `chat-local → executeTool(toolDef, args) → switch(tool_type) → serviço específico → ToolExecutionResult`
2. `delivery.ts → sendChatwootTextMessage/sendChatwootImageMessage → Chatwoot API → applyJitter entre partes`
3. `financeiro-campaign-runner → loop contacts → send via WAHA → persist results`

## Cuidados ao modificar
- `tool-executor.ts` é o arquivo mais complexo — testar com `npm run test` obrigatoriamente.
- Não alterar interface `ToolExecutionResult` sem atualizar `chat-local.ts`.
- `crypto.ts` — nunca logar keys descriptografadas.
- `delivery.ts` — alterações afetam TODOS os tenants imediatamente.
- Omnibees pode quebrar sem aviso (API externa não documentada).
