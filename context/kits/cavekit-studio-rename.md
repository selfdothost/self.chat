---
created: "2026-08-11"
last_edited: "2026-08-11"
---

# Cavekit: Workspace → Studio Rename (self.chat side)

## Scope

Renames the product surface currently called **Workspace** to **Studio**
across `self.chat`: routes, component tree, navigation, and translations. The
backend half — the `USER_PERMISSIONS` key migration and the transitional
dual-read in `has_permission` — is `self.ai`'s
`cavekit-studio-rename-permissions.md` and is a **hard prerequisite** for
shipping this kit's permission-key changes.

Decided in `selfai/gitlab-profile`
`context/treasuremaps/2026-08-11-tokenization-studio.md`, Decision 1. That map
also establishes *why* this ships standalone: it touches everything and shares
nothing with the Tokenization Studio feature that follows it. Landing them
together makes a bad rename indistinguishable from a bad feature.

This kit specifies the rename only. It does not implement it, and it adds no
new surfaces — `/studio/tokenization` is
`cavekit-tokenization-studio-shell.md`.

**Explicitly out of scope:** any behavioural change to the renamed pages. If a
Workspace page is broken today, it is equally broken as a Studio page
afterwards. A rename MR that also fixes things cannot be reviewed.

## Grounded in current self.chat structure

- **Routes.** 21 files under `src/routes/(app)/workspace/`, comprising a
  `+layout.svelte`, a `+page.svelte`, and seven sub-sections: `models`,
  `knowledge`, `prompts`, `tools`, `voices`, `training`, `evaluations`, plus
  their `create`/`edit`/`[id]` children.
- **Components.** `src/lib/components/workspace/` holds `Models.svelte`,
  `Knowledge.svelte`, `Prompts.svelte`, `Tools.svelte`, `Voices.svelte`,
  `Training.svelte`, `Evaluations.svelte`, their sibling subdirectories, and
  `common/`.
- **Navigation.** `src/lib/components/layout/Sidebar.svelte:560` links via
  `resolve('/(app)/workspace')`.
- **Imports from outside the tree.** At least four call sites import
  workspace components from elsewhere:
  `layout/Sidebar/ChannelModal.svelte:11`
  (`workspace/common/AccessControl.svelte`) and
  `layout/Sidebar/Folders/FolderConfigModal.svelte:21-22`
  (`workspace/Models/ToolsSelector.svelte`, `workspace/Models/Knowledge.svelte`).
- **Tests that assert on the import path as a string** — these fail on rename
  and are the tripwire that proves the sweep was complete:
  `FolderConfigModal.test.ts:412-413` and
  `folder-config-yagni.test.ts:17-18` both `expect(src).toContain(
  '$lib/components/workspace/Models/…')`.
- **Measured surface:** 62 files contain the string `workspace`, 178
  occurrences total. 6 i18n keys reference it across 51 locale directories
  under `src/lib/i18n/locales/`.
- **Permission keys consumed here** are the `workspace.*` hierarchy resolved
  server-side; see the self.ai kit for the storage shape and the migration.

## Requirements

### R1: Route Rename, No Redirects

**Description:** `/workspace/*` becomes `/studio/*`. Old URLs simply stop
existing.

The treasuremap's Decision 1 settles this: the surface has no real users yet and
nobody bookmarks these paths, so redirect machinery would be weight nobody ever
exercises. An earlier draft of this kit specified redirects; they are
deliberately dropped.

**Acceptance Criteria:**
- [ ] Every route file under `src/routes/(app)/workspace/` exists at the
      equivalent path under `src/routes/(app)/studio/`, preserving the
      sub-section and child structure
- [ ] No route file remains under `src/routes/(app)/workspace/`
- [ ] No redirect from any `/workspace/...` path is added
- [ ] Every in-app link that pointed at a `/workspace/...` path points at the
      `/studio/...` equivalent — since nothing redirects, a missed link is a
      dead one
- [ ] A `/studio/...` URL renders content identical to what its `/workspace/...`
      predecessor rendered

### R2: Component Tree Rename

**Description:** `src/lib/components/workspace/` becomes
`src/lib/components/studio/`, and every import that reaches into it is
updated.

