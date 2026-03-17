/**
 * Teste direto da Google Distance Matrix API entre dois endereços.
 * Uso: npx tsx scripts/test-distance-direct.ts
 *
 * Origem: Av. Dr. Américo Figueiredo, 3275 - Julio de Mesquita (unidade)
 * Destino: Rua Luiza Matiello Hanser 200, CEP 18046-166 (cliente)
 */
import "dotenv/config";

const key = process.env.GOOGLE_MAPS_API_KEY;
if (!key) {
  console.error("GOOGLE_MAPS_API_KEY não configurada");
  process.exit(1);
}

const origin = "Av. Dr. Américo Figueiredo, 3275 - Julio de Mesquita, Sorocaba, SP, Brasil";
const dest = "Rua Luiza Matiello Hanser, 200, Sorocaba, SP, 18046-166, Brasil";

console.log("Consultando Google Distance Matrix API...");
console.log("Origem:", origin);
console.log("Destino:", dest);
console.log("---");

const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(dest)}&mode=driving&key=${key}&language=pt-BR`;

const resp = await fetch(url);
const data = (await resp.json()) as {
  status?: string;
  origin_addresses?: string[];
  destination_addresses?: string[];
  rows?: { elements: Array<{ status?: string; distance?: { value: number; text: string }; duration?: { value: number; text: string } }> }[];
};

console.log("Status:", data.status);
if (data.origin_addresses?.[0]) console.log("Origem resolvida:", data.origin_addresses[0]);
if (data.destination_addresses?.[0]) console.log("Destino resolvido:", data.destination_addresses[0]);

const el = data.rows?.[0]?.elements?.[0];
if (el?.status === "OK") {
  console.log("\n--- RESULTADO ---");
  console.log("Distância:", el.distance?.text, `(${el.distance?.value} metros)`);
  console.log("Tempo:", el.duration?.text, `(${el.duration?.value} segundos)`);
  console.log("Distância em km:", ((el.distance?.value ?? 0) / 1000).toFixed(2));
} else {
  console.log("Erro:", el?.status || data.status, JSON.stringify(data, null, 2));
}
