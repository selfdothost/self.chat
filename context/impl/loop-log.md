---
created: "2026-07-21"
last_edited: "2026-07-21"
---

# Build Loop Log

Build site: context/plans/build-site-folder-config.md

Append-only per-iteration record. Newest at the bottom.

## Iteration 1 — T-001 (FC/R1) — COMPLETE
- Added `Configure` item to `FolderMenu.svelte` (dispatch-only, Cog6 icon).
- Wired `RecursiveFolder.svelte` `on:configure` → `showConfigModal` boolean.
- Test: `FolderMenu.test.ts` (2 tests) — opens the bits-ui dropdown via keyboard
  Enter (fireEvent pointer events do not open bits-ui v2 in jsdom; Enter does),
  asserts Configure renders alongside rename/export/delete and dispatches only
  `configure`. Needed jsdom shims (ResizeObserver, scrollIntoView, pointer-capture).
- Gates: svelte-check clean for my files (baseline 1 pre-existing eventsource error);
  Vitest 2/2 pass.
- AC3 (modal opens) wiring done; e2e "opens" assertion deferred to T-002 (modal
  doesn't exist yet). Transient unused-var warning on `showConfigModal` until T-002.

## Iteration 2 — T-007 (SO/R1) — COMPLETE
- Sidebar section header `$i18n.t('Chats')` → `$i18n.t('Folders')`; added `"Folders"`
  i18n key (en-US).
- Tests: `Folder.test.ts` (2 Vitest — header name renders, add affordance fires
  onAdd); `folder-sidebar.cy.ts` SO/R1 context (CI e2e: "Folders" header + add
  creates folder).
- Gates: svelte-check clean (1 pre-existing error only); Vitest 2/2.

## Iteration 3 — T-012 (CS/R1) — COMPLETE
- Added a per-folder "New Chat" affordance: FolderMenu `newChat` item →
  RecursiveFolder navigates to `/(app)?folder_id=<id>` + clicks new-chat-button →
  Chat.svelte `initChatHandler` moves the created chat into that folder.
- Design: folder context carried on a `folder_id` URL param (matches existing
  model/tools/q new-chat param idiom; self-clearing; reused by T-013). Reverted an
  initial `newChatFolderId` store to avoid the stale-context edge.
- Tests: FolderMenu.test.ts (+2 → 4 total; New Chat renders + dispatches only
  newChat); `folder-chat-seeding.cy.ts` CS/R1 context (CI e2e).
- Gates: svelte-check clean (1 pre-existing error); Vitest 4/4.

## Iteration 4 — T-002 (FC/R2 + R6 guard) — COMPLETE
- New FolderConfigModal.svelte: common Modal with bound `show`; composes the
  composer single-model PRIMITIVE + Workspace ToolsSelector + Workspace Knowledge
  picker (no new picker). Loads tool/knowledge options on open, gates picker render
  on `optionsLoaded` to avoid ToolsSelector's onMount snapshot race.
- RecursiveFolder renders it `bind:show={showConfigModal}` → completes T-001 AC3.
- Test-infra fix (named duct tape): vitest.config `test.alias` used relative targets
  (resolved relative to importer → broke for $app/environment via constants.ts).
  Made absolute + added $app/paths mock. Full vitest suite green (13/13).
- Tests: FolderConfigModal.test.ts 6/6 (visibility-follows-boolean; three pickers
  render with non-empty options incl. opening the model dropdown for model-item
  options; import-path/no-new-picker static checks).
- Gates: svelte-check 1 pre-existing error (expected 'folder' unused-export warning
  cleared in T-003).

## Iteration 5 — T-003 (FC/R3) — COMPLETE
- loadOptions seeds pickers from folder.meta.preset before mount; knowledge ids →
  full objects. Empty preset → empty pickers. Cleared the T-002 'folder' warning.
- Tests: FolderConfigModal.test.ts +3 (populated preset reflected; empty preset
  empty; stored-ref-in-options pre-selected). 9/9. svelte-check clean.

## Iteration 6 — T-004 (FC/R4) — COMPLETE
- New folders-API fn updateFolderPresetById → /folders/{id}/update/preset (named
  route assumption). Modal Save wired: success closes + dispatches save; rejection
  shows ONE generic role="alert" error, no field detail, modal stays open, no
  pre-submit client validation.
- Tests: +3 (payload+close on success; generic-error-no-leak on reject; no client
  validation for out-of-options ref). 12/12. svelte-check clean.

## Iteration 7 — T-005 (FC/R5) — COMPLETE
- Added a "Remove" clear control for the model (primitive has no deselect); Save
  already submits all three fields so emptied = explicit clear.
- Tests: +4 (clear each field via UI → empty value in payload; empty-preset save
  carries all three keys with empty values). 16/16. svelte-check clean.

## Iteration 8 — T-006 (FC/R6) — COMPLETE
- Static YAGNI-guard test: reuse-only imports, primitive-not-wrapper, no new picker
  file under Folders/, exactly one added preset API fn. 4/4. svelte-check clean.
- FC domain complete (T-001..T-006).

## Iteration 9 — T-008 (SO/R2) — COMPLETE
- Restructured Sidebar: pinned block moved before the collapsible Folders header,
  flat list moved after; header now wraps only the <Folders> tree. Added
  showFolders bind:open + on:change → localStorage, init in onMount.
- Gotcha: repo is tab-indented but prettier config says spaces → prettier rewrote
  the whole file (reverted); dedented the moved block by hand instead.
- Tests: Folder.test.ts +2 (collapse hides/shows tree via {#if open}; emits change
  state) with animate shim; Cypress SO/R2 (collapse hides tree not pinned/flat;
  persists on reload). Full vitest 29/29. svelte-check clean.

## Iteration 10 — T-009 (SO/R3) — COMPLETE
- Regression guard on already-correct behavior. Verified getChatList = recent-chats
  endpoint, chats.set direct, no $chats.filter post-filter.
- Tests: sidebar-flat-list.test.ts (3 static guards: server-endpoint source, no
  broadening filter, load-more same endpoint); Cypress SO/R3 (intercept recent-chats,
  grouping headers, foldered chat absent). svelte-check clean.

## Iteration 11 — T-010 (SO/R4) — COMPLETE
- Cypress regression suite folder-regression.cy.ts: 7 its (drag chat-in, drag
  folder reparent, rename, export, delete-subtree, expand persist, folder renders
  own chats). CI-executed. svelte-check clean.

## Iteration 12 — T-011 (SO/R5) — COMPLETE
- Cypress SO/R5 context: drag-in removes from flat list + shows under folder; drag-out
  (onto Folders header root target) returns to flat list. Behavior-only, CI-executed.
- SO domain complete (T-007..T-011).

## Iteration 13 — T-013 (CS/R2) — COMPLETE
- Extracted pure seedFromFolderPreset helper (testable); initNewChat reads folder_id
  param → getFolderById → seeds selectedModels/selectedToolIds/files(knowledge) from
  meta.preset (tools filtered to existing, model only if exists).
- Tests: folder-preset.test.ts 8/8 (model/tools/knowledge seeding + shape); Cypress
  CS/R2 (configure preset model, create folder chat, assert seeded model). svelte-check
  clean.

## Iteration 14 — T-014 (CS/R3) — COMPLETE
- Empty/partial = no-op per unset field (no special branch). Logic proven by the
  empty/partial helper describe (folder-preset.test.ts). Added Cypress CS/R3 context
  (empty folder chat == unfoldered baseline model; model-only partial leaves rest).

## Iteration 15 — T-015 (CS/R4) — COMPLETE
- Static guard chat-seed-independence.test.ts: no updateFolderPresetById in Chat.svelte
  (no write-back); seedFromFolderPreset called exactly once inside initNewChat (not
  re-applied); save path carries no preset fields. Cypress CS/R4: change chat model ->
  folder preset unchanged; changed model persists across reload.
- ALL 15 TASKS COMPLETE. Final gates: svelte-check 1 pre-existing error only; full
  Vitest 43/43.
