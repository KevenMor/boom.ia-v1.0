import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { encrypt } from "../services/crypto.js";

function serializeProvider(row: Record<string, unknown>) {
  const { api_key_encrypted, ...rest } = row;
  return { ...rest, has_key: Boolean(api_key_encrypted) };
}

async function hashToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function requireMcpTenant(req: FastifyRequest, reply: FastifyReply): Promise<string | null> {
  const auth = (req.headers.authorization as string) || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token.startsWith("boomia_sk_")) {
    reply.status(401).send({ error: "Unauthorized" });
    return null;
  }
  const supabase = createNexusClient();
  const keyHash = await hashToken(token);
  const { data, error } = await supabase
    .from("tenant_mcp_keys")
    .select("tenant_id")
    .eq("key_hash", keyHash)
    .maybeSingle();
  if (error || !data?.tenant_id) {
    reply.status(401).send({ error: "Unauthorized" });
    return null;
  }
  return data.tenant_id as string;
}

async function encryptApiKey(apiKey: unknown): Promise<string | undefined> {
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    return undefined;
  }
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error("ENCRYPTION_KEY não configurada");
  }
  return encrypt(apiKey.trim(), encryptionKey);
}

export async function providerRoutes(fastify: FastifyInstance) {
  fastify.get("/providers", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireMcpTenant(req, reply))) {
      return;
    }
    const supabase = createNexusClient();
    const { data, error } = await supabase
      .from("providers")
      .select("id, name, base_url, model_default, status, created_at, api_key_encrypted")
      .order("name");
    if (error) {
      return reply.status(500).send({ error: error.message });
    }
    const providers = (data ?? []).map((row) => serializeProvider(row as Record<string, unknown>));
    return reply.send({ providers, total: providers.length });
  });

  fastify.post("/providers", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!(await requireMcpTenant(req, reply))) {
      return;
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return reply.status(400).send({ error: "name is required" });
    }
    let apiKeyEncrypted: string | undefined;
    try {
      apiKeyEncrypted = await encryptApiKey(body.api_key);
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
    const supabase = createNexusClient();
    const { data, error } = await supabase
      .from("providers")
      .insert({
        name,
        base_url: typeof body.base_url === "string" ? body.base_url.trim() || null : null,
        model_default: typeof body.model_default === "string" ? body.model_default.trim() || null : null,
        status: typeof body.status === "string" && body.status ? body.status : "active",
        ...(apiKeyEncrypted ? { api_key_encrypted: apiKeyEncrypted } : {}),
      })
      .select("id, name, base_url, model_default, status, created_at")
      .single();
    if (error) {
      return reply.status(500).send({ error: error.message });
    }
    return reply.send({ provider: { ...data, has_key: Boolean(apiKeyEncrypted) } });
  });

  fastify.patch("/providers/:id", async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    if (!(await requireMcpTenant(req, reply))) {
      return;
    }
    const id = req.params.id;
    const body = (req.body || {}) as Record<string, unknown>;
    const row: Record<string, unknown> = {};
    if (typeof body.name === "string") row.name = body.name.trim();
    if ("base_url" in body) row.base_url = typeof body.base_url === "string" ? body.base_url.trim() || null : null;
    if ("model_default" in body) {
      row.model_default = typeof body.model_default === "string" ? body.model_default.trim() || null : null;
    }
    if (typeof body.status === "string" && body.status) row.status = body.status;
    try {
      const encrypted = await encryptApiKey(body.api_key);
      if (encrypted) {
        row.api_key_encrypted = encrypted;
      }
    } catch (err) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
    if (!Object.keys(row).length) {
      return reply.status(400).send({ error: "no fields to update" });
    }
    const supabase = createNexusClient();
    const { data, error } = await supabase
      .from("providers")
      .update(row)
      .eq("id", id)
      .select("id, name, base_url, model_default, status, created_at, api_key_encrypted")
      .single();
    if (error) {
      return reply.status(500).send({ error: error.message });
    }
    return reply.send({ provider: serializeProvider(data as Record<string, unknown>) });
  });

  fastify.delete("/providers/:id", async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    if (!(await requireMcpTenant(req, reply))) {
      return;
    }
    const supabase = createNexusClient();
    const { error } = await supabase.from("providers").delete().eq("id", req.params.id);
    if (error) {
      return reply.status(500).send({ error: error.message });
    }
    return reply.send({ success: true, deleted_id: req.params.id });
  });
}
