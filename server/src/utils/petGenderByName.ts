/**
 * Inferência de gênero de pet por nome.
 * Usado pela Pet Home para evitar perguntar "macho ou fêmea?" quando o nome indica claramente.
 */

/** Nomes tipicamente femininos de pets (cachorros) no Brasil. */
const FEMALE_NAMES = new Set(
  [
    "zara", "luna", "mel", "lola", "nina", "belinha", "frida", "amora", "maia", "meggie", "pandora",
    "jade", "ayla", "maya", "lili", "lilly", "lily", "bella", "sofia", "alice",
    "nega", "preta", "branca", "floquinha", "doce", "dulce", "linda", "lindinha",
    "fofa", "fofinha", "princesa", "rainha", "estrela", "flor", "florzinha", "margarida", "rosa",
    "violeta", "jasmine", "jasmim", "lua", "aurora", "noelle", "chica", "chiquinha", "mimi", "mimosa",
    "cacau", "pipoca", "honey", "sweet", "sweetie", "lady", "molly", "maggie", "daisy", "lucy", "sadie", "chloe",
    "coco", "cocoa", "nutella", "biscoito", "cookie", "brownie", "truffle",
    "penny", "pearl", "ruby", "esmeralda", "diamante", "prata",
    "malu", "manu", "mariana", "marina", "kira", "kiara", "nala",
    "tinker", "tinkerbell", "fada", "fadinha", "xuxa", "yuki", "zoe", "zoey",
    "bela", "cindy", "duda", "eva", "gigi", "helena", "iris", "julieta", "kika",
    "olivia", "queen", "ruth", "sarah", "tina", "ursula", "wanda", "yara",
  ].map((n) => n.toLowerCase())
);

/** Nomes tipicamente masculinos de pets (cachorros) no Brasil. */
const MALE_NAMES = new Set(
  [
    "thor", "rex", "bob", "zeus", "toby", "max", "duke", "rocky", "buddy", "jack",
    "chico", "bruno", "lucky", "bento", "caramelo", "simba", "mufasa", "bolt", "marley",
    "apolo", "atlas", "django", "eddie", "fred", "gordo", "hulk", "igor", "jake", "kiko",
    "leo", "mike", "nero", "oscar", "paco", "quico", "ralph", "spike", "ted", "ursinho",
    "vitor", "willy", "xerxes", "yoda",
  ].map((n) => n.toLowerCase())
);

/** Normaliza nome para comparação (remove acentos, lowercase, trim). */
function normalizeName(name: string): string {
  return (name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Infere o gênero do pet pelo nome.
 * @returns 'f' = fêmea, 'm' = macho, null = ambíguo ou desconhecido
 */
export function inferPetGenderFromName(name: string): "f" | "m" | null {
  const n = normalizeName(name);
  if (!n || n.length < 2) return null;
  if (FEMALE_NAMES.has(n)) return "f";
  if (MALE_NAMES.has(n)) return "m";
  return null;
}

/**
 * Extrai o nome do pet das mensagens da conversa.
 * Procura padrões comuns: "meu cachorro é a X", "a X", "chama X", "nome X", resposta à pergunta "qual o nome?"
 */
export function extractPetNameFromMessages(
  messages: Array<{ role: string; content: string }>
): string | null {
  const userMessages = messages
    .filter((m) => m.role === "user")
    .map((m) => (m.content || "").trim())
    .filter(Boolean);

  if (userMessages.length === 0) return null;

  // Padrões para extrair nome do pet (ordem: mais específico primeiro)
  const patterns = [
    // "meu cachorro é a Zara" / "minha cachorra é a Luna" / "o doguinho é o Thor"
    /(?:meu|minha|o|a)\s+(?:cachorro|cachorra|doguinho|cachorrinho|cachorrinha|pet)\s+(?:e|eh|é)\s+(?:a\s+|o\s+)?([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s-]{1,24})/i,
    // "chama Zara" / "se chama Luna"
    /(?:chama|se\s+chama)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s-]{1,24})/i,
    // "é a Zara" / "é o Thor"
    /(?:e|eh|é)\s+(?:a\s+|o\s+)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s-]{1,24})/i,
    // "nome Zara" / "nome do pet: Zara"
    /nome\s+(?:do\s+pet\s*[:\s]*)?([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s-]{1,24})/i,
    // "a Zara" / "o Thor" (resposta curta à pergunta de nome)
    /^(?:a\s+|o\s+)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s-]{1,24})$/im,
    // "Zara" sozinho ou "Zara, poodle" (primeira palavra como nome)
    /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ-]{0,23})(?:\s|,|\.|$)/im,
  ];

  for (const msg of userMessages) {
    for (const re of patterns) {
      const m = msg.match(re);
      if (m && m[1]) {
        const name = m[1].trim().replace(/\s+/g, " ");
        // Filtrar palavras que não são nomes de pet
        const notPetName = /^(sim|nao|não|creche|hospedagem|ok|obrigad|obrigado|obrigada|talvez|depois|agora|hoje|amanha|amanhã|segunda|terca|quarta|quinta|sexta|sabado|domingo|poodle|srd|vira.?lata|pequeno|medio|grande|castrad|vacina)$/i;
        if (name.length >= 2 && name.length <= 25 && !notPetName.test(name)) {
          return name;
        }
      }
    }
  }

  return null;
}

/**
 * Retorna contexto de pet para injetar no prompt quando nome e gênero forem inferíveis.
 */
export function buildPetGenderContext(
  messages: Array<{ role: string; content: string }>
): string | null {
  const name = extractPetNameFromMessages(messages);
  if (!name) return null;

  const gender = inferPetGenderFromName(name);
  if (!gender) return null;

  const label = gender === "f" ? "fêmea" : "macho";
  return `[DADOS DO PET] Nome informado: ${name}. Gênero inferido pelo nome: ${label}. Use pronomes e artigos adequados (ela/a para fêmea, ele/o para macho). NÃO pergunte "é macho ou fêmea?" — o nome já indica.`;
}
