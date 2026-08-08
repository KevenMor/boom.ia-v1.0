/**
 * Capitaliza a primeira letra de cada palavra (nome e sobrenome).
 * Palavras são separadas por espaços; acentos não iniciam nova palavra.
 * Ex: "keven moreira" -> "Keven Moreira", "josé silva" -> "José Silva"
 */
export function capitalizeName(name: string): string {
  if (!name || typeof name !== "string") return name;
  return name
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (!word) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Capitaliza as iniciais de cada palavra em tempo real mantendo espaços adicionais intactos durante a digitação.
 */
export function capitalizeAsYouType(val: string): string {
  if (!val || typeof val !== "string") return val;
  return val
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) return part;
      if (part.length > 0) {
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      }
      return part;
    })
    .join("");
}
