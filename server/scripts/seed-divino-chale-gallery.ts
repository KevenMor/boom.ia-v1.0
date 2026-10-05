/**
 * Cria galeria "Divino Chalé" e faz upload das fotos oficiais no Storage.
 *
 * Uso:
 *   cd server && npx tsx scripts/seed-divino-chale-gallery.ts
 *
 * Fotos esperadas em:
 *   ~/.cursor/projects/Users-noname-Documents-boom-ia-v1-0/assets/
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

const TENANT_ID = "7bc760ef-1a32-4552-ad0c-43f5a3e45bc9";
const GALLERY_NAME = "Divino Chalé";

const ASSETS_DIR =
  process.env.DIVINO_PHOTOS_DIR ||
  join(
    process.env.HOME || "",
    ".cursor/projects/Users-noname-Documents-boom-ia-v1-0/assets",
  );

const PHOTOS: Array<{ file: string; caption: string }> = [
  {
    file: "PHOTO-2026-10-05-15-32-14-409ac986-2109-4f79-bb2c-c5fb7ebe8c62.jpg",
    caption: "Lareira externa à noite com taça de vinho",
  },
  {
    file: "image-46575e5f-b309-4314-b7d2-700ce146b84a.jpg",
    caption: "Fachada do chalé iluminada à noite",
  },
  {
    file: "image-60b87ed6-fa2f-4cdf-81ad-f2ef0aa8df12.jpg",
    caption: "Interior com vista pela fachada de vidro",
  },
  {
    file: "image-e824061e-09c6-4c2a-aeed-0106a72d1214.jpg",
    caption: "Suíte romântica com vista",
  },
  {
    file: "image-3ac0a9db-b2f8-400f-9824-9136d8e8ad49.jpg",
    caption: "Mesa externa com tábua e vinho ao entardecer",
  },
  {
    file: "image-e50056d4-1212-4142-98d2-e947245e88e7.jpg",
    caption: "Pergolado, balanço e lareira à noite",
  },
];

function loadEnv() {
  return Object.fromEntries(
    readFileSync(new URL("../.env", import.meta.url), "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}

async function main() {
  const env = loadEnv();
  const sb = createClient(env.NEXUS_DB_URL!, env.NEXUS_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  for (const p of PHOTOS) {
    const full = join(ASSETS_DIR, p.file);
    if (!existsSync(full)) {
      console.error("Foto não encontrada:", full);
      process.exit(1);
    }
  }

  let { data: gallery } = await sb
    .from("suite_galleries")
    .select("id, name, media_urls, cover_image_url")
    .eq("tenant_id", TENANT_ID)
    .ilike("name", "%Divino%")
    .maybeSingle();

  if (!gallery) {
    const { data: created, error } = await sb
      .from("suite_galleries")
      .insert({
        tenant_id: TENANT_ID,
        name: GALLERY_NAME,
        description: "Fotos do Divino Chalé para envio no WhatsApp quando o cliente pedir.",
        llm_media_guidance:
          "Quando o cliente pedir fotos, manda/mostra, envie o photos_markdown completo desta galeria. Não peça confirmação extra. Não invente URLs.",
        media_urls: [],
        display_order: 0,
        omnibees_room: [],
      })
      .select("id, name, media_urls, cover_image_url")
      .single();
    if (error || !created) {
      console.error("create gallery:", error);
      process.exit(1);
    }
    gallery = created;
    console.log("Galeria criada:", gallery.id);
  } else {
    console.log("Galeria existente:", gallery.id);
  }

  const media: Array<{ type: string; url: string; caption?: string }> = [];
  for (const p of PHOTOS) {
    const full = join(ASSETS_DIR, p.file);
    const buf = readFileSync(full);
    const objectId = randomUUID();
    // Sem extensão no path (nginx bloqueia .jpg em alguns hosts)
    const path = `${TENANT_ID}/${gallery.id}/photo-${objectId}`;
    const { error: upErr } = await sb.storage.from("suite-galleries").upload(path, buf, {
      upsert: true,
      contentType: "image/jpeg",
    });
    if (upErr) {
      console.error("upload", p.file, upErr);
      process.exit(1);
    }
    const { data: pub } = sb.storage.from("suite-galleries").getPublicUrl(path);
    const url = `${pub.publicUrl}?t=${Date.now()}`;
    media.push({ type: "photo", url, caption: p.caption });
    console.log("OK", p.file, "→", path);
  }

  const cover = media[0]?.url ?? null;
  const { data: updated, error: updErr } = await sb
    .from("suite_galleries")
    .update({
      name: GALLERY_NAME,
      description: "Fotos do Divino Chalé para envio no WhatsApp quando o cliente pedir.",
      llm_media_guidance:
        "Quando o cliente pedir fotos, manda/mostra, envie o photos_markdown completo desta galeria. Não peça confirmação extra. Não invente URLs.",
      media_urls: media,
      cover_image_url: cover,
      updated_at: new Date().toISOString(),
    })
    .eq("id", gallery.id)
    .select("id, name, cover_image_url")
    .single();
  if (updErr) {
    console.error("update gallery:", updErr);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        gallery: updated,
        photos: media.length,
        cover,
      },
      null,
      2,
    ),
  );
}

main();
