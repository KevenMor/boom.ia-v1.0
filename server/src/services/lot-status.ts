export const LOT_STATUSES = ["available", "reserved", "sold", "blocked"] as const;
export type LotStatus = (typeof LOT_STATUSES)[number];

export function parseLotStatus(raw: unknown): LotStatus | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  return (LOT_STATUSES as readonly string[]).includes(s) ? (s as LotStatus) : null;
}

/** Transições permitidas de status de lote. */
const ALLOWED: Record<LotStatus, LotStatus[]> = {
  available: ["reserved", "blocked", "sold"],
  reserved: ["available", "sold", "blocked"],
  blocked: ["available"],
  sold: ["available"],
};

export function canTransitionLotStatus(from: LotStatus, to: LotStatus): boolean {
  if (from === to) return true;
  return ALLOWED[from]?.includes(to) ?? false;
}

export function assertLotTransition(from: LotStatus, to: LotStatus): void {
  if (!canTransitionLotStatus(from, to)) {
    throw new Error(`invalid_lot_status_transition:${from}->${to}`);
  }
}
