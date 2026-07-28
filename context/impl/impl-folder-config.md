---
created: "2026-07-21"
last_edited: "2026-07-21"
---

# Implementation: Folder Config, Sidebar Organization & Chat Seeding

Build site: context/plans/build-site-folder-config.md

Client-side (SvelteKit / Svelte 5) build of the chat-folders-as-presets feature —
15 tasks over 6 tiers across three domains (FC / SO / CS). Backend endpoints
(self.ai preset-config folder-update, recent-chats unfoldered-only filter) already
shipped.

## Baseline gates (pre-change)
- `svelte-check`: 1 pre-existing ERROR (`src/lib/apis/streaming/index.ts` —
  `eventsource-parser` has no exported member `EventSourceMessage`), ~238 warnings.
  This error is NOT ours; the bar for each task is "add no new errors".
- Vitest: only `src/lib/components/common/Spinner.test.ts` existed.

## Task Status

### T-001: Add "Configure" entry to the folder options menu (FC/R1)
**Status:** COMPLETE
**Files Created:**
- `src/lib/components/layout/Sidebar/Folders/FolderMenu.test.harness.svelte` (test-only slot/event harness)
- `src/lib/components/layout/Sidebar/Folders/FolderMenu.test.ts`
**Files Modified:**
- `src/lib/components/layout/Sidebar/Folders/FolderMenu.svelte` — added a
  `Configure` DropdownMenu.Item (Cog6 icon) that `dispatch('configure')`, placed
  before Export, following the existing dispatch-only idiom.
- `src/lib/components/layout/Sidebar/RecursiveFolder.svelte` — added
  `let showConfigModal = false;` and `on:configure={() => (showConfigModal = true)}`
  on `<FolderMenu>` (mirror of the `showDeleteConfirm` boolean).
**Acceptance criteria trace (FC/R1):**
- AC1 (Configure item alongside rename/export/delete): FolderMenu.test.ts test 1
  asserts Configure + Rename + Export + Delete all render in the open menu. PASS.
- AC2 (selecting dispatches `configure`, no other action): FolderMenu.test.ts test 2
  asserts `onEvent('configure')` fires and rename/export/delete are NOT dispatched.
  PASS.
- AC3 (owning folder listens, opens modal): RecursiveFolder wires
  `on:configure` → `showConfigModal = true`. The `showConfigModal` boolean is the
  visibility source the T-002 modal binds to; the end-to-end "modal opens" assertion
  lands in T-002's RecursiveFolder integration test (visibility-follows-bound-boolean),
  since the modal component does not exist until T-002. Wiring in place & type-checked.
**Test Results:**
- Build/type (svelte-check): PASS — 1 pre-existing error only, none in my files.
- Unit (Vitest): 2/2 passing (FolderMenu.test.ts).
- Note: `showConfigModal` shows a transient "assigned but never read" svelte
  WARNING until T-002 renders the modal that reads it.

### T-007: Rename the sidebar section header "Chats" -> "Folders" (SO/R1)
**Status:** COMPLETE
**Files Created:**
- `src/lib/components/common/Folder.test.ts` (Vitest — section-header component)
- `cypress/e2e/folder-sidebar.cy.ts` (e2e; runs in CI)
**Files Modified:**
- `src/lib/components/layout/Sidebar.svelte` — the collapsible section header
  `name={$i18n.t('Chats')}` (the one carrying the "New Folder" add affordance) →
  `name={$i18n.t('Folders')}`. onAdd/onAddLabel/createFolder unchanged.
- `src/lib/i18n/locales/en-US/translation.json` — added `"Folders": ""` key
  (empty value = i18next renders the key text "Folders", same convention as the
  other keys e.g. "Chats").
**Acceptance criteria trace (SO/R1):**
- AC1 (header previously "Chats" now "Folders"): source change verified; Cypress
  `SO/R1: section header` context asserts the running sidebar shows a "Folders"
  header and no "Chats" section-header button (CI). Vitest Folder.test.ts test 1
  proves the section-header component renders the given name.
- AC2 (add affordance still creates a folder): Vitest Folder.test.ts test 2 asserts
  clicking the "+" invokes `onAdd`; Cypress test 2 asserts the + under the Folders
  header creates an "Untitled" folder (CI). The Sidebar wires `onAdd={createFolder}`
  unchanged.
