import { describe, expect, it } from "vitest";
import { ensureSupabaseStoragePublicObjectPath } from "./suite-gallery-display";

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
