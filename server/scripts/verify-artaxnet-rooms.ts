/**
 * CLI — valida busca Artaxnet GET /api/rooms
 *
 * Uso:
 *   cd server && npx tsx scripts/verify-artaxnet-rooms.ts --check-in 2026-06-10 --check-out 2026-06-15 --adults 2 --kids 0
 *   cd server && npx tsx scripts/verify-artaxnet-rooms.ts --check-in 2026-06-10 --check-out 2026-06-15 --adults 2 --kids 0 --show-ota
 */

import { runArtaxnetAvailabilityQuery } from "../src/services/artaxnet-availability.js";

function readArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

const checkIn = readArg("check-in");
const checkOut = readArg("check-out");
const adults = readArg("adults");
const kids = readArg("kids") ?? readArg("children");
const coupon = readArg("coupon");
const showOta = process.argv.includes("--show-ota");
const baseUrl = readArg("base-url");

if (!checkIn || !checkOut) {
  console.error(
    "Uso: npx tsx scripts/verify-artaxnet-rooms.ts --check-in YYYY-MM-DD --check-out YYYY-MM-DD [--adults 2] [--kids 0] [--show-ota]"
  );
  process.exit(1);
}

const execConfig = baseUrl ? { base_url: baseUrl } : null;

runArtaxnetAvailabilityQuery(
  {
    checkIn,
    checkOut,
    adults: adults != null ? Number(adults) : 2,
    children: kids != null ? Number(kids) : 0,
    coupon,
  },
  execConfig
)
  .then((data) => {
    console.log("roomCount:", data.roomCount);
    console.log("cartId:", data.cartId);
    console.log("bookingUrl:", data.bookingUrl);
    console.log("otaComparisonEnabled:", data.otaComparisonEnabled);
    if (showOta && data.rooms[0]?.otaComparison) {
      console.log("\nOTA comparison (first room):");
      for (const o of data.rooms[0].otaComparison) {
        console.log(`  ${o.otaName} (+${o.commissionPercent}%): R$ ${o.approximateTotal.toFixed(2)}`);
      }
    }
    console.log("\n--- summaryText ---\n");
    console.log(data.summaryText);
  })
  .catch((err) => {
    console.error("Erro:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
