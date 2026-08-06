import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { requireSuperadmin, resolveAccessContext } from "../services/authorization.js";
import { writeAuditLog } from "../services/audit.js";
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

type NexusClient = ReturnType<typeof createNexusClient>;

/** Garante 1 agenda pessoal por usuário/tenant (idempotente). */
export async function ensurePersonalCalendar(
  supabase: NexusClient,
  opts: { tenantId: string; userId: string; fullName?: string | null }
): Promise<{ id: string; created: boolean }> {
  const { data: existing, error: findErr } = await supabase
    .from("calendars")
    .select("id")
    .eq("tenant_id", opts.tenantId)
    .eq("owner_user_id", opts.userId)
    .limit(1)
    .maybeSingle();
  if (findErr) throw new Error(findErr.message);
  if (existing?.id) return { id: existing.id as string, created: false };

  const name = opts.fullName?.trim()
    ? `Agenda — ${opts.fullName.trim()}`
    : "Minha agenda";

  const { data: created, error: insErr } = await supabase
    .from("calendars")
    .insert({
      tenant_id: opts.tenantId,
      name,
      color: "primary",
      is_active: true,
      owner_user_id: opts.userId,
    })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);
  return { id: created.id as string, created: true };
}

export async function adminRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", async (req, reply) => {
    const ctx = await requireSuperadmin(req, reply);
    if (!ctx) return reply;
  });

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
        .update({ status: "cancelled", cancel_reason: "conversations_cleared_by_admin", updated_at: new Date().toISOString() })
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
        active: config.active !== false,
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
      active: config.active !== false,
      systemPromptLength: (config.systemPrompt || "").length,
      communicationRulesLength: (config.communicationRules || "").length,
      dispatcherPromptLength: config.dispatcherPrompt.length,
      followupPromptLength: (config.followupPrompt || "").length,
    }));

    return reply.send({ tenants: summary });
  });

  fastify.get("/admin/tenants", async (_req: FastifyRequest, reply: FastifyReply) => {
    const supabase = createNexusClient();
    const { data, error } = await supabase
      .from("tenants")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return reply.status(500).send({ error: error.message });
    }

    return reply.send({ data: data ?? [] });
  });

  type TenantMembershipRole = "tenant_admin" | "tenant_user";

  interface AdminUserRow {
    id: string;
    email: string | null;
    full_name: string | null;
    role: string;
    created_at: string;
    memberships: Array<{
      id: string;
      tenant_id: string;
      role: string;
      tenants: { name: string } | null;
    }>;
  }

  fastify.get("/admin/users", async (_req: FastifyRequest, reply: FastifyReply) => {
    if (!process.env.NEXUS_SERVICE_ROLE_KEY) {
      return reply.status(503).send({ error: "NEXUS_SERVICE_ROLE_KEY not configured for user management" });
    }
    const supabase = createNexusClient();
    const [{ data: profiles, error: pErr }, { data: memberships, error: mErr }, listRes] = await Promise.all([
      supabase.from("profiles").select("id, full_name, role, created_at").order("created_at", { ascending: false }),
      supabase.from("tenant_memberships").select("id, user_id, tenant_id, role, tenants(name)"),
      supabase.auth.admin.listUsers({ perPage: 1000 }),
    ]);
    if (pErr) return reply.status(500).send({ error: pErr.message });
    if (mErr) return reply.status(500).send({ error: mErr.message });
    if (listRes.error) {
      fastify.log.warn({ err: listRes.error }, "admin listUsers failed; emails omitted");
    }

    const emailById = new Map<string, string>();
    for (const u of listRes.data?.users ?? []) {
      if (u.id && u.email) emailById.set(u.id, u.email);
    }

    const byUser = new Map<string, AdminUserRow["memberships"]>();
    for (const row of memberships ?? []) {
      const raw = row as Record<string, unknown>;
      const id = String(raw.id ?? "");
      const user_id = String(raw.user_id ?? "");
      const tenant_id = String(raw.tenant_id ?? "");
      const role = String(raw.role ?? "");
      let tenantName: { name: string } | null = null;
      const t = raw.tenants;
      if (t && !Array.isArray(t) && typeof (t as { name?: string }).name === "string") {
        tenantName = { name: (t as { name: string }).name };
      } else if (Array.isArray(t) && t[0] && typeof (t[0] as { name?: string }).name === "string") {
        tenantName = { name: (t[0] as { name: string }).name };
      }
      const list = byUser.get(user_id) ?? [];
      list.push({
        id,
        tenant_id,
        role,
        tenants: tenantName,
      });
      byUser.set(user_id, list);
    }

    const data: AdminUserRow[] = (profiles ?? []).map((p: { id: string; full_name: string | null; role: string; created_at: string }) => ({
      id: p.id,
      email: emailById.get(p.id) ?? null,
      full_name: p.full_name,
      role: p.role,
      created_at: p.created_at,
      memberships: byUser.get(p.id) ?? [],
    }));

    return reply.send({ data });
  });

  fastify.post(
    "/admin/users",
    async (
      req: FastifyRequest<{
        Body: {
          email?: string;
          password?: string;
          full_name?: string | null;
          memberships?: Array<{ tenant_id: string; role: TenantMembershipRole }>;
          /** Default true: cria agenda pessoal para memberships tenant_user. */
          ensure_personal_calendars?: boolean;
        };
      }>,
      reply: FastifyReply
    ) => {
      if (!process.env.NEXUS_SERVICE_ROLE_KEY) {
        return reply.status(503).send({ error: "NEXUS_SERVICE_ROLE_KEY not configured for user management" });
      }
      const supabase = createNexusClient();
      const email = String(req.body?.email ?? "").trim().toLowerCase();
      const password = String(req.body?.password ?? "");
      const full_name = req.body?.full_name != null ? String(req.body.full_name).trim() || null : null;
      const ensurePersonal =
        req.body?.ensure_personal_calendars === undefined
          ? true
          : Boolean(req.body.ensure_personal_calendars);
      const rawMemberships = Array.isArray(req.body?.memberships) ? req.body.memberships : [];

      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return reply.status(400).send({ error: "email inválido" });
      }
      if (password.length < 8) {
        return reply.status(400).send({ error: "senha deve ter pelo menos 8 caracteres" });
      }

      const seenTenants = new Set<string>();
      const memberships: Array<{ tenant_id: string; role: TenantMembershipRole }> = [];
      for (const m of rawMemberships) {
        if (!m?.tenant_id || typeof m.tenant_id !== "string") continue;
        const role = m.role === "tenant_admin" ? "tenant_admin" : "tenant_user";
        if (seenTenants.has(m.tenant_id)) continue;
        seenTenants.add(m.tenant_id);
        memberships.push({ tenant_id: m.tenant_id, role });
      }

      const { data: created, error: authErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: full_name ? { full_name } : undefined,
      });

      if (authErr || !created?.user) {
        const msg = authErr?.message ?? "create user failed";
        if (/already|registered|exists/i.test(msg)) {
          return reply.status(409).send({ error: "Este e-mail já está cadastrado" });
        }
        return reply.status(400).send({ error: msg });
      }

      const userId = created.user.id;

      const { error: profileErr } = await supabase.from("profiles").upsert(
        {
          id: userId,
          full_name,
          role: "tenant_user",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
      if (profileErr) {
        await supabase.auth.admin.deleteUser(userId);
        return reply.status(500).send({ error: profileErr.message });
      }

      if (memberships.length > 0) {
        const { error: memErr } = await supabase.from("tenant_memberships").insert(
          memberships.map((m) => ({
            user_id: userId,
            tenant_id: m.tenant_id,
            role: m.role,
            updated_at: new Date().toISOString(),
          }))
        );
        if (memErr) {
          await supabase.from("tenant_memberships").delete().eq("user_id", userId);
          await supabase.from("profiles").delete().eq("id", userId);
          await supabase.auth.admin.deleteUser(userId);
          return reply.status(400).send({ error: memErr.message });
        }
      }

      const personalCalendars: Array<{ tenant_id: string; calendar_id: string }> = [];
      if (ensurePersonal) {
        for (const m of memberships) {
          if (m.role !== "tenant_user") continue;
          try {
            const cal = await ensurePersonalCalendar(supabase, {
              tenantId: m.tenant_id,
              userId,
              fullName: full_name,
            });
            personalCalendars.push({ tenant_id: m.tenant_id, calendar_id: cal.id });
          } catch (calErr) {
            console.warn("[admin] ensurePersonalCalendar failed:", calErr);
          }
        }
      }

      const actor = await resolveAccessContext(req);
      if (actor) {
        void writeAuditLog({
          tenantId: memberships[0]?.tenant_id ?? null,
          auth: actor,
          resource: "user",
          resourceId: userId,
          resourceLabel: full_name ?? email,
          action: "create",
          metadata: {
            email,
            tenants: memberships.map((m) => m.tenant_id),
            personal_calendars: personalCalendars,
          },
        });
      }
      return reply.status(201).send({
        id: userId,
        email: created.user.email,
        full_name,
        role: "tenant_user",
        memberships,
        personal_calendars: personalCalendars,
      });
    }
  );

  fastify.patch(
    "/admin/users/:id",
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Body: {
          full_name?: string | null;
          /** Nova senha (opcional). Mín. 8 caracteres. */
          password?: string;
          memberships?: Array<{ tenant_id: string; role: TenantMembershipRole }>;
          ensure_personal_calendars?: boolean;
        };
      }>,
      reply: FastifyReply
    ) => {
      if (!process.env.NEXUS_SERVICE_ROLE_KEY) {
        return reply.status(503).send({ error: "NEXUS_SERVICE_ROLE_KEY not configured for user management" });
      }
      const supabase = createNexusClient();
      const userId = req.params.id;
      if (!userId) return reply.status(400).send({ error: "id obrigatório" });

      const { data: existing, error: fetchErr } = await supabase
        .from("profiles")
        .select("id, role, full_name")
        .eq("id", userId)
        .maybeSingle();
      if (fetchErr) return reply.status(500).send({ error: fetchErr.message });
      if (!existing) return reply.status(404).send({ error: "usuário não encontrado" });

      let resolvedFullName =
        existing.full_name != null ? String(existing.full_name) : null;
      let passwordChanged = false;

      if (req.body?.password !== undefined) {
        const password = String(req.body.password ?? "");
        if (!password) {
          return reply.status(400).send({ error: "senha não pode ser vazia" });
        }
        if (password.length < 8) {
          return reply.status(400).send({ error: "senha deve ter pelo menos 8 caracteres" });
        }
        const { error: pwdErr } = await supabase.auth.admin.updateUserById(userId, { password });
        if (pwdErr) return reply.status(400).send({ error: pwdErr.message });
        passwordChanged = true;
      }

      if (req.body?.full_name !== undefined) {
        const full_name = req.body.full_name === null ? null : String(req.body.full_name).trim() || null;
        const { error: upErr } = await supabase
          .from("profiles")
          .update({ full_name, updated_at: new Date().toISOString() })
          .eq("id", userId);
        if (upErr) return reply.status(500).send({ error: upErr.message });
        resolvedFullName = full_name;
      }

      let membershipsForCalendar: Array<{ tenant_id: string; role: TenantMembershipRole }> = [];

      if (req.body?.memberships !== undefined) {
        const rawMemberships = Array.isArray(req.body.memberships) ? req.body.memberships : [];
        const seenTenants = new Set<string>();
        const memberships: Array<{ tenant_id: string; role: TenantMembershipRole }> = [];
        for (const m of rawMemberships) {
          if (!m?.tenant_id || typeof m.tenant_id !== "string") continue;
          const role = m.role === "tenant_admin" ? "tenant_admin" : "tenant_user";
          if (seenTenants.has(m.tenant_id)) continue;
          seenTenants.add(m.tenant_id);
          memberships.push({ tenant_id: m.tenant_id, role });
        }
        membershipsForCalendar = memberships;

        const { error: delErr } = await supabase.from("tenant_memberships").delete().eq("user_id", userId);
        if (delErr) return reply.status(500).send({ error: delErr.message });

        if (memberships.length > 0) {
          const { error: insErr } = await supabase.from("tenant_memberships").insert(
            memberships.map((m) => ({
              user_id: userId,
              tenant_id: m.tenant_id,
              role: m.role,
              updated_at: new Date().toISOString(),
            }))
          );
          if (insErr) return reply.status(400).send({ error: insErr.message });
        }
      } else if (req.body?.ensure_personal_calendars) {
        const { data: mems } = await supabase
          .from("tenant_memberships")
          .select("tenant_id, role")
          .eq("user_id", userId);
        membershipsForCalendar = (mems ?? []).map((m) => ({
          tenant_id: m.tenant_id as string,
          role: (m.role === "tenant_admin" ? "tenant_admin" : "tenant_user") as TenantMembershipRole,
        }));
      }

      const ensurePersonal =
        Boolean(req.body?.ensure_personal_calendars) || req.body?.memberships !== undefined;
      const personalCalendars: Array<{ tenant_id: string; calendar_id: string }> = [];
      if (ensurePersonal) {
        for (const m of membershipsForCalendar) {
          if (m.role !== "tenant_user") continue;
          try {
            const cal = await ensurePersonalCalendar(supabase, {
              tenantId: m.tenant_id,
              userId,
              fullName: resolvedFullName,
            });
            personalCalendars.push({ tenant_id: m.tenant_id, calendar_id: cal.id });
          } catch (calErr) {
            console.warn("[admin] ensurePersonalCalendar (patch) failed:", calErr);
          }
        }
      }

      const actor = await resolveAccessContext(req);
      if (actor) {
        void writeAuditLog({
          tenantId:
            req.body?.memberships?.[0]?.tenant_id ?? membershipsForCalendar[0]?.tenant_id ?? null,
          auth: actor,
          resource: "user",
          resourceId: userId,
          resourceLabel: req.body?.full_name ?? userId,
          action: "update",
          metadata: {
            fields: Object.keys(req.body ?? {}).filter((k) => k !== "password"),
            password_changed: passwordChanged,
            personal_calendars: personalCalendars,
          },
        });
      }
      return reply.send({
        success: true,
        password_changed: passwordChanged,
        personal_calendars: personalCalendars,
      });
    }
  );

  // GET /admin/users/:id/acl?tenant_id=...
  fastify.get(
    "/admin/users/:id/acl",
    async (
      req: FastifyRequest<{ Params: { id: string }; Querystring: { tenant_id?: string } }>,
      reply: FastifyReply
    ) => {
      const supabase = createNexusClient();
      const { id: userId } = req.params;
      const { tenant_id } = req.query;
      if (!userId || !tenant_id) return reply.status(400).send({ error: "id e tenant_id obrigatórios" });

      const { data, error } = await supabase
        .from("user_module_acl")
        .select("module_key, enabled, allowed_actions")
        .eq("user_id", userId)
        .eq("tenant_id", tenant_id);

      if (error) return reply.status(500).send({ error: error.message });
      return reply.send({ data: data ?? [] });
    }
  );

  // PUT /admin/users/:id/acl — substitui toda a ACL do usuário para um tenant
  fastify.put(
    "/admin/users/:id/acl",
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Body: {
          tenant_id: string;
          modules: Array<{ module_key: string; enabled: boolean; allowed_actions: string[] | null }>;
        };
      }>,
      reply: FastifyReply
    ) => {
      const supabase = createNexusClient();
      const { id: userId } = req.params;
      const { tenant_id, modules } = req.body ?? {};
      if (!userId || !tenant_id) return reply.status(400).send({ error: "id e tenant_id obrigatórios" });

      const { error: delErr } = await supabase
        .from("user_module_acl")
        .delete()
        .eq("user_id", userId)
        .eq("tenant_id", tenant_id);
      if (delErr) return reply.status(500).send({ error: delErr.message });

      if (Array.isArray(modules) && modules.length > 0) {
        const rows = modules.map((m) => ({
          user_id: userId,
          tenant_id,
          module_key: String(m.module_key),
          enabled: m.enabled !== false,
          allowed_actions: Array.isArray(m.allowed_actions) ? m.allowed_actions : null,
          updated_at: new Date().toISOString(),
        }));
        const { error: insErr } = await supabase.from("user_module_acl").insert(rows);
        if (insErr) return reply.status(500).send({ error: insErr.message });
      }

      const calendarEnabled = Array.isArray(modules)
        ? modules.some((m) => String(m.module_key) === "calendar" && m.enabled !== false)
        : false;
      let personalCalendarId: string | null = null;
      if (calendarEnabled) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", userId)
          .maybeSingle();
        try {
          const cal = await ensurePersonalCalendar(supabase, {
            tenantId: tenant_id,
            userId,
            fullName: profile?.full_name != null ? String(profile.full_name) : null,
          });
          personalCalendarId = cal.id;
        } catch (calErr) {
          console.warn("[admin] ensurePersonalCalendar (acl) failed:", calErr);
        }
      }

      return reply.send({ success: true, personal_calendar_id: personalCalendarId });
    }
  );

  fastify.delete(
    "/admin/users/:id",
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!process.env.NEXUS_SERVICE_ROLE_KEY) {
        return reply.status(503).send({ error: "NEXUS_SERVICE_ROLE_KEY not configured" });
      }
      const supabase = createNexusClient();
      const userId = req.params.id;
      if (!userId) return reply.status(400).send({ error: "id obrigatório" });

      const { error: authErr } = await supabase.auth.admin.deleteUser(userId);
      if (authErr) return reply.status(500).send({ error: authErr.message });

      const actor = await resolveAccessContext(req);
      if (actor) {
        void writeAuditLog({
          tenantId: null,
          auth: actor,
          resource: "user",
          resourceId: userId,
          resourceLabel: userId,
          action: "delete",
        });
      }
      return reply.send({ success: true });
    }
  );

  fastify.post(
    "/admin/tenants",
    async (
      req: FastifyRequest<{ Body: { name: string; slug: string; plan?: string; description?: string } }>,
      reply: FastifyReply
    ) => {
      const { name, slug, plan, description } = req.body;
      if (!name || !slug) {
        return reply.status(400).send({ error: "name and slug are required" });
      }

      // Obter user_id do token JWT enviado pelo frontend via x-nexus-auth
      const authHeader = req.headers["x-nexus-auth"] as string | undefined;
      let userId: string | null = null;
      if (authHeader) {
        // Usar anon client com JWT para validar o usuário (não service role)
        const { createClient } = await import("@supabase/supabase-js");
        const userClient = createClient(
          process.env.NEXUS_DB_URL!,
          process.env.NEXUS_DB_ANON_KEY!,
          { global: { headers: { Authorization: authHeader.startsWith("Bearer ") ? authHeader : `Bearer ${authHeader}` } } }
        );
        const { data: { user }, error: userError } = await userClient.auth.getUser();
        if (userError) req.log.warn({ userError }, "Failed to get user from JWT");
        userId = user?.id ?? null;
        req.log.info({ userId }, "Extracted userId from JWT");
      }

      const supabase = createNexusClient(); // service role para bypass RLS
      const { data, error } = await supabase
        .from("tenants")
        .insert({
          name,
          slug,
          plan: plan || "Starter",
          description,
        })
        .select()
        .single();

      if (error) {
        req.log.error({ error }, "Failed to insert tenant");
        return reply.status(500).send({ error: error.message });
      }

      req.log.info({ tenantId: data.id, userId }, "Tenant created, inserting membership");

      // Inserir membership com user_id extraído do JWT
      if (userId && data.id) {
        const { error: membershipError } = await supabase.from("tenant_memberships").insert({
          tenant_id: data.id,
          user_id: userId,
          role: "tenant_admin",
        });
        if (membershipError) {
          req.log.warn({ membershipError }, "Failed to insert tenant membership");
        }
      } else {
        req.log.warn({ userId, tenantId: data.id }, "Skipping membership insert: missing userId or tenantId");
      }

      // Provisionar schema do Data Plane (cria dp_{slug}, tabelas conversations/messages/etc)
      req.log.info({ tenantId: data.id }, "Provisioning tenant data plane schema");
      const { error: provisionError } = await supabase.rpc("provision_tenant_schema", { p_tenant_id: data.id });
      if (provisionError) {
        req.log.error({ provisionError }, "Failed to provision tenant schema");
        // Não falha o request — tenant criado, mas schema precisará de provisionamento manual
      } else {
        req.log.info({ tenantId: data.id }, "Tenant schema provisioned successfully");
      }

      const actor = await resolveAccessContext(req);
      if (actor) {
        void writeAuditLog({
          tenantId: data.id,
          auth: actor,
          resource: "tenant",
          resourceId: data.id,
          resourceLabel: data.name,
          action: "create",
          metadata: { slug: data.slug, plan: data.plan },
        });
      }
      return reply.status(201).send(data);
    }
  );

  fastify.delete(
    "/admin/tenants/:id",
    async (
      req: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const { id } = req.params;
      if (!id) return reply.status(400).send({ error: "id is required" });

      const supabase = createNexusClient(); // service role bypasses RLS

      const { data: tenantRow } = await supabase.from("tenants").select("name").eq("id", id).maybeSingle();

      // 1. Deletar memberships do tenant
      await supabase.from("tenant_memberships").delete().eq("tenant_id", id);

      // 2. Deletar o tenant
      const { error } = await supabase.from("tenants").delete().eq("id", id);
      if (error) {
        req.log.error({ error }, "Failed to delete tenant");
        return reply.status(500).send({ error: error.message });
      }

      const actor = await resolveAccessContext(req);
      if (actor) {
        void writeAuditLog({
          tenantId: id,
          auth: actor,
          resource: "tenant",
          resourceId: id,
          resourceLabel: (tenantRow as { name?: string } | null)?.name ?? id,
          action: "delete",
        });
      }
      return reply.status(200).send({ success: true });
    }
  );
}
