---
created: "2026-07-19"
last_edited: "2026-07-19"
---

# Cavekit: Sidebar Folder Chat Organization

## Scope

A restructure of how the chat sidebar displays folders and chats. Today a single
collapsible section labelled "Chats" wraps three things at once — the pinned
chats, the folder tree, and the flat time-grouped chat list — so collapsing that
one section hides everything. This kit:

1. renames that section header from "Chats" to "Folders";
2. re-scopes the header's collapse toggle so it controls **only** the folder
   tree, leaving pinned chats and the flat chat list always visible; and
3. confirms the flat time-grouped chat list shows **only unfoldered chats**
   (chats with no folder) — and locks that in as a tested contract of this
   sidebar restructure, not an incidental side effect.

This kit covers only these three sidebar-display changes. The folder tree already
renders each folder's own contained chats when expanded — that behavior is
existing and unchanged. Folder CRUD, drag-and-drop mechanics, and the Configure
modal are out of scope.

> **Grounding note.** The flat chat list already shows only unfoldered chats
> today: it reads from the recent-chats endpoint (`GET /chats/`), which the
> serving-plane already filters to `folder_id IS NULL` unconditionally (see the
> sibling self.ai repo's `cavekit-chat-list-unfoldered-filter.md`). This kit does
> **not** need to add or consume a new backend filter — R3 below is a regression
> guard on already-correct behavior, not new wiring. The drafting brief assumed a
> new filter option would need to be built and consumed; that premise was
> inverted the same way it was for the backend kit (see Changelog).

## Requirements

### R1: Section Header Renamed to "Folders"
**Description:** The sidebar section whose header currently reads "Chats" (the
collapsible that heads the folder area, carrying the "New Folder" add affordance)
now reads "Folders".
**Acceptance Criteria:**
- [ ] The sidebar section header that previously read "Chats" now reads
      "Folders".
- [ ] The header's existing add affordance continues to create a new folder (its
      label and action are unchanged apart from sitting under the renamed
      header).
**Dependencies:** none (foundational to this kit).

### R2: Collapse Toggle Scoped to the Folder Tree Only
**Description:** Collapsing the "Folders" header hides only the folder tree. The
pinned-chats section and the flat unfoldered-chat list remain visible regardless
of whether the "Folders" header is collapsed or expanded.
**Acceptance Criteria:**
- [ ] Collapsing the "Folders" header hides the folder tree.
- [ ] Collapsing the "Folders" header does **not** hide the pinned-chats section.
- [ ] Collapsing the "Folders" header does **not** hide the flat unfoldered-chat
      list.
- [ ] The collapsed/expanded state of the "Folders" header persists across a
      reload the same way the section's collapse state does today.
**Dependencies:** R1.

### R3: Flat Chat List Shows Only Unfoldered Chats
**Description:** The flat, time-grouped chat list shows only chats that belong to
no folder. This is already true today because the recent-chats endpoint it reads
from already filters to unfoldered chats unconditionally (server-side, not a
client-side post-filter) — this requirement locks that behavior in as a tested
guarantee of the restructured sidebar, so a future change to either side cannot
silently regress it. Chats that live inside a folder do not appear in the flat
list (they appear under their folder instead — see R5). The existing time
grouping and the existing pagination/infinite-scroll behavior are unchanged.
**Acceptance Criteria:**
- [ ] The flat chat list contains only chats that have no folder assigned.
- [ ] A chat that has a folder assigned does not appear in the flat chat list.
- [ ] The existing time-range grouping (Today, Yesterday, Previous 7 days,
      Previous 30 days, month names) is preserved in the flat list.
- [ ] The existing pagination / infinite-scroll load-more behavior of the flat
      list is preserved.
- [ ] The flat list's unfoldered scoping comes from the server-side response
      (the existing recent-chats endpoint), not from a client-side post-filter
      over a broader result set.
