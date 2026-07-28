---
created: "2026-07-19"
last_edited: "2026-07-19"
---

# Cavekit: Folder RAG Config UI

## Scope

The client-side surface that lets a user configure a chat folder's **RAG
preset** — a default model, a set of tools, and attached Knowledge (knowledge
bases and/or datasets). A new "Configure" entry in a sidebar folder's options
menu opens a modal where these three values are picked and saved. The values are
persisted through the already-shipped serving-plane endpoint that validates and
stores a folder's preset (self.ai MR!138, merged).

This kit covers **Phase 1** of the chat-folders-as-presets feature: the wiring of
existing pickers into a folder-configuration modal, and the frontend API call
that persists the result. It reuses the pickers already built for the Workspace
Model Editor verbatim — no new picker component is designed here. It does **not**
cover seeding a newly created chat from a folder's preset (that is a separate
kit) nor any change to how the sidebar lists chats and folders (also a separate
kit).

A folder's preset is read from and written to the folder's stored metadata under
a `preset` key holding `default_model_id`, `tool_ids`, and `knowledge_ids`. This
kit treats the backend as authoritative for validation: the frontend surfaces the
backend's accept/reject outcome and does not invent per-field validation it
cannot back up.

## Requirements

### R1: Configure Entry in the Folder Options Menu
**Description:** A folder's options menu (the same dropdown that currently offers
rename, export, and delete) gains a "Configure" entry. Consistent with that
menu's existing convention, selecting it dispatches a single `configure` event to
the folder that owns the menu, rather than taking any action directly or
receiving a handler prop.
**Acceptance Criteria:**
- [ ] The folder options menu presents a "Configure" item alongside the existing
      rename, export, and delete items.
- [ ] Selecting "Configure" dispatches a `configure` event and takes no other
      action itself (dispatch-only, matching the rename/export/delete items).
- [ ] The owning folder component listens for the `configure` event and responds
      by opening the configuration modal for that folder (see R2).
**Dependencies:** none (foundational to this kit).

### R2: Configuration Modal Reusing Existing Pickers
**Description:** A folder-configuration modal opens in response to the
`configure` event, using the same show/hide idiom already used for the folder's
other sidebar modals (a bound boolean controlling visibility). The modal presents
exactly three inputs — a single default-model picker, a tool-set picker, and a
Knowledge picker — each of which is an existing component reused as-is: the chat
composer's single-model picker primitive (bound to one model id), the Workspace
tool-set picker (bound to a plain array of tool ids), and the Workspace Knowledge
picker (bound to full knowledge objects). No new picker UI is built.
**Acceptance Criteria:**
- [ ] The configuration modal's visibility is controlled by a bound boolean, the
      same idiom used by the folder's existing delete-confirmation modal.
- [ ] The modal presents a single default-model selection input reusing the chat
      composer's single-model picker primitive (the one bound to a single model
      id), not the composer wrapper that carries composer-specific side effects.
- [ ] The modal presents a tool-set input reusing the Workspace tool-set picker,
      bound to a plain array of tool ids.
- [ ] The modal presents a Knowledge input reusing the Workspace Knowledge
      picker, bound to full knowledge objects.
- [ ] Whatever backing data these pickers require to render their options (the
      available models, tools, and knowledge collections) is populated before or
      as the modal opens, so each picker shows selectable options.
- [ ] No new picker/selector component is introduced by this kit (see R6).
**Dependencies:** R1.

### R3: Modal Pre-Populates From the Folder's Current Preset
**Description:** When the modal opens, it reflects the folder's currently stored
preset: the default-model picker shows the folder's stored default model, the
tool picker shows its stored tools selected, and the Knowledge picker shows its
stored knowledge attached. A folder that has no preset opens the modal with all
three inputs empty/unselected.
**Acceptance Criteria:**
- [ ] Opening the modal loads the folder's current preset
      (`default_model_id`, `tool_ids`, `knowledge_ids` under the folder metadata's
      `preset` key) and reflects each value as the corresponding picker's
      initial selection.
- [ ] A folder with no stored preset opens the modal with the model unselected,
      no tools selected, and no knowledge attached.
- [ ] A tool or knowledge reference stored in the preset that is present in the
      loaded option set appears pre-selected; the modal does not require the user
      to re-pick already-stored values to preserve them on save.
**Dependencies:** R1, R2.

