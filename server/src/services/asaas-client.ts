import { createNexusClient } from "./supabase.js";
import { decrypt } from "./crypto.js";

const ASAAS_BASE = {
  sandbox: "https://sandbox.asaas.com/api/v3",
  production: "https://www.asaas.com/api/v3",
} as const;

export type AsaasEnvironment = keyof typeof ASAAS_BASE;

export interface AsaasConfig {
  tenantId: string;
  environment: AsaasEnvironment;
  apiKey: string;
  baseUrl: string;
  walletId: string | null;
  accountName: string | null;
}

export interface AsaasOk<T> { ok: true; data: T; status: number }
export interface AsaasErr { ok: false; status: number; error: string; details?: unknown }
export type AsaasResponse<T> = AsaasOk<T> | AsaasErr;

export async function resolveAsaasConfig(tenantId: string): Promise<AsaasConfig | null> {
  const supabase = createNexusClient();
  const { data, error } = await supabase
    .from("tenant_asaas_config")
    .select("environment, api_key_encrypted, wallet_id, account_name")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !data) return null;
  if (!data.api_key_encrypted) return null;

  const encryptionKey = process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_SECRET;
  if (!encryptionKey) throw new Error("ENCRYPTION_KEY not configured");

  const apiKey = await decrypt(data.api_key_encrypted, encryptionKey);
  const environment: AsaasEnvironment = data.environment === "production" ? "production" : "sandbox";
  return {
    tenantId,
    environment,
    apiKey,
    baseUrl: ASAAS_BASE[environment],
    walletId: data.wallet_id ?? null,
    accountName: data.account_name ?? null,
  };
}

export interface AsaasRequestOpts {
  tenantId: string;
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  timeoutMs?: number;
}

export async function asaasRequest<T = unknown>(opts: AsaasRequestOpts): Promise<AsaasResponse<T>> {
  const cfg = await resolveAsaasConfig(opts.tenantId);
  if (!cfg) return { ok: false, status: 404, error: "Asaas not configured for tenant" };

  const url = new URL(`${cfg.baseUrl}${opts.path.startsWith("/") ? opts.path : `/${opts.path}`}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15000);

  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        access_token: cfg.apiKey,
        "User-Agent": "BoomIA/1.0 (Asaas integration)",
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // não-JSON, deixa em text
    }

    if (res.ok) {
      return { ok: true, data: parsed as T, status: res.status };
    }

    if (res.status === 401 || res.status === 403) {
      return { ok: false, status: res.status, error: "API key inválida ou sem permissão" };
    }

    const errMsg = (parsed as { errors?: Array<{ description?: string }> })?.errors?.[0]?.description
      ?? (typeof parsed === "object" && parsed && "message" in parsed ? String((parsed as { message: unknown }).message) : "")
      ?? `Asaas error ${res.status}`;
    return { ok: false, status: res.status, error: errMsg, details: parsed };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, status: 0, error: "Timeout ao chamar Asaas" };
    }
    return { ok: false, status: 0, error: err instanceof Error ? err.message : "Erro de rede" };
  } finally {
    clearTimeout(timeout);
  }
}

export async function getAsaasConfigRow(tenantId: string): Promise<{
  environment: AsaasEnvironment;
  api_key_set: boolean;
  wallet_id: string | null;
  account_name: string | null;
  last_tested_at: string | null;
  last_test_status: string | null;
  last_test_error: string | null;
} | null> {
  const supabase = createNexusClient();
  const { data, error } = await supabase
    .from("tenant_asaas_config")
    .select("environment, wallet_id, account_name, last_tested_at, last_test_status, last_test_error, api_key_encrypted")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    environment: (data.environment as AsaasEnvironment) ?? "sandbox",
    api_key_set: Boolean(data.api_key_encrypted),
    wallet_id: data.wallet_id ?? null,
    account_name: data.account_name ?? null,
    last_tested_at: data.last_tested_at ?? null,
    last_test_status: data.last_test_status ?? null,
    last_test_error: data.last_test_error ?? null,
  };
}