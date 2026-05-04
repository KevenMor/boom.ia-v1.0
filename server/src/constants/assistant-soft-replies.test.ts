import { describe, it, expect } from "vitest";
import { pickSoftReply, isPlatformSoftFallback, SOFT_REPLY_VARIANTS } from "./assistant-soft-replies.js";

describe("assistant-soft-replies", () => {
  it("pickSoftReply is deterministic for same seed", () => {
    const a = pickSoftReply("conv-uuid-123");
    const b = pickSoftReply("conv-uuid-123");
    expect(a).toBe(b);
    expect((SOFT_REPLY_VARIANTS as readonly string[]).includes(a)).toBe(true);
  });

  it("pickSoftReply without seed returns first variant", () => {
    expect(pickSoftReply(null)).toBe(SOFT_REPLY_VARIANTS[0]);
    expect(pickSoftReply("")).toBe(SOFT_REPLY_VARIANTS[0]);
  });

  it("isPlatformSoftFallback detects legacy substring", () => {
    expect(
      isPlatformSoftFallback("Opa, tive um problema na última mensagem enviada, pode me reenviar?")
    ).toBe(true);
    expect(isPlatformSoftFallback("tive um problema na última")).toBe(true);
  });

  it("isPlatformSoftFallback detects exact canonical variants", () => {
    for (const v of SOFT_REPLY_VARIANTS) {
      expect(isPlatformSoftFallback(v)).toBe(true);
    }
  });

  it("isPlatformSoftFallback false for normal reply", () => {
    expect(isPlatformSoftFallback("Olá! Como posso ajudar?")).toBe(false);
    expect(isPlatformSoftFallback("")).toBe(false);
  });
});

import { isShortAcknowledgment } from "../services/ack-recovery.js";

describe("ack-recovery isShortAcknowledgment", () => {
  it("detects common acks", () => {
    expect(isShortAcknowledgment("ok")).toBe(true);
    expect(isShortAcknowledgment("Ta")).toBe(true);
    expect(isShortAcknowledgment("sim")).toBe(true);
    expect(isShortAcknowledgment("beleza")).toBe(true);
  });
  it("rejects long text", () => {
    expect(isShortAcknowledgment("a".repeat(50))).toBe(false);
  });
});
