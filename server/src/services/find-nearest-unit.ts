import { createClient } from "@supabase/supabase-js";

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function runFindNearestUnit(
  cep: string,
  tenantId?: string,
  nexusUrl?: string,
  nexusKey?: string,
  googleMapsKey?: string
): Promise<unknown> {
  const FALLBACK_URL = "https://boomsolution-supabase.kgn6uc.easypanel.host";
  const FALLBACK_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE";

  const url = nexusUrl || FALLBACK_URL;
  const key = nexusKey || FALLBACK_KEY;
  const supabase = createClient(url, key);

  const cleanCep = cep.replace(/\D/g, "");
  const viaCepResp = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
  const viaCepData = (await viaCepResp.json()) as {
    erro?: boolean;
    logradouro?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
  };

  if (viaCepData.erro) {
    throw Object.assign(new Error("CEP não encontrado"), { status: 404 });
  }

  // Endereço para Google Maps: quando logradouro vazio, usar CEP + cidade (formato que a API aceita)
  const logr = (viaCepData.logradouro || "").trim();
  const bairro = (viaCepData.bairro || "").trim();
  const cidade = (viaCepData.localidade || "").trim();
  const uf = (viaCepData.uf || "").trim();
  const clientAddress = logr
    ? [logr, bairro, `${cidade} - ${uf}`].filter(Boolean).join(", ")
    : `${cleanCep}, ${cidade}, ${uf}, Brasil`;

  let query = supabase.from("units").select("*").eq("status", "active");
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const { data: units, error: unitsErr } = await query;

  if (unitsErr || !units?.length) {
    throw Object.assign(new Error("Nenhuma unidade encontrada"), {
      status: 404,
      detail: unitsErr?.message,
    });
  }

  if (googleMapsKey) {
    try {
      // Destinos: SEMPRE usar endereço completo — lat/lng da tabela podem estar incorretos e geram distâncias erradas.
      // O Google geocodifica o endereço corretamente para cálculo de rota.
      const destinations = units
        .slice(0, 25)
        .map((u: any) => {
          const addr = u.address?.trim();
          const city = (u.city || "").trim();
          if (addr) return `${addr}, ${city || "Sorocaba"}, SP, Brasil`;
          if (u.cep) return `${u.cep}, ${city || "Sorocaba"}, SP, Brasil`;
          return u.lat && u.lng ? `${u.lat},${u.lng}` : null;
        })
        .filter(Boolean)
        .join("|");

      const dmUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(clientAddress)}&destinations=${encodeURIComponent(destinations)}&mode=driving&key=${googleMapsKey}&language=pt-BR`;
      const dmResp = await fetch(dmUrl);
      const dmData = (await dmResp.json()) as {
        status?: string;
        error_message?: string;
        rows?: { elements: Array<{ status?: string; distance?: { value: number; text: string }; duration?: { value: number; text: string } }> }[];
      };

      if (dmData.status === "OK" && dmData.rows?.[0]?.elements) {
        const elements = dmData.rows[0].elements;
        const unitsToUse = units.slice(0, 25);
        const results = unitsToUse.map((unit: any, i: number) => {
          const el = elements[i];
          const distMeters = el?.status === "OK" && el?.distance ? el.distance.value : Infinity;
          const durationSecs = el?.status === "OK" && el?.duration ? el.duration.value : null;
          return {
            unit_name: unit.name,
            unit_address: unit.address,
            unit_cep: unit.cep,
            city: unit.city,
            distance_km: distMeters !== Infinity ? Math.round((distMeters / 1000) * 10) / 10 : null,
            distance_text: el?.status === "OK" && el?.distance ? el.distance.text : "indisponível",
            duration_text: el?.status === "OK" && el?.duration ? el.duration.text : "indisponível",
            distance_meters: distMeters === Infinity ? null : distMeters,
            duration_seconds: durationSecs,
          };
        });
        results.sort(
          (a: any, b: any) => (a.distance_meters ?? Infinity) - (b.distance_meters ?? Infinity)
        );
        return {
          client_cep: cleanCep,
          client_address: clientAddress,
          nearest: results[0],
          all_units: results,
          method: "google_maps",
        };
      }
      if (dmData.status && dmData.status !== "OK") {
        console.warn(
          "[find-nearest-unit] Google Maps API:", dmData.status,
          dmData.error_message ? `— ${dmData.error_message}` : ""
        );
      }
    } catch (e) {
      console.warn("[find-nearest-unit] Google Maps falhou, usando Haversine:", e);
    }
  } else {
    console.warn("[find-nearest-unit] GOOGLE_MAPS_API_KEY não configurada — usando distância em linha reta (Haversine)");
  }

  let clientLat: number | null = null;
  let clientLng: number | null = null;

  try {
    const geoResp = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${cleanCep}+${viaCepData.localidade}+Brazil&limit=1`,
      { headers: { "User-Agent": "NexusAI/1.0" } }
    );
    const geoData = (await geoResp.json()) as Array<{ lat?: string; lon?: string }>;
    if (geoData?.[0]) {
      clientLat = parseFloat(geoData[0].lat ?? "0");
      clientLng = parseFloat(geoData[0].lon ?? "0");
    }
  } catch (e) {
    console.warn("Geocoding falhou:", e);
  }

  if (clientLat === null || clientLng === null) {
    return {
      error: "Não foi possível determinar as coordenadas do CEP",
      client_address: clientAddress,
      units: units.map((u: any) => ({ name: u.name, address: u.address, cep: u.cep })),
    };
  }

  const results = units
    .filter((u: any) => u.lat && u.lng)
    .map((unit: any) => {
      const dist = haversineKm(clientLat!, clientLng!, unit.lat, unit.lng);
      return {
        unit_name: unit.name,
        unit_address: unit.address,
        unit_cep: unit.cep,
        city: unit.city,
        distance_km: Math.round(dist * 10) / 10,
        distance_text: `${dist.toFixed(1)} km (linha reta)`,
      };
    })
    .sort((a: any, b: any) => a.distance_km - b.distance_km);

  return {
    client_cep: cleanCep,
    client_address: clientAddress,
    nearest: results[0] || null,
    all_units: results,
    method: "haversine",
  };
}