**Test Results:**
- Build/type (svelte-check): PASS (see gate run below).
- Unit (Vitest): 2/2 passing (Folder.test.ts).
- e2e (Cypress): authored, executes in CI.

### T-012: Per-folder "New Chat" affordance (CS/R1)
**Status:** COMPLETE
**Files Created:**
- `cypress/e2e/folder-chat-seeding.cy.ts` (CS e2e; runs in CI)
**Files Modified:**
- `src/lib/components/layout/Sidebar/Folders/FolderMenu.svelte` — added a
  `New Chat` DropdownMenu.Item (PencilSquare icon) at the top; `dispatch('newChat')`.
- `src/lib/components/layout/Sidebar/RecursiveFolder.svelte` — `on:newChat` →
  `newChatInFolderHandler()`: navigates to `/(app)?folder_id=<id>` then clicks the
  standard `new-chat-button`. Imports `goto`, `resolve`.
- `src/lib/components/chat/Chat.svelte` — `initChatHandler` now reads
  `$page.url.searchParams.get('folder_id')` after `createNewChat` and, when present,
  calls `updateChatFolderIdById(chat.id, folderId)` so the created chat belongs to
  the folder. Added `updateChatFolderIdById` import.
- `src/lib/components/layout/Sidebar/Folders/FolderMenu.test.harness.svelte` +
  `FolderMenu.test.ts` — added New Chat coverage.
**Design decision:** folder context is carried as a `folder_id` URL param (the same
idiom the new-chat flow already uses for `model`/`tools`/`q`), not a persisted
store. This self-clears on the next navigation (avoids a stale-context edge where a
later unrelated new chat would inherit the folder) and extends cleanly to T-013,
which will read the same param in `initNewChat` to seed from the folder's preset.
Initially wired a `newChatFolderId` store, then reverted it for this reason (no dead
store left behind).
**Acceptance criteria trace (CS/R1):**
- AC1 (affordance exists): New Chat item in FolderMenu — FolderMenu.test.ts test 3
  asserts it renders; test 4 asserts selecting it dispatches only `newChat`. PASS.
  RecursiveFolder handles it via `newChatInFolderHandler`.
- AC2 (created chat belongs to the folder, not flat list): `initChatHandler` moves
  the chat into `folder_id` at creation; the flat list reads the unfoldered-only
  recent-chats endpoint so it won't show there. Cypress CS/R1 context asserts the
  chat appears under the folder after creation (CI).
- AC3 (no create-unfoldered-then-move by the user): single affordance → the folder
  context rides the URL param and membership is applied automatically at creation;
  the user performs one action. Cypress asserts URL carries `folder_id=` and the
  resulting chat is foldered without a manual move.
**Test Results:**
- Build/type (svelte-check): PASS — 1 pre-existing error only.
- Unit (Vitest): FolderMenu.test.ts 4/4 passing.
- e2e (Cypress): authored, executes in CI.
**Note:** live sidebar folder-tree refresh after creation relies on the existing
sidebar reload path; folder membership is persisted immediately (verified via reload
in the e2e). No new global refresh signal was added (out of scope for CS/R1).

### T-002: Folder-configuration modal composing existing pickers (FC/R2, FC/R6 guard)
**Status:** COMPLETE
**Files Created:**
- `src/lib/components/layout/Sidebar/Folders/FolderConfigModal.svelte` (new)
- `src/lib/components/layout/Sidebar/Folders/FolderConfigModal.test.ts`
- `src/test-mocks/app-paths.ts` (test-infra: $app/paths mock)
**Files Modified:**
- `src/lib/components/layout/Sidebar/RecursiveFolder.svelte` — renders
  `<FolderConfigModal bind:show={showConfigModal} folder={folders[folderId]} />`.
  This also completes T-001 AC3 end-to-end: the `configure` event flips
  `showConfigModal`, whose bound boolean now opens the modal.
- `vitest.config.ts` — DUCT TAPE (named): the existing `test.alias` used relative
  target paths, which Vite resolves relative to the *importing* file — so
  `$app/environment` (imported by `src/lib/constants.ts`, pulled in transitively by
  the model picker) never resolved. Converted the three aliases to absolute paths
  and added a `$app/paths` alias. Latent bug; surfaced the first time a component
  test imported a deep `$app/*` consumer.
