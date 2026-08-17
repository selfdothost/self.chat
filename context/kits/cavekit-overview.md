---
created: "2026-07-19"
last_edited: "2026-08-11"
---

# Cavekit Overview

## Project
self.chat

## Domain Index
| Domain | File | Summary | Status |
|--------|------|---------|--------|
| Folder RAG Config UI | cavekit-folder-rag-config-ui.md | A "Configure" folder-menu entry opens a modal to set a folder's RAG preset (default model, tools, knowledge), reusing existing pickers and persisting via the shipped folder-update endpoint. | DRAFT |
| Sidebar Folder Chat Organization | cavekit-sidebar-folder-chat-organization.md | Renames the sidebar "Chats" section to "Folders", scopes its collapse to the folder tree only, and locks in (regression-guards) the flat list's already-unfoldered-only behavior. | DRAFT |
| Chat Creation Folder Seeding | cavekit-chat-creation-folder-seeding.md | Adds a per-folder new-chat affordance and seeds a chat created in a folder from the folder's preset; seeded settings are independent per-chat state thereafter. | DRAFT |
| Studio Rename | cavekit-studio-rename.md | Renames Workspace to Studio across routes, components, navigation and 51 locales, with a completeness guard. No redirects — old URLs stop existing. No behavioural change to any renamed page. | DRAFT |
| Tokenization Studio Shell | cavekit-tokenization-studio-shell.md | Adds `/studio/tokenization`: a gallery routing into tokenization sessions, a chat-forked session page with controls pinned open on wide viewports, forced `logprobs`/no-rechunking settings, its own permission, and Prompts in the composer. | DRAFT |
| Tokenization Token View | cavekit-tokenization-token-view.md | Renders replies as selectable tokens, shows the alternatives at a position, branches generation from a chosen token, accumulates an edit list, previews it via logit_bias, and dials a baked adapter's strength live. | DRAFT |

## Cross-Reference Map
| Domain A | Interacts With | Interaction Type |
|----------|---------------|-----------------|
| Folder RAG Config UI | Chat Creation Folder Seeding | Config UI *writes* the folder preset (`meta.preset.{default_model_id, tool_ids, knowledge_ids}`) that seeding *reads*. |
| Folder RAG Config UI | Sidebar Folder Chat Organization | The Configure menu entry and modal live within the sidebar folder area the organization kit restructures. |
| Chat Creation Folder Seeding | Sidebar Folder Chat Organization | Seeding owns and places the new-chat-in-folder affordance itself; the organization kit only governs where the *resulting* folder-scoped chat is displayed (under its folder vs. the flat unfoldered list). |
| Folder RAG Config UI | self.ai: Chat Folder Preset Config (different repo) | Consumes the shipped folder-update endpoint's atomic reference validation and stored preset shape. |
| Sidebar Folder Chat Organization | self.ai: cavekit-chat-list-unfoldered-filter (different repo) | Relies on the serving-plane chat-list read's already-unconditional unfoldered-only behavior, codified as a tested contract in that repo's kit (prose dependency, no new backend work required). |
| Studio Rename | Tokenization Studio Shell | The rename must land first — the shell's routes and permission keys are `studio.*`. Ordering, not data flow. |
| Studio Rename | self.ai: cavekit-studio-rename-permissions (different repo) | Hard prerequisite. Renaming the permission key without that kit's migration and dual-read silently strips Studio access from every non-admin, because `has_permission` denies on a missing hierarchy level. |
| Tokenization Studio Shell | Tokenization Token View | The shell provides the session, the forced settings and the permission gate; the view renders inside it. The shell is independently shippable and looks like ordinary chat on its own. |
| Tokenization Token View | self.ai: cavekit-tokenization-logprobs-rescore (different repo) | Consumes the per-token distributions on the stream, the on-demand re-score endpoint, and the branch-from-token path. |
| Tokenization Token View | self.ai: cavekit-tokenization-edit-store (different repo) | Persists the edit list and drives the `logit_bias` preview. |
| Tokenization Token View | self.ai: cavekit-tokenization-bake-job (different repo) | Submits a bake. `studio.tokenization` covers queueing; window definition and training courses stay separately gated. |
| Tokenization Token View | self.chat#46 (issue) | The version picker replaces the flat model list once `self.ai#131` lands; a character's versions are versions of one line, not N models. |

## Dependency Graph
```
Folder RAG Config UI ──writes preset──▶ Chat Creation Folder Seeding
        │                                        │
        └── both sit within ───▶ Sidebar Folder Chat Organization ◀── displays resulting folder-scoped chats
                                                 │
                                   relies on (self.ai repo, already shipped):
                                   cavekit-chat-list-unfoldered-filter

Folder RAG Config UI ── consumes (self.ai repo): Chat Folder Preset Config backend endpoint

Studio Rename ──must land first──▶ Tokenization Studio Shell ──hosts──▶ Tokenization Token View
     │                                      │                                  │
     │ requires (self.ai):                  │ consumes (self.ai):              │ consumes (self.ai):
     └─ cavekit-studio-rename-permissions   └─ cavekit-tokenization-           ├─ cavekit-tokenization-logprobs-rescore
        (migration + dual-read)                logprobs-rescore                ├─ cavekit-tokenization-edit-store
                                                                               └─ cavekit-tokenization-bake-job
```

## Coverage Summary
- Domains: 6 (all DRAFT)
- Requirements: 34 (Folder RAG Config UI: 6, Sidebar Folder Chat Organization: 5, Chat Creation Folder Seeding: 4, Studio Rename: 6, Tokenization Studio Shell: 6, Tokenization Token View: 7)
- Cross-repo dependencies: 7, all on the self.ai serving-plane repository. The chat-list-unfoldered-filter one requires no new backend work (see that kit's grounding note); the studio-rename-permissions one is a hard prerequisite whose absence fails silently.
- The three Tokenization domains and Studio Rename are anchored in
  `selfai/gitlab-profile` `context/treasuremaps/2026-08-11-tokenization-studio.md`.
