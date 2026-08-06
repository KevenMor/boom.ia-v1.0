#!/usr/bin/env node
/**
 * Cria/atualiza jobs no cron-job.org via API REST para tenants com schedule_enabled.
 *
 * Pré-requisitos:
 *   export CRONJOB_ORG_API_KEY='...'           # Settings → API no cron-job.org
 *   export TENANT_AI_TOGGLE_SECRET='...'       # mesmo do Portainer
 *
 * Uso:
 *   node scripts/cron-tenant-ai/sync-cron-job-org.mjs
 *   node scripts/cron-tenant-ai/sync-cron-job-org.mjs --dry-run
 *   node scripts/cron-tenant-ai/sync-cron-job-org.mjs --slug sunset-thermas-park
 *
 * Docs: https://docs.cron-job.org/rest-api.html
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(__dirname, "tenants.json"), "utf8"));

const API = "https://api.cron-job.org";
const apiKey = (process.env.CRONJOB_ORG_API_KEY || "").trim();
const secret = (process.env.TENANT_AI_TOGGLE_SECRET || "").trim();
const dryRun = process.argv.includes("--dry-run");
const slugIdx = process.argv.indexOf("--slug");
const filterSlug = slugIdx >= 0 ? process.argv[slugIdx + 1] : "";

if (!apiKey) {
  console.error("Defina CRONJOB_ORG_API_KEY (cron-job.org → Settings → API).");
  process.exit(1);
}
if (!secret) {
  console.error("Defina TENANT_AI_TOGGLE_SECRET.");
  process.exit(1);
}

function parseCron(expr) {
  const parts = String(expr).trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Cron inválido: ${expr}`);
  const [minutes, hours, mdays, months, wdays] = parts.map((p) =>
    p === "*" ? [-1] : p.split(",").flatMap((chunk) => {
      if (chunk.includes("-")) {
        const [a, b] = chunk.split("-").map(Number);
        const out = [];
        for (let i = a; i <= b; i++) out.push(i);
        return out;
      }
      return [Number(chunk)];
    })
  );
  return { minutes, hours, mdays, months, wdays };
}

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return json;
}

function jobTitle(slug, enabled) {
  return `Boom IA — ${enabled ? "LIGAR" : "DESLIGAR"} — ${slug}`;
}

function buildJobPayload(tenant, enabled) {
  const url = `${cfg.api_base_url.replace(/\/+$/, "")}/api/tenant-ai/toggle`;
  const cronExpr = enabled ? cfg.schedule.enable_cron : cfg.schedule.disable_cron;
  const schedule = parseCron(cronExpr);
  return {
    job: {
      enabled: true,
      title: jobTitle(tenant.slug, enabled),
      url,
      requestMethod: 1, // POST
      schedule: {
        timezone: cfg.timezone,
        expiresAt: 0,
        hours: schedule.hours,
        mdays: schedule.mdays,
        minutes: schedule.minutes,
        months: schedule.months,
        wdays: schedule.wdays,
      },
      extendedData: {
        headers: {
          "Content-Type": "application/json",
          "x-tenant-ai-toggle-secret": secret,
        },
        body: JSON.stringify({ tenant_id: tenant.tenant_id, enabled }),
      },
    },
  };
}

let tenants = cfg.tenants.filter((t) => t.schedule_enabled);
if (filterSlug) {
  tenants = cfg.tenants.filter((t) => t.slug === filterSlug);
  if (!tenants.length) {
    console.error(`Slug não encontrado: ${filterSlug}`);
    process.exit(1);
  }
}

const { jobs = [] } = await api("GET", "/jobs");
const byTitle = new Map(jobs.map((j) => [j.title, j]));

console.log(`Tenants: ${tenants.length} | jobs existentes na conta: ${jobs.length}`);
if (dryRun) console.log("(dry-run — não cria/atualiza)");

let created = 0;
let updated = 0;

for (const tenant of tenants) {
  for (const enabled of [true, false]) {
    const title = jobTitle(tenant.slug, enabled);
    const payload = buildJobPayload(tenant, enabled);
    const existing = byTitle.get(title);
    if (dryRun) {
      console.log(`${existing ? "UPDATE" : "CREATE"} ${title}`);
      continue;
    }
    if (existing) {
      await api("PATCH", `/jobs/${existing.jobId}`, payload);
      updated++;
      console.log(`updated ${title} (#${existing.jobId})`);
    } else {
      const r = await api("PUT", "/jobs", payload);
      created++;
      console.log(`created ${title} (#${r.jobId ?? "?"})`);
    }
  }
}

console.log(`done created=${created} updated=${updated}`);
