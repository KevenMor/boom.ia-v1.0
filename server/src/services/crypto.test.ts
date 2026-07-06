import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto.js";

describe("crypto", () => {
  it("encrypt/decrypt roundtrip", async () => {
    const secret = "test-encryption-key-32-chars-ok!!";
    const plain = "sk-test-asaas-api-key";
    const encoded = await encrypt(plain, secret);
    expect(encoded).not.toBe(plain);
    await expect(decrypt(encoded, secret)).resolves.toBe(plain);
  });
});
