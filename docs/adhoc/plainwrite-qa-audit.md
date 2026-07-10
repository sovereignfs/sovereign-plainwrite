# Plainwrite QA audit — dynamic + code review

**Date:** 2026-07-10
**Method:** Ran the plugin live (`pnpm dev`, registered a throwaway account), drove every
GitHub-free flow through the browser, and reasoned about the GitHub-dependent flows from
code where a real PAT/write repo was unavailable. Each finding below is tagged
**[verified live]** or **[code review]**.

**Test project used:** `withastro/blog-tutorial-demo` @ `complete`, path prefix
`src/pages/posts` (public, no PAT) — 4 posts synced cleanly.

## Fix status (same day)

All findings below (F1–F7, plus root-cause theme T1) were fixed in the same session. Summary:

| Finding | Status | Verification |
| --- | --- | --- |
| T1 — no error boundary, mutations throw to a full-page 500 | ✅ Fixed | `app/error.tsx` added; sync/publish/publish-all/invite converted to `useActionState` + inline errors |
| F1 — invite member needs a raw user ID | ✅ Fixed | Search-by-name/email picker (`InviteMemberForm.tsx`) backed by new `searchProjectDirectoryUsers` action; verified live |
| F2 — Sync with wrong branch = 500 | ✅ Fixed | `syncProjectContent` returns `ActionResult`; verified live (inline error, no crash) |
| F3 — private repo w/o PAT hid local drafts | ✅ Fixed (earlier this session) | `listContentFiles` fallback; regression test added |
| F4 — Publish without a token = 500 | ✅ Fixed | `publishCommittedDraft`/`publishAllCommittedDrafts` return `ActionResult`; verified live |
| F5 — sidebar "Editor" link always 404s | ✅ Fixed | Removed the hardcoded/broken nav link |
| F6 — "Drafts"/"Publishing" dead nav placeholders | ✅ Fixed | Removed (already surfaced on the dashboard) |
| F7 — editor header badge stale after autosave | ✅ Fixed | Removed the redundant header badge; "Current state" panel is the single source of truth |
| Conflict UX (raised under "not verified") | ✅ Partially addressed | Conflicts now surface as inline `ActionResult` errors instead of crashing; a richer resolve-conflict affordance (diff view) is still future work |
| F8 — brand-new local files invisible everywhere (found via user report, post-fix) | ✅ Fixed | `listContentFiles` now merges local-only drafts (no file-cache row) into the file list; verified live |

