/**
 * Exporta array de contatos para CSV no cliente.
 */
export function exportContactsCsv(
  contacts: Array<{
    name: string;
    email?: string | null;
    phone?: string | null;
    cpf_cnpj?: string | null;
    city?: string | null;
    state?: string | null;
    tenants?: { name: string } | null;
    metadata?: Record<string, unknown> | null;
  }>,
  filename = "contatos.csv"
): void {
  const headers = [
    "Nome",
    "E-mail",
    "Telefone",
    "CPF/CNPJ",
    "Cidade",
    "Estado",
    "Empresa",
    "Status",
    "Origem",
  ];
  const escape = (v: unknown): string => {
    if (v == null || v === "") return "";
    const s = String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const meta = (c: (typeof contacts)[0]) => (c.metadata as Record<string, unknown>) ?? {};
  const rows = contacts.map((c) => [
    escape(c.name),
    escape(c.email),
    escape(c.phone),
    escape(c.cpf_cnpj),
    escape(c.city),
    escape(c.state),
    escape(c.tenants?.name),
    escape(meta(c).lead_status ?? meta(c).status ?? ""),
    escape(meta(c).lead_source ?? meta(c).source ?? ""),
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
