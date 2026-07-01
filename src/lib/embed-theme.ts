export type EmbedTheme = "light" | "dark";

export type MegaEmbedColors = {
  bg?: string | null;
  surface?: string | null;
  surface2?: string | null;
  border?: string | null;
  text?: string | null;
  muted?: string | null;
  brand?: string | null;
};

function readParamBag(raw: string): URLSearchParams {
  return new URLSearchParams(raw.replace(/^[?#]/, ""));
}

function normalizeTheme(raw: string | null | undefined): EmbedTheme {
  return raw?.trim().toLowerCase() === "dark" ? "dark" : "light";
}

export function readEmbedThemeFromLocation(loc: Location = window.location): EmbedTheme {
  const search = readParamBag(loc.search);
  const fromSearch = search.get("theme");
  if (fromSearch) return normalizeTheme(fromSearch);

  if (loc.hash) {
    const fromHash = readParamBag(loc.hash).get("theme");
    if (fromHash) return normalizeTheme(fromHash);
  }

  return "light";
}

function parseMegaColors(raw: unknown): MegaEmbedColors | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const pick = (key: string) => {
    const v = obj[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const colors: MegaEmbedColors = {
    bg: pick("bg"),
    surface: pick("surface"),
    surface2: pick("surface2"),
    border: pick("border"),
    text: pick("text"),
    muted: pick("muted"),
    brand: pick("brand"),
  };
  return Object.values(colors).some(Boolean) ? colors : undefined;
}

function isOpaqueColor(value: string | null | undefined): value is string {
  if (!value || value === "transparent") return false;
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) return true;
  const parts = match[1].split(",");
  if (parts.length === 4 && parseFloat(parts[3]) === 0) return false;
  return true;
}

export function applyEmbedTheme(theme: EmbedTheme, colors?: MegaEmbedColors | null): void {
  const root = document.documentElement;
  const dark = theme === "dark";
  root.classList.toggle("dark", dark);
  root.classList.toggle("light", !dark);
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;

  if (!colors) return;

  const style = root.style;
  if (isOpaqueColor(colors.bg)) {
    style.setProperty("--background", colors.bg);
    style.setProperty("--cw-surface", colors.bg);
  }
  if (isOpaqueColor(colors.surface)) {
    style.setProperty("--card", colors.surface);
  }
  if (isOpaqueColor(colors.border)) {
    style.setProperty("--border", colors.border);
  }
  if (isOpaqueColor(colors.text)) {
    style.setProperty("--foreground", colors.text);
  }
  if (isOpaqueColor(colors.muted)) {
    style.setProperty("--muted-foreground", colors.muted);
  }
  if (isOpaqueColor(colors.brand)) {
    style.setProperty("--primary", colors.brand);
    style.setProperty("--cw-brand", colors.brand);
  }
}

export function parseEmbedThemeFromMessage(
  data: unknown,
): { theme: EmbedTheme; colors?: MegaEmbedColors } | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  if (obj.type !== "boom-ia-embed:theme" && obj.type !== "boom-ia-embed:init") return null;
  if (obj.theme == null) return null;
  return {
    theme: normalizeTheme(String(obj.theme)),
    colors: parseMegaColors(obj.colors),
  };
}
