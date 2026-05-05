import { describe, expect, it } from "vitest";
import {
  ensureSupabaseStoragePublicObjectPath,
  normalizeSuiteGalleryMediaUrlForOrigin,
} from "./suite-gallery-display";

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
