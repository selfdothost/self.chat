---
created: "2026-08-11"
last_edited: "2026-08-11"
---

# Cavekit: Tokenization Studio Shell

## Scope

Adds `/studio/tokenization`: a model gallery that routes into a tokenization
session rather than into chat, and the session page itself — a deliberate fork
of the chat page with the parameter controls pinned open on wide viewports,
the model selection restricted to llamolotl-backed models, and Studio > Prompts
wired into the composer as user-prompt presets.

Decided in `selfai/gitlab-profile`
`context/treasuremaps/2026-08-11-tokenization-studio.md`, Decisions 2, 8 and 9.

This kit delivers the **shell**: navigation, page structure, gating, and the
forced settings. The token rendering, the alternatives popover, branching, and
the character-strength slider are `cavekit-tokenization-token-view.md`. With
this kit alone, a tokenization session looks and behaves like a normal chat —
which is the correct intermediate state and should be shippable on its own.

Requires the Studio rename (`cavekit-studio-rename.md`) to have landed.

**Explicitly out of scope:** modifying the default chat path in any way. The
treasuremap is emphatic on this (Decision 2) — the reason tokenization gets its
own surface is so the normal chat path carries none of its cost.

## Grounded in current self.chat structure

- **The gallery to fork.** `src/lib/components/workspace/Models.svelte` (468
  lines), rendered by an 18-line route wrapper at
  `src/routes/(app)/workspace/models/+page.svelte`. Post-rename these are
  `studio/`-prefixed. The "open this model" affordance is
  `Models.svelte:246`: `href={resolve('/?models=' + encodeURIComponent(model.id))}`
  — a link to the chat root with the model preselected. The tokenization
  gallery differs from this one **only** in where that href points.
- **The controls rail already implements the required responsive split.**
  `src/lib/components/chat/ChatControls.svelte` (382 lines) tracks
  `largeScreen` (`:55`, set at `:108`/`:116`) and renders a `paneforge` `Pane`
  when large or a `Drawer` when not (`:225-227`). Visibility is driven by the
  `showControls` store (`$lib/stores`, read at `:8`). **The maintainer's
  "pinned open if wide, collapsible if thin" is therefore existing behavior**;
  the only new work is defaulting `showControls` to true on entry to a
  tokenization session, and not leaking that default back into normal chat.
- **A known hazard in that file.** `ChatControls.svelte:191-214` carries an
  extended comment about a `$effect` that mounts, flips `showControls` during
  the same flush, and never fires again. Anything this kit adds that writes
  `showControls` from an effect must not re-arm that loop — see the repo's
  Svelte 5 self-writing-`$effect` history.
- **The parameter form** is
  `src/lib/components/chat/Settings/Advanced/AdvancedParams.svelte`, reached
  through `src/lib/components/chat/Controls/Controls.svelte`.
- **Existing rail test:** `src/lib/components/chat/chat-controls-rail.test.ts`.
- **The stream consumer this kit must not disturb:**
  `src/lib/apis/streaming/index.ts`, whose `createOpenAITextStream` takes a
  `splitLargeDeltas` flag sourced from `$settings.splitLargeChunks` at
  `src/lib/components/chat/Chat.svelte:1771`.
- **Prompts** already exist as a Studio section with their own storage and
  access control (`src/lib/components/workspace/Prompts.svelte`, route
  `workspace/prompts/`).

## Requirements

### R1: Tokenization Gallery Entry

**Description:** `/studio/tokenization` presents the model gallery. Selecting a
model opens a tokenization session with it, rather than a chat.

**Acceptance Criteria:**
- [ ] `/studio/tokenization` renders a model gallery with the same card
      layout, search, and filtering as the Studio > Models gallery
- [ ] Selecting a model navigates to a tokenization session with that model
      preselected — the tokenization analogue of `Models.svelte:246`'s
      `/?models=<id>` link, not that link itself
- [ ] Models **not** backed by a llamolotl connection are either hidden or
      rendered visibly unavailable with a reason; they are never selectable
- [ ] The gallery does not expose Studio > Models' create/edit/delete
      affordances — this is a picker, not a management surface
- [ ] Reaching `/studio/tokenization` without the required permission (R4)
      behaves exactly as other permission-gated Studio sections do

### R2: Session Page Forked From Chat

**Description:** The tokenization session page is a fork of the chat page,
reusing its composer, message list, regenerate, history and model picker.

The treasuremap's rationale (Decision 2) is that forking gets most of the way
with little new code. The fork is deliberate and is not expected to be
refactored back into a shared component in this kit.

> **AMENDED 2026-08-12, after measuring what a fork costs.** AC4 originally read
> "no file under the normal chat route or `Chat.svelte` is modified; a diff
> touching them fails review". Held literally, that forces a **copy of
> `Chat.svelte`, which is 2207 lines with exactly one prop** (`chatIdProp`) —
> there is no configuration surface to pass a forced setting, a model filter or
> a session kind through. The duplicate would then need every future chat fix
> applied twice, and would drift silently when it wasn't.
>
> The changes a session actually needs are tiny: one line for the stream's
> re-chunking flag (`Chat.svelte:1809`), the request body gaining `logprobs`,
> and a filtered model picker. Its seven child components are already separate
> files that can be reused without modification.
>
> So AC4 now states what it was protecting rather than a proxy for it. The chat
> path must carry none of tokenization's cost — no behavioural change, and no
> tokenization concepts in chat components. Additive optional props that default
> to today's behaviour are permitted; a chat component that imports a
> tokenization module or branches on a session kind is not. "Fork" therefore
> means forking the *page*, not duplicating the orchestration.

**Acceptance Criteria:**
- [ ] A tokenization session supports sending a message and receiving a
      streamed reply, with the composer, message list and regenerate control
      behaving as they do in chat