**Dependencies:** R1. The serving-plane recent-chats endpoint already guarantees
unfoldered-only results (self.ai's `cavekit-chat-list-unfoldered-filter.md`,
same repo/endpoint the client already calls) — no new backend work is a
prerequisite; this requirement only asserts the client continues to rely on it
correctly through the restructure.

### R4: No Regression to Existing Folder Behavior
**Description:** All folder behavior that exists today continues to work
unchanged: dragging a chat into a folder, dragging a folder to reparent it,
renaming, exporting, deleting a folder and its subtree, and persistence of a
folder's expanded/collapsed state.
**Acceptance Criteria:**
- [ ] Dragging a chat onto a folder still moves that chat into the folder.
- [ ] Dragging a folder onto another folder (or to the root) still reparents it.
- [ ] Renaming a folder still works exactly as before.
- [ ] Exporting a folder still works exactly as before.
- [ ] Deleting a folder still deletes the folder and its subtree exactly as
      before.
- [ ] A folder's own expanded/collapsed state still persists across a reload.
- [ ] A folder still renders its own contained chats when expanded (this is
      pre-existing behavior and is not altered by this kit).
**Dependencies:** R1, R2, R3.

### R5: Moving a Chat Into a Folder Removes It From the Flat List
**Description:** When a chat is moved into a folder (via the existing
drag-and-drop), it disappears from the flat unfoldered list and appears under its
folder when that folder is expanded. This is a user-visible consequence of R3's
filter combined with the folder tree's pre-existing per-folder chat rendering; no
new code path beyond R3's filter is required, but it is stated explicitly because
it is observable behavior a test must confirm.
**Acceptance Criteria:**
- [ ] After a chat is dragged into a folder, it no longer appears in the flat
      unfoldered chat list.
- [ ] After a chat is dragged into a folder, it appears under that folder when
      the folder is expanded.
- [ ] After a chat is dragged out of a folder back to the unfoldered area, it
      reappears in the flat unfoldered chat list.
**Dependencies:** R3, R4.

## Out of Scope

- **The server-side unfoldered-only guarantee.** Already exists today
  (unconditional, not new work) and is defined by a separate kit in the
  serving-plane repository (self.ai). This kit only relies on it, via the
  endpoint the client already calls.
- **Folder CRUD and drag-and-drop mechanics.** Creating, renaming, reparenting,
  exporting, and deleting folders — and the drag-and-drop machinery itself — are
  unchanged and not redesigned here.
- **The Configure modal / folder preset UI.** Covered by the Folder RAG Config UI
  kit.
- **Chat-creation seeding from a folder preset.** Covered by the Chat Creation
  Folder Seeding kit.
- **A per-folder "new chat" affordance.** Introducing a way to create a chat
  scoped to a folder, and deciding where that affordance lives in the folder UI,
  belongs entirely to the Chat Creation Folder Seeding kit — this kit does not
  place it. This kit only governs where the *resulting chat* is displayed
  afterward (R5: under its folder vs. the flat unfoldered list).

## Cross-References

- See also: cavekit-folder-rag-config-ui.md — the Configure entry and modal that
  live within the sidebar folder area this kit restructures.
- See also: cavekit-chat-creation-folder-seeding.md — adds the per-folder
  new-chat entry point and seeds new chats; complements R5's move-versus-create
  distinction.
- Backend dependency (different repository): self.ai's recent-chats endpoint
  already guarantees unfoldered-only results unconditionally, codified as a
  tested contract in that repo's `cavekit-chat-list-unfoldered-filter.md`. R3
  relies on that guarantee holding; this kit does not define or implement it.
  Because it lives in another repository, it is referenced here in prose rather
  than as a local file link.

## Changelog

- 2026-07-19 — DRAFT created. Drafting brief assumed a new backend "unfoldered
  only" filter option would need to be built and consumed by R3. Verification
  against the actual self.ai implementation (and the sibling backend kit)
  inverted this premise: the recent-chats endpoint the client already calls
  already returns unfoldered-only results unconditionally. R3 was rewritten from
  "consume a new filter" to "lock in and regression-guard already-correct
  behavior" — no new backend dependency is a prerequisite for this kit.