**Acceptance Criteria:**
- [ ] `src/lib/components/workspace/` no longer exists; its full contents,
      including `common/` and the per-section subdirectories, are at
      `src/lib/components/studio/`
- [ ] No file in `src/` contains the import path fragment
      `$lib/components/workspace/`
- [ ] The four known external import sites resolve against the new path:
      `ChannelModal.svelte`, `FolderConfigModal.svelte` (two imports), and
      any further site a repo-wide search surfaces
- [ ] `FolderConfigModal.test.ts` and `folder-config-yagni.test.ts` are
      updated to assert the `studio/` path, and pass
- [ ] `npm run lint` and the type check report no unresolved imports

### R3: Navigation and Visible Labels

**Description:** The sidebar entry, page headings, breadcrumbs and any other
user-visible occurrence read "Studio".

**Acceptance Criteria:**
- [ ] `Sidebar.svelte`'s `resolve('/(app)/workspace')` targets the studio route
- [ ] The sidebar entry's visible label renders "Studio" via the i18n layer,
      not a hardcoded string
- [ ] No user-visible string in the running application reads "Workspace"
- [ ] Section labels within Studio (Models, Knowledge, Prompts, Tools, Voices,
      Training, Evaluations) are unchanged

### R4: Translations

**Description:** The 6 affected i18n keys are renamed and the value updated in
every locale.

**Acceptance Criteria:**
- [ ] Each affected key is renamed from its `workspace`-bearing form to the
      `studio` equivalent in `en-US`
- [ ] All 51 locale directories carry the renamed key — no locale is left with
      only the old key, which would render the raw key string to that user
- [ ] Non-English translated *values* are carried across unmodified rather than
      reverted to English; retranslating the word is out of scope for this kit
- [ ] The i18n parser (`i18next-parser.config.ts`) reports no orphaned
      `workspace` keys

### R5: Permission Key Consumption

**Description:** Client-side permission checks read `studio.*` instead of
`workspace.*`, matching the migrated key hierarchy.

**Depends on** `self.ai`'s `cavekit-studio-rename-permissions.md`. That kit
provides both the migration and a transitional dual-read, so this requirement
can land in the same release without a coordinated cutover — but it **cannot
land before** the backend kit, or every non-admin loses Studio access on
deploy.

**Acceptance Criteria:**
- [ ] Every client-side permission check referencing a `workspace.` key reads
      the `studio.` equivalent
- [ ] A user in a group whose stored permissions blob has been migrated sees
      exactly the Studio sections they saw as Workspace sections
- [ ] A user in a group whose blob has **not** been migrated still sees those
      sections, via the backend's transitional dual-read — verified against a
      group record left deliberately unmigrated
- [ ] An admin sees all sections regardless of blob state

### R6: Rename Completeness Guard

**Description:** A test that fails if `workspace` reappears in the renamed
surfaces, so the rename does not erode as later work is merged.

**Acceptance Criteria:**
- [ ] A test asserts no file under `src/routes/(app)/studio/` or
      `src/lib/components/studio/` contains the identifier `workspace`
- [ ] The test allows no exemptions — with R1 adding no redirects, there is no
      legitimate remaining occurrence
- [ ] The test names the treasuremap in its failure message so a future
      contributor learns why rather than deleting the guard

## Out of Scope

- Behavioural changes to any renamed page.
- Renaming the sections within Studio.
- The `/studio/tokenization` surface — `cavekit-tokenization-studio-shell.md`.
- The backend permission migration — `self.ai`'s
  `cavekit-studio-rename-permissions.md`.
- Renaming `USER_PERMISSIONS_WORKSPACE_*` environment variables. That is
  backend-side, and per the treasuremap it is low-risk because no `WORKSPACE`
  env appears in `manifests/`.

## Cross-References

- `selfai/gitlab-profile` `context/treasuremaps/2026-08-11-tokenization-studio.md`
  — Decision 1, including the measured surface and the silent-lockout failure
  mode.
- `self.ai` `context/kits/cavekit-studio-rename-permissions.md` — the required
  backend half.
- `cavekit-tokenization-studio-shell.md` — the first new surface to land in the
  renamed Studio.

## Changelog

- 2026-08-11: Initial draft from the Tokenization Studio treasuremap.
