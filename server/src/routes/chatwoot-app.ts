import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";

/**
 * Rotas para o Chatwoot Dashboard App
 * Endpoint público que retorna dados da conversa Boom para iframe do Chatwoot
 */

interface DashboardAppContext {
  found: boolean;
  agent?: {
    name: string;
    avatar_url: string | null;
  };
  conversation?: {
    id: string;
    status: string;
    started_at: string;
    contact_name: string | null;
    contact_avatar_url: string | null;
  };
  messages?: Array<{
    role: string;
    content: string;
    created_at: string;
  }>;
  followups?: Array<{
    scheduled_at: string;
    status: string;
    attempt: number;
    max_attempts: number;
  }>;
  contact?: {
    name: string | null;
    phone: string | null;
    email: string | null;
    notes: string | null;
    contact_type: string | null;
    lead_status?: string | null;
  };
}

export async function chatwootAppRoutes(fastify: FastifyInstance) {
  /**
   * GET /chatwoot-app/context
   * Retorna dados da conversa para ser exibido no iframe do Chatwoot
   *
   * Query params:
   * - agent_id (UUID): ID do agente BoomIA
   * - chatwoot_conversation_id (integer): ID da conversa no Chatwoot
   * - token (string): Token de autenticação (deve estar em agents.config.dashboard_app_token)
   */
  fastify.get<{ Querystring: { agent_id?: string; chatwoot_conversation_id?: string; token?: string } }>(
    "/chatwoot-app/context",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { agent_id, chatwoot_conversation_id, token } = req.query;

      // Validações de parâmetros
      if (!agent_id || !chatwoot_conversation_id || !token) {
        return reply.status(400).send({
          error: "Missing required parameters: agent_id, chatwoot_conversation_id, token",
        });
      }

      try {
        const supabase = createNexusClient();

        // 1. Carregar dados do agente
        const { data: agentData, error: agentError } = await supabase
          .from("agents")
          .select("id, name, avatar_url, tenant_id, config")
          .eq("id", agent_id)
          .single();

        if (agentError || !agentData) {
          return reply.status(404).send({ found: false });
        }

        // 2. Validar token
        const agentConfig = agentData.config as Record<string, unknown>;
        const storedToken = agentConfig?.dashboard_app_token as string | null;

        if (!storedToken || storedToken !== token) {
          return reply.status(401).send({ error: "Invalid dashboard_app_token" });
        }

        // 3. Resolver schema do tenant
        const { data: tenantData, error: tenantError } = await supabase
          .from("tenants")
          .select("db_name")
          .eq("id", agentData.tenant_id)
          .single();

        if (tenantError || !tenantData?.db_name) {
          return reply.status(404).send({ found: false });
        }

        const schema = tenantData.db_name;
        const conversationId = parseInt(chatwoot_conversation_id, 10);

        // 4. Buscar conversa pelo chatwoot_conversation_id
        const { data: conversations, error: convError } = await supabase.rpc("list_agent_conversations", {
          p_agent_id: agent_id,
          p_limit: 100,
        });

        if (convError) {
          console.error("Error listing conversations:", convError);
          return reply.status(500).send({ found: false });
        }

        const conversation = (conversations as any[])?.find(
          (c: any) => c.chatwoot_conversation_id === conversationId
        );

        if (!conversation) {
          return reply.status(200).send({ found: false });
        }

        // 5. Carregar mensagens da conversa
        const { data: messages, error: messagesError } = await supabase.rpc("load_conversation_messages", {
          p_agent_id: agent_id,
          p_conversation_id: conversation.id,
        });

        if (messagesError) {
          console.error("Error loading messages:", messagesError);
          return reply.status(500).send({ found: false });
        }

        // 6. Carregar follow-ups pendentes
        const { data: followups, error: followupsError } = await supabase
          .from("follow_up_queue")
          .select("scheduled_at, status, attempt, max_attempts")
          .eq("agent_id", agent_id)
          .eq("conversation_id", conversation.id)
          .order("scheduled_at", { ascending: false })
          .limit(5);

        if (followupsError) {
          console.error("Error loading followups:", followupsError);
        }

        // 7. Carregar contato CRM (por chatwoot_contact_id ou por telefone)
        let contact = null;

        if (conversation.chatwoot_contact_id) {
          const { data: contactByChawootId } = await supabase
            .from("contacts")
            .select("name, phone, email, notes, contact_type, metadata")
            .eq("tenant_id", agentData.tenant_id)
            .eq("id", conversation.chatwoot_contact_id)
            .single();

          if (contactByChawootId) {
            contact = contactByChawootId;
          }
        }

        // Fallback: buscar por nome de contato (heurística)
        if (!contact && conversation.contact_name) {
          const { data: contactByName } = await supabase
            .from("contacts")
            .select("name, phone, email, notes, contact_type, metadata")
            .eq("tenant_id", agentData.tenant_id)
            .ilike("name", `%${conversation.contact_name}%`)
            .limit(1)
            .single();

          if (contactByName) {
            contact = contactByName;
          }
        }

        // 8. Montar resposta
        const response: DashboardAppContext = {
          found: true,
          agent: {
            name: agentData.name,
            avatar_url: agentData.avatar_url,
          },
          conversation: {
            id: conversation.id,
            status: conversation.status,
            started_at: conversation.started_at,
            contact_name: conversation.contact_name,
            contact_avatar_url: conversation.contact_avatar_url,
          },
          messages: (messages as any[])?.map((msg: any) => ({
            role: msg.role,
            content: msg.content,
            created_at: msg.created_at,
          })) || [],
          followups: (followups as any[])?.map((fu: any) => ({
            scheduled_at: fu.scheduled_at,
            status: fu.status,
            attempt: fu.attempt,
            max_attempts: fu.max_attempts,
          })) || [],
          contact: contact
            ? {
                name: contact.name,
                phone: contact.phone,
                email: contact.email,
                notes: contact.notes,
                contact_type: contact.contact_type,
                lead_status: (contact.metadata as any)?.lead_status || null,
              }
            : null,
        };

        return reply.send(response);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("chatwoot-app context error:", msg);
        return reply.status(500).send({ error: msg });
      }
    }
  );
}
