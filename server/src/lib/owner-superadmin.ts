/**
 * E-mails com acesso total (superadmin) mesmo se `profiles.role` falhar/atrasar.
 * Útil quando o pool do Postgres está saturado e o bootstrap não consegue ler o perfil.
 */
const DEFAULT_OWNER_EMAILS = ["contato@agboom.com.br"];

export function getOwnerSuperadminEmails(): Set<string> {
  const fromEnv = (process.env.SUPERADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...DEFAULT_OWNER_EMAILS, ...fromEnv].map((e) => e.toLowerCase()));
}

export function isOwnerSuperadminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getOwnerSuperadminEmails().has(email.trim().toLowerCase());
}
