# workers

## Propósito
Workers BullMQ para processamento assíncrono — follow-ups agendados e campanhas financeiras em massa.

## Arquitetura
- Cada worker é uma função `start*Worker()` que retorna `Worker | null` (null se Redis indisponível).
- Concurrency 1 para follow-ups (evita overlap).
- Fallback: quando `REDIS_URL` ausente, `index.ts` usa `setInterval` (cron 60s) para processar a fila.
- Dependências internas: `../services/supabase.ts`, `../services/followup-queue.ts`, `../services/financeiro-campaign-*.ts`, `../routes/queue.ts`.
- Dependências externas: bullmq, ioredis.

## Arquivos-chave
| Arquivo | Responsabilidade |
|---------|-----------------|
| followup-worker.ts | Processa follow-ups no horário exato — lê `follow_up_queue`, executa, agenda próximo |
| financeiro-campaign-worker.ts | Processa campanhas financeiras com delays entre mensagens |

## Decisões técnicas
- BullMQ com delay preciso (ms) para follow-ups — mais confiável que cron para timing exato.
- Fallback cron duplica lógica mas garante funcionamento sem Redis.
- Worker de campanha usa `job.updateProgress()` para feedback em tempo real.

## Convenções
- Função exportada: `start*Worker()` — chamada em `index.ts`.
- Retorna null se Redis não configurado (graceful degradation).
- Logs com prefixo `[FollowUp-Worker]` / `[Financeiro-Campaign-Worker]`.

## Fluxos críticos
1. `Tool follow-up → follow_up_queue (DB) → addFollowUpJob (BullMQ delay) → followup-worker → processFollowUpItem → envio WAHA`
2. `Frontend campanha → financeiro-campaign-queue → worker → runFinanceiroCampaign → loop envios → persistFinanceiroCampaignRun`

## Cuidados ao modificar
- Alterações no worker devem ter equivalente no fallback cron de `index.ts`.
- Testar com e sem Redis disponível.
- Não aumentar concurrency do follow-up worker sem verificar race conditions.
- `REDIS_URL` deve ser URL completa (redis://user:pass@host:port).
