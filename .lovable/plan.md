

## Problem: Photo Acceptance ("Quero") Fails at Multiple Layers

When the agent offers photos ("Quer que eu te mande fotos do Corolla?") and the client responds "Quero" / "Sim" / "Pode" / "Manda", photos are never delivered. This is a **three-layer failure**:

**Layer 1 — Dispatcher**: May classify "Quero" as `NO_TOOLS_NEEDED` since it lacks explicit photo/vehicle keywords. Even though it receives conversation history, short confirmations are ambiguous without explicit contextual rules.

**Layer 2 — Inventory Handler**: Even if the dispatcher correctly calls `consultar_estoque`, the `isPhotoRequest` check (line 698) only tests `latestUserText` for explicit photo keywords ("fotos", "imagens", etc.). "Quero" matches none, so the photo arrays are **stripped from the tool response** before the conversational LLM sees them.

**Layer 3 — Post-Processing**: `userExplicitlyAskedPhotos` (line 2742) and the Photo Recovery Fallback (line 2757) both use the same explicit keyword regex on `latestUserText`. "Quero" fails all of them.

---

## Plan

### 1. New helper function: `isContextualPhotoAcceptance`

Add a function in `chat-agent/index.ts` that detects when a short user message is accepting a photo offer from the previous assistant message:

```
function isContextualPhotoAcceptance(userText: string, history: any[]): boolean
```

- **User text check**: Short confirmation pattern — `quero`, `sim`, `pode`, `manda`, `claro`, `por favor`, `ok`, `bora`, `quero sim`, `pode sim`, `manda sim`, `quero ver`, `aceito`, `com certeza`, `gostaria`
- **History check**: Last assistant message contains a photo-offer pattern like "quer que eu te mande fotos", "posso enviar fotos", "gostaria de ver fotos", "quer ver fotos"
- Returns `true` only when BOTH conditions match

### 2. Update `isPhotoRequest` in inventory handler (~line 698)

Expand the check to also be true when `isContextualPhotoAcceptance` returns true. This ensures when the dispatcher correctly calls `consultar_estoque`, the photo data is NOT stripped from the response.

### 3. Update `userExplicitlyAskedPhotos` in post-processing (~line 2742)

Same expansion — include `isContextualPhotoAcceptance` so the post-processing photo injection works for contextual acceptances.

### 4. Update `explicitPhotoRequest` in recovery fallback (~line 2757)

Same expansion for the fallback path, ensuring photos can be recovered even if the dispatcher skipped the tool call.

### 5. Update dispatcher prompt (ppl-motors.ts)

Add explicit contextual acceptance examples to the dispatcher's Rule 13 (photo priority):

```
RULE 13 — CONTEXTUAL ACCEPTANCE:
When the previous assistant message offered photos and the user responds with
"Quero", "Sim", "Pode", "Manda", "Claro", "Por favor" → call consultar_estoque
with the marca/modelo from conversation history. These are photo acceptance responses.
```

Add corresponding examples to the NO_TOOLS_NEEDED exclusion list to prevent the dispatcher from skipping these.

### 6. Force dispatch override for contextual photo acceptance (~line 2224)

In the `shouldSkip` logic, add a new override similar to `mentionsScheduling`:

```
const contextualPhotoAccept = isContextualPhotoAcceptance(latestUserText, sanitizedMessages);
const shouldSkip = (...) && !mentionsScheduling && !contextualPhotoAccept;
```

This ensures even if "Quero" somehow matches a skip pattern, the system forces dispatch when it detects photo acceptance context.

---

### Files to modify
- `supabase/functions/chat-agent/index.ts` — New helper function + 4 integration points (skip logic, inventory handler, post-processing, recovery fallback)
- `supabase/functions/_shared/prompts/ppl-motors.ts` — Dispatcher prompt Rule 13 update with contextual acceptance examples

