/** Normalização BR alinhada ao CRM (conversation-preview, Conversations.tsx). */
export function normalizeBrazilPhoneDigits(digits: string): string {
  const d = (digits || "").replace(/\D/g, "");
  if (d.length < 10) return d;
  return d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
}

export function formatPhoneForStorage(digits: string): string {
  const norm = normalizeBrazilPhoneDigits(digits);
  return norm.length >= 12 ? `+${norm}` : norm;
}

export function crmPhoneMatches(aDigits: string | null, bDigits: string | null): boolean {
  if (!aDigits || aDigits.length < 10) return false;
  const a = normalizeBrazilPhoneDigits(aDigits);
  const b = normalizeBrazilPhoneDigits((bDigits ?? "").replace(/\D/g, ""));
  return a.length >= 12 && b.length >= 12 && a === b;
}

export function isValidCrmPhone(digits: string | null | undefined): boolean {
  const d = (digits ?? "").replace(/\D/g, "");
  return d.length >= 10 && d.length <= 15;
}

export function phoneSearchSuffix(digits: string): string | undefined {
  const d = digits.replace(/\D/g, "");
  return d.length >= 9 ? d.slice(-9) : undefined;
}
