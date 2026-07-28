---
created: "2026-07-19"
last_edited: "2026-07-19"
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

## Cross-Reference Map
| Domain A | Interacts With | Interaction Type |
|----------|---------------|-----------------|
| Folder RAG Config UI | Chat Creation Folder Seeding | Config UI *writes* the folder preset (`meta.preset.{default_model_id, tool_ids, knowledge_ids}`) that seeding *reads*. |
| Folder RAG Config UI | Sidebar Folder Chat Organization | The Configure menu entry and modal live within the sidebar folder area the organization kit restructures. |
| Chat Creation Folder Seeding | Sidebar Folder Chat Organization | Seeding owns and places the new-chat-in-folder affordance itself; the organization kit only governs where the *resulting* folder-scoped chat is displayed (under its folder vs. the flat unfoldered list). |
| Folder RAG Config UI | self.ai: Chat Folder Preset Config (different repo) | Consumes the shipped folder-update endpoint's atomic reference validation and stored preset shape. |
| Sidebar Folder Chat Organization | self.ai: cavekit-chat-list-unfoldered-filter (different repo) | Relies on the serving-plane chat-list read's already-unconditional unfoldered-only behavior, codified as a tested contract in that repo's kit (prose dependency, no new backend work required). |

## Dependency Graph
```
Folder RAG Config UI ──writes preset──▶ Chat Creation Folder Seeding
        │                                        │
        └── both sit within ───▶ Sidebar Folder Chat Organization ◀── displays resulting folder-scoped chats
                                                 │
                                   relies on (self.ai repo, already shipped):
                                   cavekit-chat-list-unfoldered-filter

Folder RAG Config UI ── consumes (self.ai repo): Chat Folder Preset Config backend endpoint
```

## Coverage Summary
- Domains: 3 (all DRAFT)
- Requirements: 15 (Folder RAG Config UI: 6, Sidebar Folder Chat Organization: 5, Chat Creation Folder Seeding: 4)
- Cross-repo dependencies: 2 (both on the self.ai serving-plane repository; the chat-list-unfoldered-filter one requires no new backend work — see that kit's grounding note)
