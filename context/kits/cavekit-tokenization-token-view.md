---
created: "2026-08-11"
last_edited: "2026-08-11"
---

# Cavekit: Tokenization Token View

## Scope

The instrument itself. Inside a tokenization session, render the reply as the
tokens the model actually emitted; let the artist click a token to see the
alternatives it was chosen from; let them replace a token and regenerate from
that point; let them accumulate those choices into a pending edit list; and
let them dial a baked character adapter's strength live.

Decided in `selfai/gitlab-profile`
`context/treasuremaps/2026-08-11-tokenization-studio.md`, Decisions 2, 4 and 7.

Lands on `cavekit-tokenization-studio-shell.md`, which must ship first.
Consumes endpoints specified by `self.ai`'s
`cavekit-tokenization-logprobs-rescore.md` and
`cavekit-tokenization-edit-store.md`.

**Explicitly out of scope:** the bake. This kit produces and displays an edit
list and submits it; what happens to it afterwards is `self.ai`'s bake kit and
`self.llamolotl`'s trainer kit.

## Grounded in current self.chat structure

- **The stream consumer.** `src/lib/apis/streaming/index.ts`.
  `openAIStreamToIterator` (`:55-111`) extracts exactly two things from a
  chunk: `choices[0].delta.reasoning_content` (`:97`) and
  `choices[0].delta.content` (`:105`), and yields
  `{done, value, …}`. Everything else on the chunk — including `logprobs` —
  is discarded at this boundary. The `TextStreamUpdate` type (`:4-19`) is where
  a new field must be declared.
- **The re-chunker.** `streamLargeDeltasAsRandomChunks` (`:115-163`) splits any
  `value` longer than 5 characters into random 1-3 character pieces.
  `cavekit-tokenization-studio-shell.md` R3 forces it off for this surface;
  this kit assumes it is off and must not silently re-enable it.
- **Where the stream is consumed:**
  `src/lib/components/chat/Chat.svelte:1771` calls `createOpenAITextStream`.
  The tokenization session's fork of this call site is where the token-bearing
  consumer is wired.
- **Alignment hazard, from the treasuremap.** Streamed deltas originate from
  llama.cpp's chat-parser diffs, not from raw tokens; reasoning-splitting and
  tool-call parsing mean delta boundaries are not token boundaries, and
  logprobs attach to the *last* delta of a decode step. Token identity must
  come from the `logprobs.content[]` array, never from the accumulated string.
- **Character strength.** `self.llamolotl`'s
  `POST /api/system/apply-loras` adjusts adapter scale on the running
  llama-server with no restart when the adapter is already loaded, and
  `GET /api/system/active-loras` reads live state back. This kit reaches them
  through core, not directly.

## Requirements

### R1: Token-Bearing Stream Consumer

**Description:** A stream consumer for the tokenization session that preserves
per-token distributions instead of discarding them.

Per the treasuremap (Decision 2), this is a **separate function**, not a flag
on `createOpenAITextStream`. The normal view renders from an accumulated
string; this one renders from a token array. Different data path, not a
different rendering option.

**Acceptance Criteria:**
- [ ] A consumer distinct from `createOpenAITextStream` parses the SSE stream
      and yields, per chunk, both the text delta and any attached
      `choices[0].logprobs.content[]` entries
- [ ] `createOpenAITextStream` and `TextStreamUpdate` are unchanged, or changed
      only additively such that the normal chat path's behaviour is identical
- [ ] Each retained token entry carries at minimum the token's id, its text,
      its own logprob, and its alternatives when present
- [ ] The consumer never derives token boundaries from the accumulated content
      string
- [ ] A chunk carrying a text delta with no logprobs is handled without error
      and without inventing a token entry
- [ ] A chunk carrying logprobs with an empty text delta is not dropped
- [ ] `[DONE]`, error payloads, `sources`, `selected_model_id` and `usage`
      chunks are handled equivalently to the existing consumer
- [ ] Tests cover a stream where the number of text deltas differs from the
      number of token entries

### R2: Token Rendering

**Description:** The reply is displayed as discrete, individually selectable
tokens.

**Acceptance Criteria:**
- [ ] Each emitted token renders as a distinct, selectable element in emission
      order
- [ ] Concatenating the rendered tokens reproduces the reply text exactly,
      including whitespace and leading-space tokens
- [ ] Tokens are rendered from the token array, not by re-splitting the
      message text
- [ ] Tokens whose text is not printable — whitespace-only, control, or partial
      multi-byte sequences — are rendered visibly rather than collapsing to
      nothing
- [ ] A token's own probability is conveyed visually, so low-confidence regions
      are findable without clicking through the reply
- [ ] The view renders during streaming, not only after completion
- [ ] A reply of at least 1000 tokens remains responsive to scrolling and
      selection

### R3: Alternatives on Selection

**Description:** Selecting a token shows the candidates the model was choosing
among at that position, with their probabilities.

The treasuremap (Alternatives rejected) settles the fetch strategy: re-scoring
on demand is the default read path, because the distribution at a position is
deterministic given the prefix and llama.cpp's prompt cache makes the re-decode
cheap. Streaming the full set is retained for the heatmap case.

