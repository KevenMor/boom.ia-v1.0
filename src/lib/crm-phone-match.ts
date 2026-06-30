export function normalizeBrazilPhoneDigits(digits: string): string {
  const d = (digits || "").replace(/\D/g, "");
  if (d.length < 10) return d;
  return d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
}

export function crmPhoneMatchesConversation(convDigits: string | null, contactPhone: string | null): boolean {
  if (!convDigits || convDigits.length < 10) return false;
  const a = normalizeBrazilPhoneDigits(convDigits);
  const b = normalizeBrazilPhoneDigits((contactPhone ?? "").replace(/\D/g, ""));
  return a.length >= 12 && b.length >= 12 && a === b;
}

export function extractPhoneDigitsFromChatwootContact(contact: {
  phone_number?: string | null;
  identifier?: string | null;
} | null | undefined): string | null {
  if (!contact) return null;
  for (const raw of [contact.phone_number, contact.identifier]) {
    if (!raw) continue;
    const digits = String(raw).replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) return normalizeBrazilPhoneDigits(digits);
  }
  return null;
}
