import { buildSystemPrompt } from "./src/services/prompts/registry.js";

try {
  console.log("Testing buildSystemPrompt for contabilidade-ideal...");
  const prompt = buildSystemPrompt("Base prompt", "contabilidade-ideal", true);
  console.log("Prompt length:", prompt.length);
  process.exit(0);
} catch (e) {
  console.error("CRASH DETECTED:", e);
  process.exit(1);
}