Verified via: `pnpm test` (92/92 passing, plugin), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`
(all clean from the platform root), plus live browser reproduction of F1, F2, F4, F5, F7, F8 against
the same `withastro/blog-tutorial-demo` test project used in the original audit. F3 and F6 were
verified live earlier in the same session. Nothing in this pass has been committed or pushed.

---

## Coverage summary

| Flow | Result |
| --- | --- |
| Register / sign-in / launcher / open plugin | ✅ works |
| Create project | ✅ works |
| Sync content (public repo, valid inputs) | ✅ works — 4 files cached, grouped by collection |
| Editor: schema-inferred structured fields (author/date/tags/etc.) | ✅ works |
| Editor: Structured ⇄ Raw YAML toggle | ✅ present, renders |
| Editor: autosave (2s debounce) | ✅ works — "Autosaved", draft persisted |
| Save draft / Mark ready | ✅ works — status → Draft → Ready to commit |
| Draft visibility on dashboard | ✅ works (after this session's fix) — "1 in progress" |
| Create new content file (local draft) | ✅ works — redirects into editor |
| Edit project settings (name/branch/path/visibility) | ✅ works |
| Invite member | ✅ Fixed (F1) — search picker, verified live |
| Sync with wrong branch/repo | ✅ Fixed (F2) — inline error, verified live |
| Publish without a token | ✅ Fixed (F4) — inline error, verified live |
| "Editor" sidebar link | ✅ Fixed (F5) — removed, verified live |
| Publish happy-path | ⚠️ not verifiable without a writable PAT repo |
| Conflict detection | ⚠️ no longer crashes (fixed), but no resolve-conflict UI yet — see "Remaining work" |
| OAuth "Connect GitHub" | ⚠️ not exercised (needs configured GitHub OAuth app) |
| Portability export/import/delete | ⚠️ not UI-reachable; reviewed in code earlier |

---

## Root-cause theme (fix this first)

**T1 — Every expected failure in a server action becomes a full-page 500 crash.**

The plugin has **no `error.tsx` boundary** of its own, and its form/button server actions
signal all failures by `throw new Error(...)`. Next.js turns an uncaught throw in a server
action into the *runtime's* route-level error boundary (`runtime/app/error.tsx`) — i.e. the
whole page is replaced by **"500 — Something went wrong."** There is no inline error, no
retained form state, and often no way back except the browser Back button.

This is not an edge case — it fires on completely ordinary user behavior. There are ~20
user-facing `throw new Error(...)` sites in `app/_lib/actions.ts`, including:

- `syncProjectContent` → `GitProviderError` on a wrong branch / private repo / rate limit (`actions.ts:518`, propagated from `git-providers.ts:344`)
- `publishCommittedDraft` / `publishAllCommittedDrafts` → "Connect a GitHub token before publishing." (`actions.ts:673`, `758`)
- `publishCommittedDraft` → **conflict** paths ("Conflict: remote file changed since this draft was opened.", `actions.ts:1945-1954`) — the entire point of conflict detection is defeated if a detected conflict just crashes the page instead of prompting the user
- `publishCommittedDraft` → "Commit this draft before publishing." (`actions.ts:678`)
- `hardDeleteProject` → "Type DELETE to permanently delete the project." (`actions.ts:1356`)
- `removeProjectMember` / demote → "The last owner cannot remove themselves." / "…cannot be demoted." (`actions.ts:1441`, `1501`)
- `stageContentDeletion` → "Sync this file before staging deletion." (`actions.ts:929`)
- `inviteProjectMember` → see F1

**Fix direction (one change fixes most of the audit):**
1. Add `app/error.tsx` (a `'use client'` boundary with a reset button) as a safety net so no
   Plainwrite failure ever shows the bare platform 500. *And*
2. Convert the user-facing mutation forms to `useActionState` (or return a typed
   `{ ok: false, message }` result) and render the message inline next to the form, keeping
   the user on the page with their input intact. Priority forms: invite member, publish /
   publish-all, sync, delete-confirm, stage-deletion.
   - Distinguish **expected validation** errors (show inline, friendly) from **unexpected**
     errors (let the boundary catch them).
   - Conflicts deserve their own affordance (show remote-vs-local, offer re-sync), not a
     generic inline error.

**✅ FIXED.** Added `app/error.tsx` + `app/error.module.css` (plugin-scoped boundary,
mirrors `runtime/app/error.tsx`'s style, has a "Try again" reset button). Added a shared
`ActionResult = { ok: true; message?: string } | { ok: false; error: string }` type
(`actions.ts`). Converted `syncProjectContent`, `publishCommittedDraft`,
`publishAllCommittedDrafts`, and `inviteProjectMember` to accept `(prevState, formData)` and
return `ActionResult` instead of throwing — matching the existing `useActionState` convention
already used in `plugins/account`/`plugins/console` (`{ ok, error }` shape, `role="status"
aria-live="polite"` inline text). New client components `SyncContentForm.tsx`,
`PublishAllForm.tsx` wrap the dashboard buttons; `MarkdownEditor.tsx` (already client) got a
`useActionState` for its inline Publish button. Deliberately left as throws (still caught by
the new `error.tsx` boundary, not inline): `requireProjectRole` authorization failures — not
reachable through normal UI, so an inline message isn't useful — and destructive-action guards
(`hardDeleteProject`'s DELETE-confirmation, `removeProjectMember`'s last-owner guard) which
were lower priority and out of this pass's live-verified scope.

---

## Individual findings

### F1 — Invite member asks for a raw internal "User ID" — nobody can use it **[verified live]**
- **Repro:** Settings → Team → "User ID" field → enter an email or name (the only things a
  human knows) → **500 "No active user found with that ID."**
- **Root:** `app/[projectId]/settings/page.tsx:335` renders `<Input name="userId">`;
  `inviteProjectMember` (`actions.ts:1408-1422`) passes it straight to
  `sdk.directory.resolveUsers({ ids: [...] })`, which only matches opaque internal IDs.
- **Fix:** Replace the free-text ID field with a **search-by-name/email picker** backed by
  `sdk.directory.searchUsers({ query })` (already in the SDK, `packages/sdk/src/directory.ts:14`).
  Resolve the chosen user to an id before insert. Until then this feature is effectively
  non-functional.
- **Severity: HIGH.**
- **✅ FIXED.** New `searchProjectDirectoryUsers(projectId, query)` action (viewer-role gated,
  min 2-char query) wraps `sdk.directory.searchUsers`. New `InviteMemberForm.tsx` client
  component: debounced (250ms) typeahead resolves a hidden `userId` field only once a real
  directory match is clicked; the raw text input is gone. `inviteProjectMember` now returns
  `ActionResult` instead of throwing. Verified live: searching "Test" surfaced "Test Auditor
  (auditor@test.local)"; selecting it and submitting with the default Viewer role (while
  already sole owner) correctly showed the inline error "The last owner cannot be demoted."
  instead of crashing — confirming both the happy path (resolves real users) and an expected
  validation error render inline.

### F2 — Any GitHub error during Sync = full-page 500 **[verified live]**
- **Repro:** create a project with a wrong branch (e.g. `main` on a repo whose default is
  `complete`) → **Sync content** → page replaced by "500 Something went wrong."
- **Root:** `syncProjectContent` (`actions.ts:518-528`) calls `refreshProjectContentCache`
  with no try/catch; a `GitProviderError` (404/403/rate-limit/bad-branch/bad-path) throws out
  of the action. Note `listContentFiles` *does* catch the same failure into `syncError` —
  the explicit user-triggered Sync does not, so it's strictly worse than the passive path.
- **Fix:** catch `GitProviderError` in `syncProjectContent`, re-surface as an inline message
  ("Couldn't reach that repo/branch — check the repository, branch, and access.") instead of
  throwing. Per T1.
- **Severity: HIGH** (a typo in the branch field hard-crashes the page).
- **✅ FIXED.** `syncProjectContent` wraps `refreshProjectContentCache` in try/catch and
  returns `ActionResult`. New `SyncContentForm.tsx` client component renders the error inline.
  Verified live: set the project's branch to `nonexistent-branch`, clicked Sync content — page
  stayed intact, inline text read "GitHub repository was not found or the token cannot access
  it." (the same sanitized message `GitProviderError` already produced; just no longer thrown).

### F3 — Private repo without a PAT hid the user's own local drafts — **FIXED this session**
- Was: `listContentFiles` early-returned an empty list for a private repo when the metadata
  visibility gate blocked GitHub, *before* querying the user's drafts — so saved drafts were
  invisible. Fixed to fall back to listing the user's own drafts with an explanatory notice.
- Also fixed the stale "Drafts — Not started / planned" dashboard card to show a real count.
- Regression test added (`actions-content-list-no-credential.test.ts`). Verified live: draft
  now shows as "1 in progress" and the file row shows "Draft".

### F4 — Publish without a connected token = full-page 500 **[verified live]**
- **Repro:** Mark a draft ready → **Publish** with no PAT connected → 500.
- **Root:** `publishCommittedDraft` (`actions.ts:666-673`) throws
  "Connect a GitHub token before publishing." Same class as F2/T1.
- **Fix:** Ideally the Publish button should be disabled (with a hint) when no credential is
  connected, *and* the action should return a friendly inline error as a backstop. Per T1.
- **Severity: HIGH.**
- **✅ FIXED.** `publishCommittedDraft` and `publishAllCommittedDrafts` both return
  `ActionResult` (including the conflict and bookkeeping-failure paths, which previously also
  threw). `MarkdownEditor.tsx`'s Publish button now uses `useActionState` directly (it's
  already a client component) and `PublishAllForm.tsx` wraps the dashboard's Publish-all
  button. The "disable when no credential" affordance from the original suggestion wasn't
  added — the inline-error backstop was prioritized since it also covers commit-conflict and
  bookkeeping-failure cases that a simple disabled-state couldn't. Verified live: marked a
  draft ready, clicked Publish with no PAT connected — page stayed intact, inline text read
  "Connect a GitHub token before publishing."

### F5 — Sidebar "Editor" nav link always 404s **[verified live]**
- **Repro:** In a project, click **Editor** in the left nav → "404 — This page could not be
  found."
- **Root:** `PlainwriteSidebar.tsx:64` hardcodes
  `editorHref = ${projectHref}/editor/src/content/example.md` — a placeholder path that
  won't exist (and, for any project whose prefix isn't `src/content`, is rejected by
  `assertContentPathAllowed` → `notFound()`).
- **Fix:** Either remove the "Editor" top-level nav item (the editor is correctly reached by
  clicking a file in the Content list), or point it at a real destination (a file picker, or
  the first content file). Don't link to a synthetic path.
- **Severity: MEDIUM** (a primary nav item is always broken).
- **✅ FIXED.** Removed the "Editor" nav item (and its unused `editorHref`) from
  `PlainwriteSidebar.tsx` — the editor is reached correctly by clicking a file in Content.
  Verified live: the project nav now shows only Content/Settings, no broken link.

### F6 — Sidebar "Drafts" and "Publishing" are dead disabled placeholders **[verified live]**
- `PlainwriteSidebar.tsx:97-98` render `<span class="disabled">Drafts</span>` and
  `Publishing` that look like nav items but do nothing. The dashboard already surfaces both
  (Drafts card + Publish events / Publish all). Either wire them to anchors/sections or
  remove them so the nav doesn't advertise features that aren't clickable.
- **Severity: LOW** (cosmetic / UX polish).
- **✅ FIXED.** Removed both disabled placeholder spans (and the now-orphaned `.disabled` CSS
  rule) rather than wiring fragile anchor links — the dashboard's Drafts card and Publish
  events/Publish all section already cover this, so a duplicate nav entry wasn't worth the
  anchor-scrolling complexity.

### F7 — Editor header status badge doesn't react to autosave **[verified live]**
- The top `PageHeader` status badge is server-rendered ("Unmodified") and stays stale after
  an autosave/edit, while the "Current state" section correctly updates to "Draft". Minor
  inconsistency — consider driving the header badge from the same client state, or drop it
  from the header to avoid the contradiction.
- **Severity: LOW.**
- **✅ FIXED.** Dropped the `PageHeader` status badge from the editor page (`editor/[...filePath]/page.tsx`)
  rather than wiring it to client state — the "Current state" panel in `MarkdownEditor.tsx`
  is already the accurate, live-updating source of truth, so duplicating it in the header was
  redundant as well as stale. `StatusBadge` import and the now-unused `formatEditorStatus`
  helper were removed from the page.

### F8 — A brand-new local file is invisible everywhere after "Save draft" **[verified live, found via user report after the F1–F7 fix pass]**
- **Repro:** "New content file" → create `blog/hello-world.md` → redirected into the editor →
  click **Save draft** → navigate back to the project dashboard → the file appears in neither
  **Content files** nor the **Drafts** card ("No drafts yet"), even though the save itself
  succeeded (no error, the draft row exists in the DB).
- **Root:** `listContentFiles` (`actions.ts`) builds its returned file list by starting from
  `plainwriteFileCache` rows and merging draft status onto each one by path
  (`files.map((file) => { const draft = draftByPath.get(file.path); ... })`). A file created
  locally and never synced from GitHub has **no** file-cache row — it can't have one, since
  the file cache is only ever populated by a GitHub tree sync or a successful publish. The
  draft lookup only merges *onto* existing cache rows; there was no path that added a draft
  as a *new* entry when no cache row existed for it. This is a strictly broader version of F3:
  F3 was "drafts invisible when the *whole* file-tree listing is gated (no credential)"; F8 is
  "a specific new-file draft is invisible even with full GitHub access, because that file
  can never appear in a synced tree until *after* it's published" — i.e. a chicken-and-egg gap
  that affected every project, not just private ones without a PAT.
- **Fix:** Extracted `draftToLocalOnlyFileSummary()` (shared with F3's fallback branch) and
  added a merge step: after building the file list from the cache, filter drafts to those
  whose `filePath` has no matching cache row and whose `content` isn't `null` (a local-only
  draft can't be a pending-delete — staging a deletion requires an existing `baseSha`, which
  only exists for already-synced files), and append them as synthetic entries. Two new
  regression tests added (`actions-content-list-new-local-file.test.ts`): one asserting the
  new file appears with `status: 'draft'`, one asserting no duplicate entry is produced once
  the file *is* later synced (has both a cache row and a draft).
- **Severity: HIGH** (this is the core "create → save → find it again" loop of the whole
  plugin; it silently broke for the most common possible action).
- Verified live: created `blog/hello-world.md`, saved as draft, returned to dashboard — the
  file now appears in Content files with status "Draft", and the Drafts card reads "1 in
  progress."

---

## Not verified (need credentials/config) — recommend a follow-up pass

- **Publish happy path & staged deletion write-back** — needs a PAT with write access to a
  throwaway repo. Code path: `publishCommittedDraft`/`publishAllCommittedDrafts` →
  `git-providers.ts`. Worth a live run once a test repo + PAT exists. (The failure path —
  no token connected — is now fixed and live-verified; the success path itself was already
  covered by unit tests and remains untested live.)
- **OAuth "Connect GitHub"** — needs `GITHUB_CLIENT_ID/SECRET` configured; not exercised.
- **Portability export/import/delete** — not reachable from the plugin UI (platform-driven);
  covered by unit tests this session but not end-to-end.

## Remaining / future work (not in this pass)

- **Conflict resolution UX.** Conflicts no longer crash the page (they now surface as an
  inline `ActionResult` error, same as any other publish failure), but there's still no
  dedicated affordance to *resolve* a conflict — no diff view, no "re-sync and retry." A
  user just sees the error text and has to manually re-sync and re-edit.
  `assertNoPublishConflict` (`actions.ts`) already has the information needed to build this;
  it just isn't surfaced richly yet.
- **Disable Publish when no credential is connected**, as a proactive affordance on top of
  the inline-error backstop that's now in place (F4).
- **Destructive-action guards still throw**, caught only by the new `error.tsx` boundary, not
  shown inline: `hardDeleteProject`'s "Type DELETE" mismatch, `removeProjectMember`'s
  last-owner guard, `stageContentDeletion`'s "sync before staging" guard. Lower priority since
  the boundary now catches them gracefully instead of hitting the platform 500, but converting
  them to the same `ActionResult` pattern would match the rest of the plugin.
- **Publish happy path** — needs a live PAT-backed test repo (see above).

---

## Suggested fix order — completed this session

1. ~~**T1 + F2 + F4** — add `app/error.tsx`, convert publish/sync/invite/delete forms to inline
   error results.~~ ✅ Done.
2. ~~**F1** — search-by-email member picker via `sdk.directory.searchUsers`.~~ ✅ Done.
3. **Conflict UX** — partially done (no longer crashes); a resolvable-conflict affordance is
   still future work, see above.
4. ~~**F5 / F6 / F7** — nav + cosmetic cleanup.~~ ✅ Done.
