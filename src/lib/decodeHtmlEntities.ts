/** Decodifica entidades HTML para exibição no painel (&#225; → á). */
export function decodeHtmlEntities(s: string): string {
  if (!s || !/&(#\d+|#x[\da-fA-F]+|[a-zA-Z]+);/.test(s)) return s;
  let out = s;
  for (let pass = 0; pass < 3; pass++) {
    const next = out
      .replace(/&#x([\da-fA-F]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    if (next === out) break;
    out = next;
  }
  return out;
}

export function decodeInventoryDisplayText(value: string | null | undefined): string {
  if (!value) return "";
  return decodeHtmlEntities(value);
}
