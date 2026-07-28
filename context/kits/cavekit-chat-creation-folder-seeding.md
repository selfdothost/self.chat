---
created: "2026-07-19"
last_edited: "2026-07-19"
---

# Cavekit: Chat Creation Folder Seeding

## Scope

**Phase 2** of the chat-folders-as-presets feature: when a new chat is created
with a folder as the active context, that chat's initial settings — selected
model, selected tools, and attached knowledge — are seeded from the folder's
preset (`default_model_id`, `tool_ids`, `knowledge_ids` under the folder
metadata's `preset` key). Seeding mirrors the established pattern by which a chat
already seeds its tool selection from a selected model's metadata.

After creation, the seeded values are ordinary, fully independent, per-chat
mutable settings: changing the model, toggling a tool, or detaching knowledge in
that chat affects only that chat and never the folder's stored preset. The folder
never re-asserts its preset after creation.

This kit also **closes a gap discovered in the current UI**: there is no existing
affordance to create a chat scoped to a specific folder. Today the sidebar's only
folder-level add action creates a new *folder*, the folder options menu offers
only rename/export/delete, and new chats are created with no folder context. So
this kit must add a way to create a new chat with a folder as its active context,
then seed it.

Seeding happens at chat **creation** only. Moving an existing chat into a folder
(drag-and-drop) never applies the folder's preset — that is explicitly out of
scope (see Out of Scope) and is a confirmed product decision, not an open
question.

## Requirements

### R1: A Way to Create a New Chat Scoped to a Folder
**Description:** The user can create a new chat with a specific folder as the
active context. No such affordance exists in the sidebar today (the existing
folder-level add action creates a folder, and the folder options menu has only
rename/export/delete), so this kit adds one. The created chat belongs to that
folder (it appears under that folder rather than in the flat unfoldered list).
**Acceptance Criteria:**
- [ ] A user-reachable affordance exists to create a new chat with a specific
      folder as its active context.
- [ ] A chat created through that affordance belongs to that folder (it appears
      under the folder when expanded, not in the flat unfoldered chat list).
- [ ] Creating a chat this way does not require the user to first create it
      unfoldered and then manually move it.
**Dependencies:** none (foundational to this kit). This kit owns the affordance
itself — where it lives in the folder UI (e.g. the folder options menu, a
per-folder action) is this kit's decision to make. The sidebar restructure (see
Cross-References) only determines where the *resulting chat* is displayed
afterward (under its folder vs. the flat unfoldered list), not where the
create-affordance sits.

### R2: A Chat Created in a Folder Seeds From the Folder's Preset
**Description:** A chat created with a folder as the active context initializes
its selected model, selected tools, and attached knowledge from the folder's
preset. Tool seeding mirrors the existing pattern by which a chat seeds its tool
selection from a selected model's metadata (filtered to tools that actually
exist). Model seeding sets the chat's initially selected model to the folder's
default model. Knowledge seeding attaches the folder's knowledge references to the
chat as its knowledge/collection attachments.
**Acceptance Criteria:**
- [ ] A chat created in a folder whose preset sets a default model opens with
      that model selected.
- [ ] A chat created in a folder whose preset sets tools opens with those tools
      selected, filtered to tools that currently exist (mirroring the existing
      model-metadata tool-seeding behavior).
- [ ] A chat created in a folder whose preset attaches knowledge opens with that
      knowledge attached as the chat's knowledge/collection attachments.
- [ ] Seeding reads the folder's preset shape
      (`meta.preset.{default_model_id, tool_ids, knowledge_ids}`), the same shape
      the folder-configuration modal writes.
**Dependencies:** R1. Reads the same preset shape written by the Folder RAG Config
UI kit.

### R3: Empty Preset Seeds Nothing (No Special-Casing)
**Description:** A chat created in a folder whose preset is empty (no default
model, no tools, no knowledge) initializes with exactly the same defaults as a
chat created outside any folder. Seeding is a no-op when there is nothing to seed;
there is no special "empty folder" behavior.
**Acceptance Criteria:**
- [ ] A chat created in a folder with no preset selects the same model a chat
      created outside any folder would select.
- [ ] A chat created in a folder with no preset has no tools seeded and no
      knowledge attached beyond what an unfoldered new chat would have.
- [ ] A partially-set preset (e.g. a default model but no tools) seeds only the
      fields that are set and leaves the rest at the unfoldered defaults.
**Dependencies:** R2.

### R4: Seeded Settings Are Independent Per-Chat State
**Description:** After creation, the seeded model, tools, and knowledge are
ordinary per-chat mutable settings identical to those of any other chat. Changing
them affects only that chat and never the folder's stored preset. There is no
hard-binding and no silent desync tracking between a chat and its folder.
**Acceptance Criteria:**
- [ ] Changing the model in a folder-seeded chat does not change the folder's
      stored preset.
- [ ] Toggling a tool in a folder-seeded chat does not change the folder's stored
      preset.
- [ ] Detaching or attaching knowledge in a folder-seeded chat does not change
      the folder's stored preset.
- [ ] The folder does not re-apply its preset to the chat after creation (a chat
      whose settings were changed keeps the changed settings).
**Dependencies:** R2.

## Out of Scope

- **Moving an existing chat into a folder ever applying the folder's preset.**
  Confirmed decision (not an open question): drag-and-drop into a folder is an
  organizational action, not a reconfiguration action, so it never retroactively
  seeds the moved chat's model/tools/knowledge. Only chats *created* with the
  folder as active context are seeded.
- **Nested-folder inheritance of presets.** A child folder does not inherit an
  ancestor's preset for seeding; a chat is seeded only from its own folder's
  preset.
- **Any change to the Configure modal itself.** Writing/editing a folder's preset
  is covered by the Folder RAG Config UI kit; this kit only reads the preset.
- **Hard-binding / enforcement.** The folder never enforces or re-asserts its
  preset on chats after creation; enforcement is a separate, larger future
  feature.
- **The sidebar's chat-list restructure and unfoldered filter.** Where a
  folder-scoped chat appears in the sidebar is covered by the Sidebar Folder Chat
  Organization kit and its backend dependency.

## Cross-References

- See also: cavekit-folder-rag-config-ui.md — writes the folder preset
  (`meta.preset.{default_model_id, tool_ids, knowledge_ids}`) that this kit reads
  at chat-creation time.
- See also: cavekit-sidebar-folder-chat-organization.md — determines where the
  R1 affordance's *resulting chat* is displayed (under its folder, not the flat
  unfoldered list); does not determine where the affordance itself lives (this
  kit owns that placement). Its R5 states the complementary move-into-folder
  behavior that this kit deliberately does not seed.

## Changelog

- 2026-07-19 — DRAFT created.
