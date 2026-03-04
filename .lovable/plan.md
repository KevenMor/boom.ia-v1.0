

## Problem Analysis

**What happened**: The client asked "Muito bonitas, vocês aceitam meu carro no negócio?" — a generic question asking IF the dealership accepts trade-ins. The client never mentioned what car they own (no brand, model, or year). However, the Dispatcher hallucinated "Chevrolet Cruze Premier 2020" and called `consultar_fipe` with those parameters, causing the agent to present a FIPE valuation for a car the client never mentioned. This destroys credibility.

**Root cause**: The Dispatcher prompt (in `ppl-motors.ts`) tells it to "extract marca, modelo, ano from conversation (can be in history)" for `consultar_fipe`. When the client says "meu carro no negócio", the keywords "carro" + "negócio" match APPRAISAL/TRADE-IN intent. But since no car details exist in the conversation, the LLM hallucinates them — likely influenced by the "Cruze 2020" examples in the prompt itself.

**Missing safeguard**: There is no rule telling the Dispatcher to return `NO_TOOLS_NEEDED` when the client mentions trade-in interest but hasn't provided their vehicle details. The system prompt should explicitly state: if marca+modelo+ano are not available, do NOT call `consultar_fipe`.

---

## Plan

### 1. Add anti-hallucination rule to Dispatcher prompt (`ppl-motors.ts`)

In the `DISPATCHER_PROMPT`, add a critical rule in the "CRITICAL RULES" section:

```
RULE 12 (ANTI-HALLUCINATION — HIGHEST PRIORITY):
- NEVER call consultar_fipe unless the customer has EXPLICITLY stated the marca, modelo AND ano of THEIR vehicle in the conversation history.
- If the customer asks generically about trade-ins ("aceitam meu carro?", "vocês pegam carro na troca?", "posso dar meu carro?") WITHOUT specifying what car they have → return NO_TOOLS_NEEDED.
- The conversational model will handle asking the customer for their vehicle details.
- NEVER guess, infer, or invent vehicle parameters. If the info is not explicitly in the conversation, DO NOT call the tool.
- The examples in this prompt (Cruze 2020, Civic 2019, HB20 2021) are JUST examples. NEVER use them as default values.
```

### 2. Add a "generic trade-in" example to NO_TOOLS_NEEDED section

Add explicit examples to the `NO_TOOLS_NEEDED` list:

```
- "vocês aceitam meu carro?" (generic trade-in question, no car details given)
- "aceitam carro na troca?" (generic)
- "posso dar meu carro como entrada?" (no marca/modelo/ano specified)
```

### 3. Update the System Prompt trade-in section (`ppl-motors.ts`)

In section "8) Troca com pré-avaliação", add instruction for when the client asks generically about trade-ins without giving car details — the agent should confirm they accept trade-ins and then ask for the vehicle info (marca, modelo, ano, km, fotos).

This ensures the conversational model (Phase 2) knows how to handle the case where no tool was called because the client didn't provide details.

---

### Files to modify
- `supabase/functions/_shared/prompts/ppl-motors.ts` — Dispatcher prompt + System prompt

