/** Promoção vigente Sunset Thermas Park — hospedagem 25% OFF (jul/2026). */
export const SUNSET_LODGING_PROMO = {
  discountPercent: 25,
  reservationUntil: "2026-07-31",
  stayCheckInUntil: "2026-12-31",
  label: "25% OFF em hospedagem",
  notCumulative: true,
  benefits: [
    "Jantar e café da manhã inclusos",
    "Acesso gratuito ao parque aquático",
  ],
} as const;

export type SunsetLodgingPromotionInfo = {
  active: true;
  label: string;
  discount_percent: number;
  reservation_until: string;
  stay_until: string;
  not_cumulative: true;
  benefits: string[];
};

function brasiliaTodayIso(referenceDate: Date = new Date()): string {
  return referenceDate.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

/** Reservas para a promoção podem ser feitas até 31/07/2026 (data de Brasília). */
export function isSunsetLodgingPromoReservationOpen(referenceDate: Date = new Date()): boolean {
  return brasiliaTodayIso(referenceDate) <= SUNSET_LODGING_PROMO.reservationUntil;
}

/** Estadia elegível: check-in até 31/12/2026. Exclusões (Carnaval/Natal/Réveillon) seguem o calendário. */
export function isSunsetLodgingPromoEligibleForStay(
  checkIn: string,
  referenceDate: Date = new Date()
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) return false;
  if (!isSunsetLodgingPromoReservationOpen(referenceDate)) return false;
  return checkIn <= SUNSET_LODGING_PROMO.stayCheckInUntil;
}

export function applySunsetLodgingPromoPrice(listPrice: number): number {
  const factor = 1 - SUNSET_LODGING_PROMO.discountPercent / 100;
  return Math.round(listPrice * factor * 100) / 100;
}

export function buildSunsetLodgingPromotionInfo(): SunsetLodgingPromotionInfo {
  return {
    active: true,
    label: SUNSET_LODGING_PROMO.label,
    discount_percent: SUNSET_LODGING_PROMO.discountPercent,
    reservation_until: SUNSET_LODGING_PROMO.reservationUntil,
    stay_until: SUNSET_LODGING_PROMO.stayCheckInUntil,
    not_cumulative: true,
    benefits: [...SUNSET_LODGING_PROMO.benefits],
  };
}

/** Frase obrigatória no orçamento: 25% OFF + prazo de reserva até 31/07. */
export function formatSunsetLodgingPromoQuoteLine(): string {
  return (
    " Estamos com 25% OFF em qualquer data de hospedagem, com reservas realizadas até 31/07/2026 " +
    "(válida somente até essa data). Os valores abaixo já incluem o desconto e o pacote fechado " +
    "(pernoite + jantar + café + acesso ao parque)."
  );
}
