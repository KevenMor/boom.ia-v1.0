/**
 * Parse CSV string to array of objects.
 * First row = headers. Supports: Nome, E-mail, Telefone, CPF/CNPJ, Cidade, Estado, Empresa, Status, Origem, Endereço, CEP, Observações
 */
export function parseContactsCsv(csv: string): Array<{
  name: string;
  email?: string | null;
  phone?: string | null;
  cpf_cnpj?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  notes?: string | null;
}> {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if ((c === "," && !inQuotes) || c === "\r") {
        result.push(current.trim());
        current = "";
      } else {
        current += c;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headerLine = lines[0];
  const headers = parseLine(headerLine).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const nameIdx = headers.findIndex((h) => h === "nome" || h === "name");
  const emailIdx = headers.findIndex((h) => h === "e-mail" || h === "email");
  const phoneIdx = headers.findIndex((h) => h === "telefone" || h === "phone");
  const cpfIdx = headers.findIndex((h) => h === "cpf/cnpj" || h === "cpf_cnpj");
  const cityIdx = headers.findIndex((h) => h === "cidade" || h === "city");
  const stateIdx = headers.findIndex((h) => h === "estado" || h === "state");
  const addrIdx = headers.findIndex((h) => h === "endereço" || h === "endereco" || h === "address");
  const zipIdx = headers.findIndex((h) => h === "cep" || h === "zip_code");
  const notesIdx = headers.findIndex((h) => h === "observações" || h === "observacoes" || h === "notes");

  const rows: Array<{
    name: string;
    email?: string | null;
    phone?: string | null;
    cpf_cnpj?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip_code?: string | null;
    notes?: string | null;
  }> = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    const name = nameIdx >= 0 ? (cells[nameIdx] ?? "").trim() : (cells[0] ?? "").trim();
    if (!name) continue;

    rows.push({
      name,
      email: emailIdx >= 0 && cells[emailIdx] ? cells[emailIdx].trim() || null : null,
      phone: phoneIdx >= 0 && cells[phoneIdx] ? cells[phoneIdx].trim() || null : null,
      cpf_cnpj: cpfIdx >= 0 && cells[cpfIdx] ? cells[cpfIdx].trim() || null : null,
      address: addrIdx >= 0 && cells[addrIdx] ? cells[addrIdx].trim() || null : null,
      city: cityIdx >= 0 && cells[cityIdx] ? cells[cityIdx].trim() || null : null,
      state: stateIdx >= 0 && cells[stateIdx] ? cells[stateIdx].trim() || null : null,
      zip_code: zipIdx >= 0 && cells[zipIdx] ? cells[zipIdx].trim() || null : null,
      notes: notesIdx >= 0 && cells[notesIdx] ? cells[notesIdx].trim() || null : null,
    });
  }

  return rows;
}
