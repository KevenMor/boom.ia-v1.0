import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-nexus-auth, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Haversine distance in km (fallback when Google Maps fails)
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const FALLBACK_URL = "https://boomsolution-supabase.kgn6uc.easypanel.host";
    const FALLBACK_KEY =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE";

    const nexusUrl = Deno.env.get("NEXUS_DB_URL") || FALLBACK_URL;
    const nexusKey = Deno.env.get("NEXUS_DB_ANON_KEY") || FALLBACK_KEY;
    const googleMapsKey = Deno.env.get("GOOGLE_MAPS_API_KEY");

    const nexusAuth = req.headers.get("x-nexus-auth");
    const supabase = createClient(nexusUrl, nexusKey, {
      global: { headers: nexusAuth ? { Authorization: `Bearer ${nexusAuth}` } : {} },
    });

    const { cep, tenant_id } = await req.json();

    if (!cep) {
      return new Response(JSON.stringify({ error: "CEP é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Consulta ViaCEP para obter endereço do cliente
    const cleanCep = cep.replace(/\D/g, "");
    const viaCepResp = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
    const viaCepData = await viaCepResp.json();

    if (viaCepData.erro) {
      return new Response(JSON.stringify({ error: "CEP não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientAddress = `${viaCepData.logradouro}, ${viaCepData.bairro}, ${viaCepData.localidade} - ${viaCepData.uf}`;

    // 2. Buscar unidades do tenant
    let query = supabase.from("units").select("*").eq("status", "active");
    if (tenant_id) query = query.eq("tenant_id", tenant_id);

    const { data: units, error: unitsErr } = await query;

    if (unitsErr || !units?.length) {
      return new Response(
        JSON.stringify({ error: "Nenhuma unidade encontrada", detail: unitsErr?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Tentar Google Maps Distance Matrix
    if (googleMapsKey) {
      try {
        const destinations = units
          .map((u) => (u.lat && u.lng ? `${u.lat},${u.lng}` : u.address || `${u.cep}`))
          .join("|");

        const origin = encodeURIComponent(clientAddress);
        const dests = encodeURIComponent(destinations);

        const dmResp = await fetch(
          `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${dests}&key=${googleMapsKey}&language=pt-BR`
        );
        const dmData = await dmResp.json();

        if (dmData.status === "OK" && dmData.rows?.[0]?.elements) {
          const elements = dmData.rows[0].elements;
          let bestIdx = -1;
          let bestDistance = Infinity;

          const results = units.map((unit, i) => {
            const el = elements[i];
            const distMeters = el?.status === "OK" ? el.distance.value : Infinity;
            const durationSecs = el?.status === "OK" ? el.duration.value : null;

            if (distMeters < bestDistance) {
              bestDistance = distMeters;
              bestIdx = i;
            }

            return {
              unit_name: unit.name,
              unit_address: unit.address,
              unit_cep: unit.cep,
              city: unit.city,
              distance_text: el?.status === "OK" ? el.distance.text : "indisponível",
              duration_text: el?.status === "OK" ? el.duration.text : "indisponível",
              distance_meters: distMeters === Infinity ? null : distMeters,
              duration_seconds: durationSecs,
            };
          });

          // Ordenar por distância
          results.sort((a, b) => (a.distance_meters ?? Infinity) - (b.distance_meters ?? Infinity));

          return new Response(
            JSON.stringify({
              client_cep: cleanCep,
              client_address: clientAddress,
              nearest: results[0],
              all_units: results,
              method: "google_maps",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (e) {
        console.warn("Google Maps falhou, usando Haversine:", e);
      }
    }

    // 4. Fallback: Geocodificar o CEP do cliente e usar Haversine
    // Usar coordenadas aproximadas via Nominatim (gratuito)
    let clientLat: number | null = null;
    let clientLng: number | null = null;

    try {
      const geoResp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${cleanCep}+${viaCepData.localidade}+Brazil&limit=1`,
        { headers: { "User-Agent": "NexusAI/1.0" } }
      );
      const geoData = await geoResp.json();
      if (geoData?.[0]) {
        clientLat = parseFloat(geoData[0].lat);
        clientLng = parseFloat(geoData[0].lon);
      }
    } catch (e) {
      console.warn("Geocoding falhou:", e);
    }

    if (clientLat === null || clientLng === null) {
      return new Response(
        JSON.stringify({
          error: "Não foi possível determinar as coordenadas do CEP",
          client_address: clientAddress,
          units: units.map((u) => ({ name: u.name, address: u.address, cep: u.cep })),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = units
      .filter((u) => u.lat && u.lng)
      .map((unit) => {
        const dist = haversineKm(clientLat!, clientLng!, unit.lat, unit.lng);
        return {
          unit_name: unit.name,
          unit_address: unit.address,
          unit_cep: unit.cep,
          city: unit.city,
          distance_km: Math.round(dist * 10) / 10,
          distance_text: `${(dist).toFixed(1)} km (linha reta)`,
        };
      })
      .sort((a, b) => a.distance_km - b.distance_km);

    return new Response(
      JSON.stringify({
        client_cep: cleanCep,
        client_address: clientAddress,
        nearest: results[0] || null,
        all_units: results,
        method: "haversine",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("find-nearest-unit error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
