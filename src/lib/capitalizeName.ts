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