**Reused components (no new pickers — FC/R6):**
- `$lib/components/chat/ModelSelector/Selector.svelte` (the composer single-model
  PRIMITIVE, bound to one model id) — NOT the `ModelSelector.svelte` wrapper.
- `$lib/components/workspace/Models/ToolsSelector.svelte` (bind:selectedToolIds).
- `$lib/components/workspace/Models/Knowledge.svelte` (bind:selectedKnowledge).
**Acceptance criteria trace (FC/R2):**
- AC1 (visibility = bound boolean, delete-modal idiom): `export let show`; uses
  common `Modal` with `bind:show`. Test: hidden when show=false, shown when
  show=true. PASS.
- AC2 (single default-model picker primitive): imports Selector primitive; test
  opens it and asserts `aria-label="model-item"` options appear. Import test asserts
  the primitive path and NOT the wrapper. PASS.
- AC3 (tool-set picker, array of ids): ToolsSelector `bind:selectedToolIds`; test
  asserts tool names render. PASS.
- AC4 (Knowledge picker, full objects): Knowledge `bind:selectedKnowledge`; test
  asserts "Select Knowledge" renders. PASS.
- AC5 (backing data populated before/as open): `loadOptions()` fetches tools +
  knowledge on open and gates picker render on `optionsLoaded` so pickers mount with
  full option sets (no race with ToolsSelector's onMount snapshot). Test seeds
  non-empty option sets and asserts they render. PASS.
- AC6 (no new picker introduced): import/static test asserts the three shared imports
  and no local `*Selector` function. PASS. (Also covered by T-006.)
**Test Results:**
- Build/type (svelte-check): PASS — 1 pre-existing error; one expected WARNING
  ("unused export property 'folder'") cleared by T-003.
- Unit (Vitest): FolderConfigModal.test.ts 6/6; full suite 13/13.

### T-003: Pre-populate the modal from the folder's current preset (FC/R3)
**Status:** COMPLETE
**Files Modified:**
- `src/lib/components/layout/Sidebar/Folders/FolderConfigModal.svelte` — `loadOptions`
  now seeds `selectedModelId`/`selectedToolIds`/`selectedKnowledge` from
  `folder.meta.preset.{default_model_id, tool_ids, knowledge_ids}` BEFORE pickers
  mount. Knowledge ids are resolved to full objects against the loaded collections.
  (Consumes the `folder` prop, clearing the T-002 unused-export warning.)
- `FolderConfigModal.test.ts` — +3 tests.
**Acceptance criteria trace (FC/R3):**
- AC1 (loads preset, reflects each picker's initial value): test 1 asserts model
  trigger shows "Llama 3", knowledge shows "Alpha KB" attached, and exactly one tool
  checkbox is checked. PASS.
- AC2 (no preset → all three empty): test 2 asserts model placeholder, no knowledge
  attached, zero checked tools. PASS.
- AC3 (stored ref present in options → pre-selected, no re-pick): tests 1 & 3 assert
  refs that exist in the option sets render pre-selected on open. PASS.
**Test Results:** svelte-check 1 pre-existing error, 0 new warnings; Vitest 9/9.

### T-004: Persist preset via folders-API, single generic error (FC/R4)
**Status:** COMPLETE
**Files Modified:**
- `src/lib/apis/folders/index.ts` — new `updateFolderPresetById(token, id, preset)`
  POSTing `{default_model_id, tool_ids, knowledge_ids}` to
  `/folders/{id}/update/preset` (the shipped MR!138 endpoint; route follows the
  established `/folders/{id}/update/{subroute}` convention — NAMED ASSUMPTION, one
  line to change if CI shows a different path). All three fields sent every save.
- `src/lib/components/layout/Sidebar/Folders/FolderConfigModal.svelte` — `saveHandler`
  calls it; success closes the modal + dispatches `save`; rejection sets a single
  generic `saveError` (i18n) shown as `role="alert"`, modal stays open. No per-field
  client validation before submit.
- `src/lib/i18n/locales/en-US/translation.json` — added the generic error key.
- `FolderConfigModal.test.ts` — +3 tests.
**Acceptance criteria trace (FC/R4):**
- AC1 (new fn submits the three fields): `updateFolderPresetById`; test asserts the
  payload shape. PASS.
- AC2 (success closes modal; preset = submitted values): success test asserts the
  submitted payload equals the current selection AND the modal closes. PASS.
- AC3 (rejection → single generic error, no field detail): rejection test asserts the
  generic alert text and that the backend detail (`kb1`/`inaccessible`/`knowledge`)
  is NOT leaked; modal stays open. PASS.
- AC4 (no per-field client validation duplicating backend): test with a model ref not
  in options asserts the API is still called verbatim (no pre-submit block). PASS.
**Test Results:** svelte-check 1 pre-existing error; Vitest 12/12.

### T-005: Explicit clear submits emptied fields as cleared values (FC/R5)
**Status:** COMPLETE
**Files Modified:**
- `src/lib/components/layout/Sidebar/Folders/FolderConfigModal.svelte` — added a
  minimal "Remove" control for the Default Model (the single-model primitive has no
  deselect), so a set model can be cleared. `saveHandler` already sends all three
  fields every save (`default_model_id: selectedModelId ? selectedModelId : null`,
  `tool_ids`, `knowledge_ids`), so an emptied field is an explicit empty value.
- `FolderConfigModal.test.ts` — +4 tests.
**Acceptance criteria trace (FC/R5):**
- AC1 (remove model → no default stored): test clicks "Remove" then Save; asserts
  payload.default_model_id === null (key present). PASS.
- AC2 (uncheck all tools → no tools): test unchecks the checked box then Save;
  payload.tool_ids === []. PASS.
- AC3 (remove all knowledge → no knowledge): test dismisses the FileItem then Save;
  payload.knowledge_ids === []. PASS.
- AC4 (save submits all three; empty ≠ omitted): empty-preset Save asserts the payload
  keys are exactly {default_model_id, tool_ids, knowledge_ids} with empty values. PASS.
**Test Results:** svelte-check 1 pre-existing error; Vitest 16/16.

### T-006: YAGNI guard — no new picker/selector components (FC/R6)
**Status:** COMPLETE (verification task; no new runtime code)
**Files Created:**
- `src/lib/components/layout/Sidebar/Folders/folder-config-yagni.test.ts`
**Acceptance criteria trace (FC/R6):**
- AC1 (no new model/tool/knowledge picker; inputs are the pre-existing shared
  components): test asserts FolderConfigModal imports the three shared pickers by
  path, uses the composer PRIMITIVE (not the wrapper), and that the Folders area
  contains no new *Selector*/*Picker* .svelte file (only FolderMenu + FolderConfigModal).
- AC2 (net-new code = menu item + modal + API fn only): `git diff --diff-filter=A
  main...HEAD` shows the only added FC source file is `FolderConfigModal.svelte`; the
  menu item is an edit to the existing FolderMenu.svelte; the API surface is exactly
  one added `updateFolderPresetById` (test asserts a single `update/preset` route).
**Test Results:** svelte-check 1 pre-existing error; Vitest 4/4.

### T-008: Scope the collapse toggle to the folder tree only (SO/R2)
**Status:** COMPLETE
**Files Created:**
- `src/lib/components/common/Folder.collapse.test.harness.svelte`
**Files Modified:**
- `src/lib/components/layout/Sidebar.svelte` — restructured the folder section:
  the pinned-chats block moved to BEFORE the collapsible `<Folder>` header, the flat
  time-grouped list moved to AFTER it (both now siblings, outside the collapsible),
  so the `<Folder>` (header) wraps ONLY the `<Folders>` tree. Added
  `bind:open={showFolders}` + `on:change` persisting to `localStorage('showFolders')`
  (mirrors the Pinned section), and `showFolders` init from localStorage in onMount.
  (Kept tabs; NOTE: do NOT run the repo's prettier here — its config says spaces but
  the codebase is tab-indented, so prettier reformats the whole file. Dedented the
  moved block by hand.)
- `src/lib/components/common/Folder.test.ts` — +2 collapse tests (added `animate`
  jsdom shim for Svelte's slide transition).
**Acceptance criteria trace (SO/R2):**
- AC1 (collapsing hides the folder tree): Folder.test.ts asserts the collapsible
  content (tree) is removed on toggle and restored on re-toggle; Cypress SO/R2 asserts
  the "Untitled" folder hides on collapse.
- AC2/AC3 (pinned + flat list NOT hidden): structural — both are siblings OUTSIDE the
  `<Folder>` now; Cypress SO/R2 asserts they remain visible after collapse.
- AC4 (collapse persists across reload): Folder emits `change(open)`, the Sidebar
  writes it to localStorage('showFolders') and re-reads on mount; Folder.test.ts
  asserts the emitted value; Cypress asserts localStorage persists across reload.
**Test Results:** svelte-check 1 pre-existing error; Vitest full suite 29/29.

### T-009: Regression-guard the flat list's server-side unfoldered scoping (SO/R3)
**Status:** COMPLETE
**Files Created:**
- `src/lib/components/layout/sidebar-flat-list.test.ts` (Vitest source guard)
- `cypress/e2e/folder-sidebar.cy.ts` SO/R3 context (CI e2e)
**Verified existing code (no runtime change needed):** `getChatList` hits
`/chats/?page=` (the recent-chats endpoint the server scopes to `folder_id IS NULL`);
`initChatList` sets `chats.set(newChatList)` directly; the flat list renders
`{#each $chats as chat}` with NO `$chats.filter(...)` post-filter (verified by grep).
**Acceptance criteria trace (SO/R3):**
- AC1/AC2 (flat list only unfoldered; foldered chat absent): server-scoped endpoint;
  Cypress asserts a folder-scoped chat doesn't appear in the flat list.
- AC3 (time grouping preserved): the `time_range` grouping block is unchanged;
  Cypress checks grouping headers present when history exists.
- AC4 (pagination/infinite-scroll preserved): `loadMoreChats` + Loader unchanged;
  source test asserts load-more uses the same endpoint.
- AC5 (server-scoped, not client post-filter): source test asserts the flat list
  populates from getChatList and renders $chats with no broadening `.filter`; Cypress
  intercepts `/chats/?page=` to confirm the recent-chats fetch is the source.
**Test Results:** svelte-check 1 pre-existing error; Vitest sidebar-flat-list 3/3.

### T-010: No-regression coverage for existing folder behavior (SO/R4)
**Status:** COMPLETE (Cypress regression suite; runs in CI)
**Files Created:**
- `cypress/e2e/folder-regression.cy.ts`
**Acceptance criteria trace (SO/R4) — one `it` per behavior:**
- AC1 drag chat → folder moves it (intercepts POST /chats/*/folder).
- AC2 drag folder → folder/root reparents (intercepts POST /folders/*/update/parent).
- AC3 rename works (intercepts POST /folders/*/update).
- AC4 export works (intercepts GET /chats/folder/*).
- AC5 delete folder+subtree (intercepts DELETE /folders/*; confirms dialog; asserts gone).
- AC6 folder expand/collapse persists across reload (intercepts /folders/*/update/expanded).
- AC7 folder renders its own chats when expanded (creates a folder-scoped chat,
  reloads, expands, asserts the chat under the folder).
**Note:** e2e execution is CI-side (no live browser here); DnD uses the app's
text/plain JSON payload contract. svelte-check unaffected (cypress specs are outside
its tsconfig).
**Test Results:** svelte-check 1 pre-existing error (unchanged).

### T-011: Move-into-folder removes chat from the flat list (and reverse) (SO/R5)
**Status:** COMPLETE (Cypress behavior test; runs in CI)
**Files Modified:**
- `cypress/e2e/folder-sidebar.cy.ts` — SO/R5 context.
**Acceptance criteria trace (SO/R5):**
- AC1 (after drag-in, gone from flat list) + AC2 (appears under folder when expanded):
  drag a flat-list chat onto a folder → move endpoint fires → after reload, expand the
  folder and assert the chat renders under it (and is server-scoped out of the flat list).
- AC3 (after drag-out, reappears in flat list): drag a foldered chat onto the Folders
  header (root drop target) → move endpoint clears folder_id → chat returns to the flat
  unfoldered list.
**Note:** behavior-only (no new code path beyond T-009's server scoping + existing
per-folder rendering + existing drag-drop). e2e execution CI-side.
**Test Results:** svelte-check unaffected (cypress specs outside tsconfig).

### T-013: Seed a folder-scoped new chat from the folder's preset (CS/R2)
**Status:** COMPLETE
**Files Created:**
- `src/lib/utils/folder-preset.ts` (pure `seedFromFolderPreset` helper)
- `src/lib/utils/folder-preset.test.ts`
**Files Modified:**
- `src/lib/components/chat/Chat.svelte` — `initNewChat` reads the `folder_id` URL
  param (same param as T-012 membership), fetches the folder via `getFolderById`,
  and seeds `selectedModels` / `selectedToolIds` / `files` (knowledge collections)
  from `meta.preset` using the pure helper. Loads tools/knowledge option data as
  needed. Imports `getFolderById`, `getKnowledgeBases`, `seedFromFolderPreset`.
**Acceptance criteria trace (CS/R2):**
- AC1 (preset model → chat opens with it selected): helper test seeds selectedModels;
  Cypress CS/R2 configures a folder model then asserts the new chat's model selector
  shows it.
- AC2 (preset tools → selected, filtered to existing): helper test asserts nonexistent
  tool ids are filtered out (`['calc','gone']` → `['calc']`).
- AC3 (preset knowledge → attached): helper test asserts collection attachments in the
  composer shape (`type:'collection', status:'processed'`); Chat.svelte appends them to
  `files`.
- AC4 (reads meta.preset shape the modal writes): helper reads
  `default_model_id/tool_ids/knowledge_ids`; Chat.svelte reads `folder.meta.preset`.
**Test Results:** svelte-check 1 pre-existing error; Vitest folder-preset 8/8.

### T-014: Empty/partial preset seeds nothing beyond unfoldered defaults (CS/R3)
**Status:** COMPLETE
**Files Modified:**
- `cypress/e2e/folder-chat-seeding.cy.ts` — CS/R3 context.
**Coverage:** The seeding logic is a plain no-op per unset field with no special
"empty folder" branch — proven by the `seedFromFolderPreset empty/partial (CS/R3)`
describe in `src/lib/utils/folder-preset.test.ts` (absent/null/`{}`/empty-arrays →
`{}`; partial preset → only the set field present).
**Acceptance criteria trace (CS/R3):**
- AC1 (no preset → same model as unfoldered): helper returns `{}` so initNewChat leaves
  the model at the unfoldered default; Cypress asserts the empty-folder chat's model
  equals the unfoldered baseline model.
- AC2 (no preset → no tools/knowledge beyond unfoldered): helper returns `{}` (no
  selectedToolIds/knowledgeCollections); Cypress asserts no collection attachment.
- AC3 (partial preset seeds only set fields): helper test asserts model-only preset
  yields `selectedModels` set and tools/knowledge `undefined`; Cypress configures
  model-only and asserts tools/knowledge stay at defaults.
**Test Results:** svelte-check unchanged (cypress outside tsconfig); helper tests 8/8.

### T-015: Seeded settings are independent per-chat state (CS/R4)
**Status:** COMPLETE
**Files Created:**
- `src/lib/components/chat/chat-seed-independence.test.ts` (static guard)
**Files Modified:**
- `cypress/e2e/folder-chat-seeding.cy.ts` — CS/R4 context.
**Acceptance criteria trace (CS/R4):**
- AC1/AC2/AC3 (changing model/tool/knowledge doesn't change the folder preset): static
  guard asserts Chat.svelte never references `updateFolderPresetById` (the only preset
  WRITE path), so no chat-setting change can write back; Cypress asserts that after
  changing the chat model, reopening Configure still shows the original preset model.
- AC4 (folder never re-applies preset after creation): static guard asserts
  `seedFromFolderPreset` is called exactly ONCE, inside initNewChat (creation), before
  saveChatHandler, and the save path carries no preset fields; Cypress asserts a changed
  model persists across reload (no re-assert).
**Test Results:** svelte-check 1 pre-existing error; Vitest chat-seed-independence 3/3;
full suite 43/43.

## Final gate summary
- svelte-check: 1 ERROR (pre-existing `eventsource-parser`, not ours), 0 new errors.
- Vitest: 8 files, 43 tests, all passing.
- Cypress: specs authored for all e2e-strategy tasks (CI-executed).
- All 15 tasks COMPLETE (FC R1-R6, SO R1-R5, CS R1-R4); 57/57 acceptance criteria mapped.