### R4: Save Persists via the Existing Backend Endpoint, Surfacing a Single Error
**Description:** Saving the modal sends the three preset fields to the existing
serving-plane folder-update endpoint through a new frontend API function (no such
generic folder-update passthrough exists in the client today; only narrow
single-purpose folder updates do). The backend validates every reference
atomically and rejects the whole write with a single generic error if any
reference is unresolved or inaccessible, leaking no per-field or
existence-versus-inaccessible detail. The modal surfaces that outcome as one
generic error message and does not fabricate per-field validation it cannot
substantiate.
**Acceptance Criteria:**
- [ ] A new frontend folders-API function submits `default_model_id`, `tool_ids`,
      and `knowledge_ids` to the existing folder-update endpoint.
- [ ] A successful save closes the modal (or otherwise signals success) and the
      folder's stored preset reflects exactly the submitted values on a
      subsequent read.
- [ ] A rejected save surfaces a single generic error in the modal and does not
      claim which specific reference failed or whether it was missing versus
      inaccessible.
- [ ] The modal does not perform per-field client-side reference validation that
      duplicates or contradicts the backend's atomic all-or-nothing check.
**Dependencies:** R1, R2, R3. Depends on the serving-plane preset-config backend
contract (self.ai's Chat Folder Preset Config kit — different repository).

### R5: Explicit Clear Persists as a Clear
**Description:** Deselecting a field entirely in the modal (removing the model,
unchecking all tools, or removing all knowledge) and saving results in that field
being cleared on the folder's stored preset. This is a deliberate, explicit clear
performed by this modal — distinct from the backend's separate merge-on-omit
behavior on *other* folder-update paths (e.g. rename), which do not touch the
preset fields at all.
**Acceptance Criteria:**
- [ ] Removing the selected model and saving results in the folder's stored
      preset having no default model on a subsequent read.
- [ ] Unchecking all tools and saving results in the folder's stored preset
      having no tools on a subsequent read.
- [ ] Removing all knowledge and saving results in the folder's stored preset
      having no knowledge on a subsequent read.
- [ ] A save from this modal submits all three preset fields together (an
      explicit clear is a submitted empty value, not an omitted field), so that
      an emptied field is actually cleared rather than merge-preserved.
**Dependencies:** R2, R4.

### R6: No New Picker Components (YAGNI Guard)
**Description:** This domain is UI wiring over existing pieces only. It builds no
new picker, selector, or knowledge/tool-attachment component; it composes the
already-shipped composer model picker and Workspace tool/Knowledge pickers into a
modal and adds one API function.
**Acceptance Criteria:**
- [ ] No new model-, tool-, or knowledge-picker component is added by this kit;
      the model, tool, and Knowledge inputs are the pre-existing shared
      components.
- [ ] The only net-new client code is the Configure menu item, the modal
      container that composes existing pickers, and the folders-API function that
      calls the existing backend endpoint.
**Dependencies:** R2.

## Out of Scope

- **Seeding a newly created chat from a folder's preset.** That is Phase 2 and is
  covered by the Chat Creation Folder Seeding kit.
- **Any change to how the sidebar lists chats or folders** (renaming the section
  header, re-scoping the collapse, filtering the flat chat list) — covered by the
  Sidebar Folder Chat Organization kit.
- **Nested-folder inheritance.** A child folder does not inherit an ancestor's
  preset; the configuration modal shows and writes only the folder's own preset.
- **A sidebar "has a preset" visual indicator.** Explicitly deferred; folders do
  not display any badge or marker indicating whether a preset is set.
- **Hard-binding.** The modal writes defaults; it does not make a folder enforce
  its settings on existing chats inside it.
- **A separate dataset/knowledge storage split.** The Knowledge picker presents
  knowledge bases and datasets as one list against a single `knowledge_ids`
  field; the parked storage split (self.ai OP#235) is not addressed here.
- **The backend validation/persistence itself.** This kit consumes the shipped
  endpoint; the typed preset schema, write-time reference validation, and
  no-regression guarantees live in the serving-plane backend kit (different repo).

## Cross-References

- See also: cavekit-chat-creation-folder-seeding.md — reads the same folder
  preset shape (`meta.preset.{default_model_id, tool_ids, knowledge_ids}`) that
  this kit writes, to seed a new chat's initial settings.
- See also: cavekit-sidebar-folder-chat-organization.md — the sidebar restructure
  that this modal's Configure entry point sits within.
- Backend dependency (different repository): self.ai's Chat Folder Preset Config
  kit defines the folder-update endpoint's atomic reference validation and the
  stored preset shape this modal reads and writes.

## Changelog

- 2026-07-19 — DRAFT created.
