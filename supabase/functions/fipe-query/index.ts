const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-nexus-auth, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIPE_API = "https://fipe.parallelum.com.br/api/v2";

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fuzzyIncludes(haystack: string, needle: string): boolean {
  const h = normalize(haystack);
  const n = normalize(needle);
  if (h.includes(n)) return true;
  const needleTokens = n.split(" ").filter((t) => t.length >= 3);
  return needleTokens.length > 0 && needleTokens.every((t) => h.includes(t));
}

function tokenize(input: string): string[] {
  return normalize(input)
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function scoreModelCandidate(candidateName: string, requestedModel: string, requestedVersion = ""): number {
  const candidate = normalize(candidateName);
  const modelTokens = tokenize(requestedModel);
  const versionTokens = tokenize(requestedVersion);

  let score = 0;

  if (candidate.includes(normalize(requestedModel))) score += 8;
  score += modelTokens.reduce((acc, t) => acc + (candidate.includes(t) ? 2 : 0), 0);
  score += versionTokens.reduce((acc, t) => acc + (candidate.includes(t) ? 5 : 0), 0);

  if (requestedVersion && candidate.includes(normalize(requestedVersion))) score += 12;

  return score;
}

async function fipeFetch(path: string) {
  const resp = await fetch(`${FIPE_API}${path}`);
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`FIPE API ${resp.status}: ${text.slice(0, 500)}`);
  }
  return resp.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { marca, modelo, versao, ano, codigo_fipe, tipo } = await req.json();

    // Vehicle type mapping
    const vehicleType = tipo === 2 ? "motorcycles" : tipo === 3 ? "trucks" : "cars";

    // Step 1: Get brands
    const brands: { code: string; name: string }[] = await fipeFetch(`/${vehicleType}/brands`);

    if (!marca) {
      return new Response(JSON.stringify({
        message: "Informe a marca para consultar. Marcas disponíveis:",
        marcas: brands.map(b => b.name).slice(0, 60),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Find matching brand
    const matchedBrand = brands.find(b => fuzzyIncludes(b.name, marca));
    if (!matchedBrand) {
      const partials = brands.filter(b => normalize(b.name).includes(normalize(marca).split(" ")[0]));
      return new Response(JSON.stringify({
        error: `Marca "${marca}" não encontrada`,
        sugestoes: partials.length > 0 ? partials.map(b => b.name) : brands.slice(0, 20).map(b => b.name),
      }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Step 2: Get models
    const models: { code: string; name: string }[] = await fipeFetch(`/${vehicleType}/brands/${matchedBrand.code}/models`);

    if (!modelo) {
      return new Response(JSON.stringify({
        marca: matchedBrand.name,
        message: "Informe o modelo para consultar. Modelos disponíveis:",
        modelos: models.map(m => m.name),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Find matching model (fuzzy) — collect ALL candidates
    const allMatchingModels = models.filter(m => fuzzyIncludes(m.name, modelo));
    let candidates = allMatchingModels.length > 0 ? allMatchingModels : [];

    if (candidates.length === 0) {
      const normalizedModelo = normalize(modelo);
      const tokens = normalizedModelo.split(" ").filter(t => t.length >= 2);
      candidates = models.filter(m => {
        const nm = normalize(m.name);
        return tokens.every(t => nm.includes(t));
      });
      if (candidates.length === 0 && tokens.length > 0) {
        candidates = models.filter(m => normalize(m.name).includes(tokens[0]));
      }
    }

    if (candidates.length === 0) {
      return new Response(JSON.stringify({
        error: `Modelo "${modelo}" não encontrado para ${matchedBrand.name}`,
        sugestoes: models.slice(0, 20).map(m => m.name),
      }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Prioritize candidate that best matches requested model + version (when provided)
    const requestedVersion = typeof versao === "string" ? versao : "";
    candidates = [...candidates].sort((a, b) => {
      const sa = scoreModelCandidate(a.name, modelo, requestedVersion);
      const sb = scoreModelCandidate(b.name, modelo, requestedVersion);
      if (sb !== sa) return sb - sa;
      return a.name.length - b.name.length;
    });

    if (ano) {
      // Check candidates in ranking order and return first that supports requested year
      const checked: string[] = [];
      for (const candidate of candidates) {
        checked.push(candidate.name);
        try {
          const years: { code: string; name: string }[] = await fipeFetch(`/${vehicleType}/brands/${matchedBrand.code}/models/${candidate.code}/years`);
          const matchedYear = years.find(y => y.name.includes(String(ano)) || y.code.includes(String(ano)));
          if (!matchedYear) continue;

          const priceData = await fipeFetch(`/${vehicleType}/brands/${matchedBrand.code}/models/${candidate.code}/years/${matchedYear.code}`);
          return new Response(JSON.stringify({
            marca: matchedBrand.name,
            modelo: candidate.name,
            versao_considerada: requestedVersion || null,
            ano: matchedYear.name,
            resultado: priceData,
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        } catch {
          // keep trying next candidate
        }
      }

      return new Response(JSON.stringify({
        error: `Ano ${ano} não encontrado para "${modelo}" da ${matchedBrand.name}`,
        versao_considerada: requestedVersion || null,
        modelos_verificados: checked,
      }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // No year — use shortest candidate
    candidates.sort((a, b) => a.name.length - b.name.length);

    // No year provided — use first (shortest) candidate
    const matchedModel = candidates[0];
    const years: { code: string; name: string }[] = await fipeFetch(`/${vehicleType}/brands/${matchedBrand.code}/models/${matchedModel.code}/years`);

    // No year — return all years with prices (fetch top 3 for convenience)
    const topYears = years.slice(0, 5);
    const pricesPromises = topYears.map(async (y) => {
      try {
        const data = await fipeFetch(`/${vehicleType}/brands/${matchedBrand.code}/models/${matchedModel.code}/years/${y.code}`);
        return { ano: y.name, ...data };
      } catch {
        return { ano: y.name, error: "Não disponível" };
      }
    });

    const prices = await Promise.all(pricesPromises);

    return new Response(JSON.stringify({
      marca: matchedBrand.name,
      modelo: matchedModel.name,
      precos: prices,
      todos_anos: years.map(y => y.name),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("fipe-query error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
