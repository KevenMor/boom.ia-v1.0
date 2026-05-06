import { describe, expect, it } from "vitest";
import {
  ensureSupabaseStoragePublicObjectPath,
  getSuiteGalleryThumbnailCandidateUrls,
  normalizeSuiteGalleryMediaUrlForOrigin,
} from "./suite-gallery-display";
import type { SuiteGallery } from "@/types/database";

const galleryBase: SuiteGallery = {
  id: "g1",
  tenant_id: "t1",
  name: "Teste",
  description: null,
  llm_media_guidance: null,
  cover_image_url: null,
  media_urls: [],
  display_order: 0,
  created_at: "2020-01-01T00:00:00Z",
  updated_at: "2020-01-01T00:00:00Z",
};

describe("ensureSupabaseStoragePublicObjectPath", () => {
  it("insere public/ após object/ quando o bucket vem logo após object", () => {
    const wrong =
      "https://ia.agboom.com.br/api/supabase-proxy/storage/v1/object/suite-galleries/a0/b/photo.jpg";
    const fixed =
      "https://ia.agboom.com.br/api/supabase-proxy/storage/v1/object/public/suite-galleries/a0/b/photo.jpg";
    expect(ensureSupabaseStoragePublicObjectPath(wrong)).toBe(fixed);
  });

  it("não altera URL já com object/public/", () => {
    const ok =
      "https://ia.agboom.com.br/api/supabase-proxy/storage/v1/object/public/suite-galleries/x/y.jpg";
    expect(ensureSupabaseStoragePublicObjectPath(ok)).toBe(ok);
  });

  it("não altera URLs assinadas (object/sign/)", () => {
    const signed =
      "https://x.test/storage/v1/object/sign/suite-galleries/a/b.jpg?token=z";
    expect(ensureSupabaseStoragePublicObjectPath(signed)).toBe(signed);
  });

  it("não altera rotas internas (object/move)", () => {
    const internal = "https://x.test/storage/v1/object/move";
    expect(ensureSupabaseStoragePublicObjectPath(internal)).toBe(internal);
  });
});

describe("normalizeSuiteGalleryMediaUrlForOrigin", () => {
  it("redireciona Storage do host Supabase para o proxy no domínio atual", () => {
    expect(
      normalizeSuiteGalleryMediaUrlForOrigin(
        "https://abc.supabase.co/storage/v1/object/public/suite-galleries/t/g/f.jpg",
        "https://ia.agboom.com.br"
      )
    ).toBe(
      "https://ia.agboom.com.br/api/supabase-proxy/storage/v1/object/public/suite-galleries/t/g/f.jpg"
    );
  });

  it("substitui origem de dev (localhost + proxy) pela de produção", () => {
    expect(
      normalizeSuiteGalleryMediaUrlForOrigin(
        "http://localhost:8080/api/supabase-proxy/storage/v1/object/public/suite-galleries/x/y.jpg",
        "https://ia.agboom.com.br"
      )
    ).toBe(
      "https://ia.agboom.com.br/api/supabase-proxy/storage/v1/object/public/suite-galleries/x/y.jpg"
    );
  });

  it("não reescreve URL assinada (sign) — token atrelado ao host", () => {
    const signed =
      "https://abc.supabase.co/storage/v1/object/sign/suite-galleries/a/b.jpg?token=secret";
    expect(normalizeSuiteGalleryMediaUrlForOrigin(signed, "https://ia.agboom.com.br")).toBe(signed);
  });
});

describe("getSuiteGalleryThumbnailCandidateUrls", () => {
  it("prioriza capa e em seguida inclui fotos de media_urls", () => {
    const g: SuiteGallery = {
      ...galleryBase,
      cover_image_url: "https://cdn.example/capa.jpg",
      media_urls: [
        { url: "https://cdn.example/foto1.jpg", type: "photo" },
        { url: "https://cdn.example/vid.mp4", type: "video" },
      ],
    };
    const c = getSuiteGalleryThumbnailCandidateUrls(g);
    expect(c[0]).toMatch(/capa\.jpg/);
    expect(c.some((u) => u.includes("foto1"))).toBe(true);
  });

  it("aceita type Photo em maiúsculas (legado)", () => {
    const g: SuiteGallery = {
      ...galleryBase,
      cover_image_url: null,
      media_urls: [{ url: "https://cdn.example/legacy.jpg", type: "Photo" }] as SuiteGallery["media_urls"],
    };
    const c = getSuiteGalleryThumbnailCandidateUrls(g);
    expect(c[0]).toMatch(/legacy\.jpg/);
  });
});