**Acceptance Criteria:**
- [ ] Selecting a token displays the top-N alternatives at that position with
      probabilities, N being the session's configured `top_logprobs`
- [ ] The token the model actually emitted is identified within that list
- [ ] Whether the displayed values are pre- or post-sampling is shown, not left
      ambiguous
- [ ] When alternatives were not streamed, they are fetched on demand and the
      view shows a pending state rather than an empty list
- [ ] A fetch failure is reported with a reason and is retryable, and does not
      leave the message unreadable
- [ ] A fetch that requires a model load reports that it is waiting rather than
      appearing hung — llamolotl serves one active model, so an old session may
      trigger one
- [ ] Selecting a different token cancels or discards a still-pending fetch for
      the previous one

### R4: Branch From a Token

**Description:** The artist chooses an alternative and the reply is regenerated
from that point with their token substituted.

**Acceptance Criteria:**
- [ ] Choosing an alternative regenerates the reply from that position with the
      chosen token in place
- [ ] Text before the branch point is preserved exactly and is not re-generated
- [ ] The regenerated continuation is itself token-rendered and inspectable, so
      branching can be repeated
- [ ] The pre-branch version remains reachable — branching is exploration, not
      destruction
- [ ] A branch that fails leaves the original reply intact and states why
- [ ] Branching is available from any token in the reply, not only the last

### R5: Pending Edit List

**Description:** Token choices accumulate into a visible, editable list scoped
to a character, which is what the bake consumes.

The treasuremap (Decision 4) makes the edit list the source of truth: an
adapter is a pure function of base model, edit list and hyperparameters, and
every bake re-fits from scratch. That is what makes wrecking a character
undoable. The UI must therefore treat the list as a first-class object, not as
transient session state.

**Acceptance Criteria:**
- [ ] Each accepted branch records an edit — the prefix it applies to, the
      position, the token the model chose, and the token the artist chose
- [ ] The pending edit list is visible within the session, showing enough
      context per entry to identify what it changes
- [ ] An individual edit can be removed before bake
- [ ] Edits persist across a page reload and across leaving and re-entering the
      session
- [ ] Edits are scoped to a character and a base model; the association is
      shown, and moving them between base models is not offered
- [ ] Submitting a bake is only offered to a user holding the bake permission;
      an artist without it can still create and keep edits
- [ ] The view distinguishes edits already baked into the active adapter from
      those still pending

### R6: Live Preview

**Description:** While crafting, the artist gets immediate feedback on pending
edits without waiting for a bake.

Per the treasuremap (Decision 7) this is a `logit_bias` approximation applied
by core. It is context-blind and it is not what the bake will produce.

**Acceptance Criteria:**
- [ ] Pending edits can be applied as a preview affecting subsequent
      generations in the session
- [ ] The preview is labelled as an approximation distinct from a baked
      adapter, in the interface and not only in documentation
- [ ] Preview can be toggled off, and generations with it off are unaffected
- [ ] Preview state does not leak outside the session — no other session, chat,
      or user sees it
- [ ] Enabling preview requires no bake permission and consumes no GPU window

### R7: Character Strength

**Description:** A control that adjusts a baked character adapter's scale on
the running model.

**Acceptance Criteria:**
- [ ] A control sets the active character adapter's scale over a range that
      includes 0 and values above 1
- [ ] Setting the scale takes effect on subsequent generations without a
      session restart
- [ ] The control's displayed value reflects live server state, not only local
      UI state — after a page reload it shows what is actually applied
- [ ] Setting the scale to 0 produces base-model behaviour
- [ ] The control is absent, or disabled with a reason, when no character
      adapter is loaded for the current model
- [ ] A scale change that the server rejects or that requires a restart is
      surfaced to the artist rather than silently diverging from the displayed
      value
- [ ] Behaviour of a conversation whose earlier turns were generated at a
      different scale is defined — the treasuremap flags an unverified KV-cache
      staleness question here, and this kit's implementation must state which
      answer it assumes

## Out of Scope

- The bake and its scheduling — `self.ai` and `self.llamolotl` kits.
- Adapter versioning in self.corpus — `self.ai`'s corpus kit.
- Preference-style training. The treasuremap names DPO/ORPO as future work
  with a different loss than Decision 4's.
- Comparing two characters side by side.
- Any change to the normal chat message renderer.

## Cross-References

- `selfai/gitlab-profile` `context/treasuremaps/2026-08-11-tokenization-studio.md`
  — Decisions 2, 4, 7, and the Phase 1 findings this kit's assumptions rest on.
- `cavekit-tokenization-studio-shell.md` — prerequisite.
- `self.ai` `context/kits/cavekit-tokenization-logprobs-rescore.md` — re-score
  and branch endpoints (R3, R4).
- `self.ai` `context/kits/cavekit-tokenization-edit-store.md` — edit storage
  and `logit_bias` preview (R5, R6).
- `self.ai` `context/kits/cavekit-tokenization-bake-job.md` — bake submission
  and the bake permission (R5).

## Changelog

- 2026-08-11: Initial draft from the Tokenization Studio treasuremap.
