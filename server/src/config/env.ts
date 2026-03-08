const required = ["NEXUS_DB_URL"] as const;
const keyRequired = ["NEXUS_SERVICE_ROLE_KEY", "NEXUS_DB_ANON_KEY"] as const;

export function validateEnv(): void {
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }
  const hasKey = keyRequired.some((k) => process.env[k]);
  if (!hasKey) {
    throw new Error("Missing NEXUS_SERVICE_ROLE_KEY or NEXUS_DB_ANON_KEY");
  }
}

export function getEnv(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (!val) throw new Error(`Missing env: ${key}`);
  return val;
}
