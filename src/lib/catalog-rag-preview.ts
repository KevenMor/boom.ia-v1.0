import type { CatalogItem } from "@/types/database";

const WEEKDAY_PT = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const PAYMENT_LABELS: Record<string, string> = {
  pix: "PIX",
  credit_card: "Cartão de crédito",
  debit_card: "Cartão de débito",
  boleto: "Boleto",
  cash: "Dinheiro",
};

function formatMoney(n: number | null | undefined): string | null {
  if (n == null || Number.isNaN(n)) return null;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Texto derivado do cadastro (pré-visualização do que tende a ir ao RAG). */
export function buildCatalogRagPreviewText(
  item: Partial<CatalogItem> & { category_name?: string | null },
  extras?: { professional_names?: string[] }
): string {
  const lines: string[] = [];
  const typeLabel = item.item_type === "product" ? "Produto" : "Serviço";
  lines.push(`${typeLabel}: ${item.name?.trim() || "(sem nome)"}`);

  if (item.category_name?.trim()) {
    lines.push(`Categoria: ${item.category_name.trim()}`);
  }

  const statusMap: Record<string, string> = {
    active: "Ativo",
    inactive: "Inativo",
    coming_soon: "Em breve",
  };
  if (item.status) {
    lines.push(`Status: ${statusMap[item.status] ?? item.status}`);
  }

  if (item.duration_minutes != null) {
    lines.push(`Duração: ${item.duration_minutes} minutos`);
  }
  if (item.buffer_after_minutes != null && item.buffer_after_minutes > 0) {
    lines.push(`Intervalo após o serviço: ${item.buffer_after_minutes} minutos`);
  }
  if (item.attendance_type === "group") {
    lines.push(`Tipo de atendimento: Grupo (capacidade máx. ${item.max_capacity ?? "—"})`);
  } else if (item.attendance_type === "individual") {
    lines.push("Tipo de atendimento: Individual");
  }
  if (item.resource_required?.trim()) {
    lines.push(`Recurso necessário: ${item.resource_required.trim()}`);
  }
  if (item.available_weekdays?.length) {
    const names = [...item.available_weekdays]
      .sort((a, b) => a - b)
      .map((d) => WEEKDAY_PT[d] ?? String(d))
      .join(", ");
    lines.push(`Dias disponíveis: ${names}`);
  }

  const std = formatMoney(item.price_standard ?? null);
  const promo = formatMoney(item.price_promo ?? null);
  if (std || promo) {
    let commercial = "";
    if (promo && item.promo_valid_until) {
      commercial = `Preço promocional: ${promo} (válido até ${item.promo_valid_until}) | Preço padrão: ${std ?? "—"}`;
    } else if (promo) {
      commercial = `Preço promocional: ${promo}${std ? ` | Preço padrão: ${std}` : ""}`;
    } else if (std) {
      commercial = `Preço: ${std}`;
    }
    if (commercial) lines.push(commercial);
  }

  const methods = (item.payment_methods ?? []).map((m) => PAYMENT_LABELS[m] ?? m).filter(Boolean);
  if (methods.length) {
    lines.push(`Formas de pagamento: ${methods.join(", ")}`);
  }
  if (item.max_installments != null && item.max_installments > 0) {
    lines.push(`Parcelamento: até ${item.max_installments}x${item.installment_note?.trim() ? ` — ${item.installment_note.trim()}` : ""}`);
  } else if (item.installment_note?.trim()) {
    lines.push(`Condição de parcelamento: ${item.installment_note.trim()}`);
  }
  if (item.cancellation_policy?.trim()) {
    lines.push(`Política de cancelamento / reembolso:\n${item.cancellation_policy.trim()}`);
  }

  if (extras?.professional_names?.length) {
    lines.push(`Profissionais habilitados: ${extras.professional_names.join(", ")}`);
  }

  if (item.prerequisites?.trim()) {
    lines.push(`Pré-requisitos: ${item.prerequisites.trim()}`);
  }
  if (item.target_audience?.trim()) {
    lines.push(`Público-alvo / indicação:\n${item.target_audience.trim()}`);
  }

  if (item.description?.trim()) {
    lines.push("");
    lines.push("Descrição:");
    lines.push(item.description.trim());
  }
  if (item.faq_text?.trim()) {
    lines.push("");
    lines.push("Perguntas frequentes:");
    lines.push(item.faq_text.trim());
  }

  return lines.join("\n").trim() || "(Preencha nome e descrição para gerar o texto do RAG.)";
}
