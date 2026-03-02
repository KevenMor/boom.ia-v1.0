import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/webhook-test`;

// ---- Unit-style tests (logic validation) ----

Deno.test("applyJitter produces value within ±30% range", () => {
  // We can't import the function directly, so we replicate the logic for testing
  function applyJitter(ms: number): number {
    const jitter = 0.7 + Math.random() * 0.6;
    return Math.round(ms * jitter);
  }

  for (let i = 0; i < 50; i++) {
    const result = applyJitter(1000);
    assert(result >= 700 && result <= 1300, `Jitter out of range: ${result}`);
  }
});

Deno.test("getHumanizationConfig extracts correct values", () => {
  function getHumanizationConfig(cfg: Record<string, any>) {
    return {
      readDelayMs: Number(cfg.read_delay_ms) || 0,
      typingDelayMs: Number(cfg.typing_delay_ms) || 0,
      blockGapMs: Number(cfg.block_gap_ms) || 0,
    };
  }

  const cfg1 = { read_delay_ms: 3000, typing_delay_ms: 5000, block_gap_ms: 2000 };
  const h1 = getHumanizationConfig(cfg1);
  assertEquals(h1.readDelayMs, 3000);
  assertEquals(h1.typingDelayMs, 5000);
  assertEquals(h1.blockGapMs, 2000);

  // Missing values default to 0
  const cfg2 = {};
  const h2 = getHumanizationConfig(cfg2);
  assertEquals(h2.readDelayMs, 0);
  assertEquals(h2.typingDelayMs, 0);
  assertEquals(h2.blockGapMs, 0);

  // String values are coerced
  const cfg3 = { read_delay_ms: "2000", typing_delay_ms: "0", block_gap_ms: null };
  const h3 = getHumanizationConfig(cfg3);
  assertEquals(h3.readDelayMs, 2000);
  assertEquals(h3.typingDelayMs, 0);
  assertEquals(h3.blockGapMs, 0);
});

Deno.test("extractImagesFromMarkdown separates text and images", () => {
  function extractImagesFromMarkdown(text: string) {
    const imageRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
    const imageUrls: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = imageRegex.exec(text)) !== null) {
      if (match[1]) imageUrls.push(match[1].trim());
    }
    const textOnly = text.replace(imageRegex, "").replace(/\n{3,}/g, "\n\n").trim();
    return { textOnly, imageUrls };
  }

  const input = "Olha as fotos!\n\n![foto1](https://img.com/1.jpg)\n![foto2](https://img.com/2.jpg)\n\nGostou?";
  const { textOnly, imageUrls } = extractImagesFromMarkdown(input);
  assertEquals(imageUrls.length, 2);
  assertEquals(imageUrls[0], "https://img.com/1.jpg");
  assert(textOnly.includes("Olha as fotos!"));
  assert(textOnly.includes("Gostou?"));
  assert(!textOnly.includes("!["));
});

// ---- Integration tests (actual Edge Function calls) ----

Deno.test("webhook-test rejects missing agent_id", async () => {
  const resp = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ message: "hello" }),
  });
  const body = await resp.json();
  assertEquals(resp.status, 400);
  assertEquals(body.error, "Missing 'agent_id'");
});

Deno.test("webhook-test rejects invalid agent_id", async () => {
  const resp = await fetch(`${WEBHOOK_URL}?agent_id=00000000-0000-0000-0000-000000000000`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ message: "hello" }),
  });
  const body = await resp.json();
  assertEquals(resp.status, 401);
  assertEquals(body.error, "Invalid agent_id");
});

Deno.test("webhook-test ignores non-message_created Chatwoot events", async () => {
  const resp = await fetch(`${WEBHOOK_URL}?agent_id=test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ event: "conversation_created", conversation: {} }),
  });
  const body = await resp.json();
  assertEquals(resp.status, 200);
  assertEquals(body.status, "ignored");
});

Deno.test("webhook-test ignores outgoing Chatwoot messages", async () => {
  const resp = await fetch(`${WEBHOOK_URL}?agent_id=test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ event: "message_created", message_type: "outgoing", content: "bot reply" }),
  });
  const body = await resp.json();
  assertEquals(resp.status, 200);
  assertEquals(body.status, "ignored");
});

Deno.test("safeDelay respects time budget", async () => {
  const MAX_DELAY_BUDGET_MS = 22000;
  const startTime = Date.now();
  const hasTimeBudget = () => (Date.now() - startTime) < MAX_DELAY_BUDGET_MS;

  const safeDelay = async (ms: number) => {
    if (ms <= 0 || !hasTimeBudget()) return;
    const capped = Math.min(ms, MAX_DELAY_BUDGET_MS - (Date.now() - startTime));
    if (capped <= 0) return;
    await new Promise(resolve => setTimeout(resolve, capped));
  };

  // Should complete quickly (100ms delay)
  const before = Date.now();
  await safeDelay(100);
  const elapsed = Date.now() - before;
  assert(elapsed >= 80 && elapsed < 300, `Expected ~100ms delay, got ${elapsed}ms`);

  // 0 delay should be instant
  const before2 = Date.now();
  await safeDelay(0);
  const elapsed2 = Date.now() - before2;
  assert(elapsed2 < 20, `Expected instant, got ${elapsed2}ms`);
});
