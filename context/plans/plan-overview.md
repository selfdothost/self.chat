---
created: "2026-07-19"
last_edited: "2026-08-13"
---

# Plan Overview

## Build Sites
| Site | File | Tasks | Done | Status |
|------|------|-------|------|--------|
| Folder Config, Sidebar Organization & Chat Seeding | build-site-folder-config.md | 15 | 0 | PLANNED |
| Workspace → Studio Rename | build-site-studio-rename.md | 7 | 7 | **SHIPPED** (`self.chat:8c3b6a1a`) |
| Tokenization Studio Shell (Phase 2) | build-site-tokenization-shell.md | 10 | 10 | **CODE-COMPLETE** |
| Tokenization Token View (Phase 3) | build-site-tokenization-token-view.md | 7 | 0 | PLANNED |

## Cross-repo ordering

`build-site-studio-rename.md` T-105 is hard-blocked on `self.ai`'s
`context/plans/build-site-studio-rename-permissions.md` (T-001, T-003, T-005).
Shipping the client rename first strips Studio access from every non-admin,
silently — no error, no log line, the navigation simply stops rendering.
Decision record: `selfai/gitlab-profile`
`context/treasuremaps/2026-08-11-tokenization-studio.md`, Decision 1.

`build-site-tokenization-shell.md` (Phase 2) has three hard prerequisites in
`self.ai`, listed in its own Cross-repo prerequisites section: the
`studio.tokenization` permission (X-1, X-2) and the session-kind column and
list filter (X-3, which carries a migration). T-206 and T-201 cannot be
verified until those land.

The rename is now **shipped and rolled**, so Phase 2's dependency on it is
satisfied. Its build site is retained as the record of what was specified
versus what actually shipped — the client half landed on main in a parallel
session as `2d9f4a5`, and only R6 (the completeness guard) came from this
plan's branch.