- [ ] Session history is persisted and reachable, and is distinguishable from
      normal chat history — a tokenization session does not appear in the
      normal chat sidebar list, and vice versa
- [ ] The model picker within a session offers only llamolotl-backed models
- [ ] The normal chat path carries **no behavioural change**: entering, sending,
      streaming and persisting an ordinary chat behaves exactly as before, and a
      test asserts the chat defaults are untouched
- [ ] **No tokenization logic lives in the chat components.** They may gain
      additive, optional, defaulted configuration; they may not learn what
      tokenization *is*. A chat component that imports a tokenization module,
      or branches on a session kind, fails review

### R3: Forced Session Settings

**Description:** The session pins settings that the token view depends on,
regardless of the user's global preferences.

`splitLargeChunks` is the load-bearing one. `streamLargeDeltasAsRandomChunks`
(`streaming/index.ts:115-163`) re-chops content into random 1-3 character
pieces for a typewriter effect; in normal chat it is a preference, here it
would destroy every token boundary. Per the treasuremap it is forced, not read.

**Acceptance Criteria:**
- [ ] The tokenization session's stream consumption is unaffected by
      `$settings.splitLargeChunks` in either position
- [ ] The user's stored `$settings.splitLargeChunks` value is **not** mutated
      by entering or leaving a tokenization session — returning to normal chat
      restores their own preference exactly
- [ ] Requests originating from a tokenization session carry `logprobs: true`
      and a `top_logprobs` value
- [ ] The `top_logprobs` value is configurable within the session and its
      default is stated in one place rather than duplicated across call sites
- [ ] Sampling parameters in effect for the session are displayed to the
      artist, not merely settable — the distribution shown must be
      attributable to the sampler that produced the text
- [ ] A test asserts the session path does not call `createOpenAITextStream`
      with `splitLargeDeltas` true

### R4: Permission Gate

**Description:** Entry to the Tokenization Studio is gated by its own
permission, distinct from the other Studio sections.

Per the treasuremap's Decision 11, `studio.tokenization` admits an artist to the
studio **and to queueing tokenization jobs** — queueing is not separately gated.
The permissions that stay separate are *defining job windows* (an operator act)
and *creating/queueing existing training courses* (a different kind of work at a
different scale). The boundary is who may change the rules, not who may consume
capacity under them.

**Acceptance Criteria:**
- [ ] A `studio.tokenization` permission gates both the gallery route and the
      session route
- [ ] The Studio navigation does not render a Tokenization entry for a user
      without the permission
- [ ] Direct navigation to either route without the permission is refused, not
      merely hidden
- [ ] The permission defaults to off for non-admin users
- [ ] Holding `studio.tokenization` does **not** confer the training-course
      permission, and holding the training-course permission does not confer
      `studio.tokenization` — neither implies the other in either direction
- [ ] Holding `studio.tokenization` does not confer the ability to define job
      windows

### R5: Parameter Controls Pinned on Wide Viewports

**Description:** The controls rail is open by default when a tokenization
session loads on a wide viewport, and falls back to the existing drawer
presentation on narrow ones.

Per the grounding above, `ChatControls.svelte` already implements both
presentations and switches on `largeScreen`. This requirement is about the
**default open state on entry**, not about building a new panel.

**Acceptance Criteria:**
- [ ] Entering a tokenization session on a wide viewport shows the controls
      rail open without user action
- [ ] Entering on a narrow viewport does **not** auto-open the drawer over the
      conversation; the existing collapsed affordance is presented
- [ ] The artist can close the rail within a session, and closing it is not
      immediately undone by a re-render
- [ ] Entering a normal chat is unaffected — its rail default is unchanged
- [ ] The implementation does not introduce an `$effect` that writes the same
      `showControls` store it reads; the hazard documented at
      `ChatControls.svelte:191-214` is not re-armed
- [ ] Resizing across the `largeScreen` boundary mid-session does not lose the
      artist's open/closed choice

### R6: Studio > Prompts in the Composer

**Description:** Saved prompts are selectable as user-prompt presets in the
tokenization composer.

Rationale from the treasuremap (Decision 8): holding the prompt fixed while
varying the model is how an artist actually tells two characters apart.

**Acceptance Criteria:**
- [ ] The tokenization composer offers a picker listing prompts the user may
      access, honouring the existing Prompts access control unchanged
- [ ] Selecting a prompt inserts its content into the composer as editable
      text — it is a starting point, not a locked value
- [ ] Prompts with variables behave as they do in normal chat, or the kit
      states explicitly that variables are unsupported here and the picker
      excludes them
- [ ] No change is made to Prompts storage, its API, or its access control
- [ ] The picker is absent for a user with no accessible prompts rather than
      rendering empty

## Out of Scope

- Token rendering, alternatives, branching, character-strength slider —
  `cavekit-tokenization-token-view.md`.
- Any backend endpoint. This kit consumes what
  `self.ai`'s `cavekit-tokenization-logprobs-rescore.md` provides.
- The edit list, preview, and bake — `self.ai` kits.
- Changes to the default chat path.
- Refactoring the fork back into components shared with chat.

## Cross-References

- `selfai/gitlab-profile` `context/treasuremaps/2026-08-11-tokenization-studio.md`
  — Decisions 2, 8, 9.
- `cavekit-studio-rename.md` — prerequisite.
- `cavekit-tokenization-token-view.md` — the view that lands on this shell.
- `self.ai` `context/kits/cavekit-tokenization-logprobs-rescore.md` — the
  request-side contract this shell's sessions depend on.

## Changelog

- 2026-08-11: Initial draft from the Tokenization Studio treasuremap.
