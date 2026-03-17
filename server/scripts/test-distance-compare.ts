/**
 * Compara: distância usando lat/lng vs endereço completo.
 * Identifica se o problema está nas coordenadas das unidades.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXUS_DB_URL!,
  process.env.NEXUS_DB_ANON_KEY!
);

const key = process.env.GOOGLE_MAPS_API_KEY!;
const clientAddress = "Rua Luiza Matiello Hanser, Jardim Pagliato, Sorocaba - SP"; // ViaCEP para 18046166

const { data: units } = await supabase.from("units").select("name, address, cep, city, lat, lng").eq("status", "active");

console.log("Unidades e coordenadas:\n");
for (const u of units || []) {
  console.log(u.name);
  console.log("  address:", u.address);
  console.log("  lat,lng:", u.lat, u.lng);
  console.log("");
}

// Testar Julio de Mesquita: com lat,lng vs com address
const julio = units?.find((u: any) => u.name?.includes("Júlio") || u.name?.includes("Julio"));
if (!julio) {
  console.log("Julio de Mesquita não encontrado");
  process.exit(1);
}

const destByCoords = julio.lat && julio.lng ? `${julio.lat},${julio.lng}` : null;
const destByAddr = `${julio.address}, Sorocaba, SP, Brasil`;

console.log("--- TESTE: Rua Luiza Matiello Hanser → Julio de Mesquita ---\n");

// 1) Usando lat,lng (como o código atual faz)
if (destByCoords) {
  const url1 = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(clientAddress)}&destinations=${encodeURIComponent(destByCoords)}&mode=driving&key=${key}&language=pt-BR`;
  const r1 = await fetch(url1);
  const d1 = await r1.json();
  const el1 = d1.rows?.[0]?.elements?.[0];
  console.log("1) Usando lat,lng:", destByCoords);
  console.log("   Resultado:", el1?.status === "OK" ? `${el1.distance?.text} (${el1.distance?.value}m)` : el1?.status);
  console.log("");
}

// 2) Usando endereço completo
const url2 = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(clientAddress)}&destinations=${encodeURIComponent(destByAddr)}&mode=driving&key=${key}&language=pt-BR`;
const r2 = await fetch(url2);
const d2 = await r2.json();
const el2 = d2.rows?.[0]?.elements?.[0];
console.log("2) Usando endereço:", destByAddr);
console.log("   Resultado:", el2?.status === "OK" ? `${el2.distance?.text} (${el2.distance?.value}m)` : el2?.status);
console.log("   Destino resolvido:", d2.destination_addresses?.[0]);
