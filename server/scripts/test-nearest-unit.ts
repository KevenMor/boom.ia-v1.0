/**
 * Teste rápido da tool nearest-unit com Google Maps
 * Uso: npx tsx scripts/test-nearest-unit.ts [cep]
 */
import "dotenv/config";
import { runFindNearestUnit } from "../src/services/find-nearest-unit.js";

const cep = process.argv[2] || "18052490";
const tenantId = process.argv[3]; // opcional

console.log("Testando consultar_unidade...");
console.log("CEP:", cep, tenantId ? `tenant_id: ${tenantId}` : "(todas unidades)");
console.log("GOOGLE_MAPS_API_KEY:", process.env.GOOGLE_MAPS_API_KEY ? "configurada" : "NÃO configurada");
console.log("---");

const result = await runFindNearestUnit(
  cep,
  tenantId,
  process.env.NEXUS_DB_URL,
  process.env.NEXUS_DB_ANON_KEY,
  process.env.GOOGLE_MAPS_API_KEY
);

console.log(JSON.stringify(result, null, 2));
