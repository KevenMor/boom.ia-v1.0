import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import {
  getAllPromptConfigs,
  getPromptConfig,
  buildSystemPrompt,
  getDispatcherPrompt,
  getFollowupPrompt,
} from "../services/prompts/registry.js";

async function getKey(secret: string): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(secret.padEnd(32, "0").slice(0, 32));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(plaintext: string, secret: string): Promise<string> {
  const key = await getKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(encoded: string, secret: string): Promise<string> {
  const key = await getKey(secret);
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

export async function adminRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/admin/clear-conversations",
    async (
      req: FastifyRequest<{ Body: { conversation_ids: string[]; agent_id: string } }>,
      reply: FastifyReply
    ) => {
      const nexusUrl = process.env.NEXUS_DB_URL;
      const nexusServiceKey = process.env.NEXUS_SERVICE_ROLE_KEY;

      if (!nexusUrl || !nexusServiceKey) {
        return reply.status(500).send({ error: "Missing server configuration" });
      }

      const supabase = createNexusClient();
      const { conversation_ids, agent_id } = req.body;

      if (!agent_id) {
        return reply.status(400).send({ error: "agent_id required" });
      }

      if (!conversation_ids || !Array.isArray(conversation_ids) || conversation_ids.length === 0) {
        return reply.status(400).send({ error: "conversation_ids array required" });
      }

      const { data, error } = await supabase.rpc("delete_conversations", {
        p_agent_id: agent_id,
        p_conversation_ids: conversation_ids,
      });

      if (error) {
        return reply.status(500).send({ error: error.message });
      }

      const result = Array.isArray(data) ? data[0] : data;
      const deletedMessages = result?.deleted_messages ?? 0;
      const deletedConversations = result?.deleted_conversations ?? 0;

      await supabase
        .from("follow_up_queue")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .in("conversation_id", conversation_ids)
        .eq("status", "pending");

      return reply.send({
        success: true,
        deleted_messages: deletedMessages,
        deleted_conversations: deletedConversations,
      });
    }
  );

  fastify.post(
    "/admin/provider-keys",
    async (
      req: FastifyRequest<{ Body: { action: string; provider_id?: string; api_key?: string } }>,
      reply: FastifyReply
    ) => {
      const encryptionKey = process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_SECRET;
      if (!encryptionKey) {
        return reply.status(500).send({ error: "ENCRYPTION_KEY not configured" });
      }

      const nexusUrl = process.env.NEXUS_DB_URL;
      const nexusKey = process.env.NEXUS_DB_ANON_KEY;
      if (!nexusUrl || !nexusKey) {
        return reply.status(500).send({
          error: "NEXUS_DB_URL or NEXUS_DB_ANON_KEY not configured",
          nexusUrl: !!nexusUrl,
          nexusKey: !!nexusKey,
        });
      }

      const authHeader = (req.headers["x-nexus-auth"] as string) || "";
      const supabase = createNexusClient();

      const { action, provider_id, api_key } = req.body;

      if (action === "encrypt") {
        if (!provider_id || !api_key) {
          return reply.status(400).send({ error: "provider_id and api_key required" });
        }
        const encrypted = await encrypt(api_key, encryptionKey);
        const { error: updateError } = await supabase
          .from("providers")
          .update({ api_key_encrypted: encrypted })
          .eq("id", provider_id);

        if (updateError) {
          return reply.status(500).send({ error: updateError.message });
        }
        return reply.send({ success: true });
      }

      if (action === "decrypt") {
        if (!provider_id) {
          return reply.status(400).send({ error: "provider_id required" });
        }
        const { data: provider, error: fetchError } = await supabase
          .from("providers")
          .select("api_key_encrypted")
          .eq("id", provider_id)
          .single();

        if (fetchError || !provider?.api_key_encrypted) {
          return reply.status(404).send({
            error: "Key not found",
            detail: fetchError?.message,
          });
        }
        try {
          const decrypted = await decrypt(provider.api_key_encrypted, encryptionKey);
          return reply.send({ api_key: decrypted });
        } catch (err) {
          fastify.log.warn({ err, provider_id }, "Decrypt failed for provider key");
          return reply.status(500).send({
            error: "Decryption failed",
            detail: "ENCRYPTION_KEY may not match the key used to encrypt this provider. Ensure ENCRYPTION_KEY is the same in all environments.",
          });
        }
      }

      return reply.status(400).send({ error: "Invalid action" });
    }
  );

  fastify.get<{ Querystring: { slug?: string } }>(
    "/admin/prompts",
    async (req: FastifyRequest<{ Querystring: { slug?: string } }>, reply: FastifyReply) => {
      const slug = req.query?.slug;

      if (slug) {
        const config = getPromptConfig(slug);
        if (!config) {
          return reply.status(404).send({ error: "Tenant not found in prompt registry" });
        }
        const fullSystemPrompt = buildSystemPrompt("", slug, true);
        const dispatcherPrompt = getDispatcherPrompt(slug);
        const followupPrompt = getFollowupPrompt(slug);

        return reply.send({
          slug: config.slug,
          version: config.version,
          description: config.description,
          systemPrompt: config.systemPrompt || "(uses agent's database prompt)",
          communicationRules: config.communicationRules || "(none)",
          dispatcherPrompt,
          followupPrompt: followupPrompt || "(usa prompt padrão do sistema)",
          fullComposedPrompt: fullSystemPrompt,
          fullPromptLength: fullSystemPrompt.length,
        });
      }

      const allConfigs = getAllPromptConfigs();
      const summary = Object.entries(allConfigs).map(([, config]) => ({
        slug: config.slug,
        version: config.version,
        description: config.description,
        systemPromptLength: (config.systemPrompt || "").length,
        communicationRulesLength: (config.communicationRules || "").length,
        dispatcherPromptLength: config.dispatcherPrompt.length,
        followupPromptLength: (config.followupPrompt || "").length,
      }));

      return reply.send({ tenants: summary });
    }
  );

  fastify.post("/admin/prompts", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { slug?: string };
    const slug = body?.slug;

    if (slug) {
      const config = getPromptConfig(slug);
      if (!config) {
        return reply.status(404).send({ error: "Tenant not found in prompt registry" });
      }
      const fullSystemPrompt = buildSystemPrompt("", slug, true);
      const dispatcherPrompt = getDispatcherPrompt(slug);
      const followupPrompt = getFollowupPrompt(slug);

      return reply.send({
        slug: config.slug,
        version: config.version,
        description: config.description,
        systemPrompt: config.systemPrompt || "(uses agent's database prompt)",
        communicationRules: config.communicationRules || "(none)",
        dispatcherPrompt,
        followupPrompt: followupPrompt || "(usa prompt padrão do sistema)",
        fullComposedPrompt: fullSystemPrompt,
        fullPromptLength: fullSystemPrompt.length,
      });
    }

    const allConfigs = getAllPromptConfigs();
    const summary = Object.entries(allConfigs).map(([, config]) => ({
      slug: config.slug,
      version: config.version,
      description: config.description,
      systemPromptLength: (config.systemPrompt || "").length,
      communicationRulesLength: (config.communicationRules || "").length,
      dispatcherPromptLength: config.dispatcherPrompt.length,
      followupPromptLength: (config.followupPrompt || "").length,
    }));

    return reply.send({ tenants: summary });
  });
}
