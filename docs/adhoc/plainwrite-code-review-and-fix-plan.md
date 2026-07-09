# Plainwrite (sovereign-plainwrite) — code review & fix plan

> **Status:** review complete 2026-07-09; all 9 numbered fix-plan items below
> are done, committed directly to `main` (per developer instruction partway
> through — items 1–2 landed as branch/PR, items 3 onward as direct commits).
> A platform-repo bug discovered along the way (manifest schema rejecting
> `connections.providers[].scopes`) was fixed separately in
> `sovereignfs/sovereign` PR #181 (draft, not yet merged as of this writing).
> Two additional P1s from a follow-up review (publish-all bookkeeping/conflict
> classification, item 6a) are also done. Remaining open items: P3-8/9/10
> (ride-along polish, not scheduled) and the item-9 visual QA flagged below —
> nothing else is outstanding from this doc.
> **Repo under review:** this repository (`sovereign-plainwrite`, on `main`) —
> mounted in the platform monorepo as `plugins/sovereign-plainwrite.local/`.
> All file paths below are relative to this repo's root.
> **Roadmap position (current):** PLW-001–009 complete. PLW-010 (data
> contracts, portability, activity, notifications) is the next open v0.1 task;
> its manifest permissions/`data.provides` were deliberately trimmed pending
> that task (see finding 2 below and `roadmap.md` PLW-010).

## Verified health (all green as of review)

`tsc --noEmit` ✓ · `vitest run` 4 files / 25 tests ✓ · monorepo ESLint (incl.
SDK boundary rule) ✓ · prettier ✓. **Green CI is misleading here** — see P1-1:
two of the four test files exercise dead code.

## What is genuinely good — do not regress

- **Tenant scoping is airtight.** Every query on every table filters
  `tenant_id` (+ `user_id` where user-scoped). Membership/role checks
  (`requireProjectRole`) guard every action. Last-owner demotion/removal is
  protected.
- **Secrets discipline.** PATs go into the platform vault via `sdk.secrets.*`;
  only `secretRef` is stored in plugin tables; PAT input is `type="password"`;
  publish errors are sanitized (`Bearer [redacted]`); GitHub error bodies are
  never echoed (status-code → fixed message map).
- **Conflict-detection design** (baseSha compare before publish) is sound.
- **Schema conventions**: `plainwrite_` prefix, `tenant_id` everywhere, both
  SQLite and Postgres migrations present, drizzle sqlite-typed `Db` cast
  matches the platform pattern (sovereign-tasks does the same).
- **Markdown preview is escape-first** (`escapeHtml` before injecting its own
  tags) — the `dangerouslySetInnerHTML` in `MarkdownEditor.tsx` is safe as
  written. CSS is 100% `--sv-*` tokens for colours.
- Danger-zone delete requires typed `DELETE`; hard-delete also cleans vault
  entries and all child rows.

---

## Findings

### P0 — data loss: editor silently replaces real content with a template

`app/_lib/actions.ts` `getEditorState` (~line 410–435): the remote-fetch
`catch` falls back to `defaultMarkdownTemplate(path)` with
`baseSha: cached?.sha ?? null`. Any transient failure (GitHub down, rate
limit, expired token) while opening an **existing** file shows the user
"Start writing here." instead of the real content — indistinguishable from a
new file. If they save and publish: `assertNoPublishConflict` compares
`remote.sha === draft.baseSha`, the cached sha still matches (the remote file
didn't change), so the publish **succeeds and overwrites the real file** with
template-derived content. The editor page (`editor/[...filePath]/page.tsx`)
compounds it by `.catch(() => null)` → `notFound()`, masking the distinction
further.

**Fix:** only fall back to the template when the provider *definitively*
reports the file does not exist (404-mapped message); every other error
renders an explicit "couldn't load remote content — retry" state and must
never produce a publishable draft. Distinguish "new file" from "load failed"
in `EditorState.status`. Add a regression test (mock provider throwing
rate-limit vs not-found).

### P1 — high

1. **Dead parallel implementation tree, and the tests test the dead copy.**
   `lib/providers/github.ts` and `lib/ssg/astro.ts` are the PLW-001
   placeholder implementations, superseded by the live
   `app/_lib/git-providers.ts` / `app/_lib/ssg-adapters.ts` (nothing under
   `app/` imports from `lib/`). But `lib/__tests__/github-provider.test.ts`
   and `astro-adapter.test.ts` still import the **dead copies** — 2 of the 4
   green test files prove nothing about shipped code, while the live provider
   and adapter have **zero coverage**. (`lib/project-rules.ts` was correctly
   shimmed to re-export the live module; the other two were not.)
   **Fix:** delete `lib/providers/` + `lib/ssg/` (or shim like project-rules),
   port both test files to target `app/_lib/git-providers.ts` /
   `app/_lib/ssg-adapters.ts`, and update `vitest.config.ts` includes. Check
   `SPEC.md`'s directory-structure section and amend it if it still mandates
   `lib/` (the runtime-mount constraint documented in `app/_db/schema.ts` is
   the reason the code moved).

2. **Disconnect fails hard if the vault entry is already gone.**
   `disconnectGitHubCredential` calls `sdk.secrets.delete(existing.secretRef)`
   with no try/catch — if the secret was revoked/deleted out-of-band (admin
   vault cleanup), disconnect throws and the user can *never* disconnect.
   `hardDeleteProject` already wraps the same call in try/catch; mirror that.

3. **Orphaned vault secrets on reconnect.** `connectGitHubPat` reuses the
   existing secret only when `status === 'connected'`; reconnecting from
   `needs_reauth` (the common recovery path) creates a **new** vault entry and
   abandons the old one — vault grows unbounded with dead credentials.
   **Fix:** also reuse/update when a valid non-revoked `secretRef` exists
   regardless of status, or delete the old entry before creating the new one.

### P2 — moderate (security posture / correctness)

1. **No path-scope enforcement for edits and publishes.** The editor
   catch-all accepts any repo path (`filePath.join('/')`), and
   `upsertDraft`/`publishCommittedDraft` never validate the path against the
   project's `pathPrefix` or an extension allowlist — an editor-role member
   can create and publish e.g. `.github/workflows/x.yml` through Plainwrite.
   Not privilege escalation (the publish uses their own PAT), but it defeats
   the product's own scoping model and the audit trail's intent. Note the
   asymmetry: `listContentFiles` only ever *lists* `pathPrefix`-scoped
   `.md/.mdx` (via the Astro adapter), so out-of-scope edits are invisible in
   the UI afterwards. **Fix:** validate in `getEditorState`, `upsertDraft`,
   and `publishCommittedDraft`: path must be within `pathPrefix/`, no `..`
   segments, extension in the adapter's allowlist. This is PLW-017 territory —
   pull this slice forward.

2. ~~**Manifest over-declaration.**~~ ✅ Fixed. `manifest.json` declared
   `notifications:send`, `data:provide/export/import`, `activity:write`, and
   three `data.provides` contracts with zero implementation (PLW-010 territory).
   The OAuth `connections.providers` block was flagged too at review time, but
   PLW-009 has since landed and genuinely implements it — that part needed no
   change. Trimmed the still-unimplemented permissions/data contracts;
   `roadmap.md` PLW-010 now restores them in the same PR that implements the
   resolvers.

3. ~~**Member invite takes a raw user-ID string.**~~ ✅ Fixed. Resolves the
   invited ID via `sdk.directory.resolveUsers` before insert/update, rejecting
   unknown/inactive users instead of creating a phantom member row. A
   directory-picker UI (replacing the raw text `<input>` in the settings form)
   remains a longer-term follow-up, not done here.

4. ~~**No fetch timeout in the GitHub provider.**~~ ✅ Fixed (bundled into
   fix-plan item 1). `fetchGitHubJson` now uses `AbortSignal.timeout(10s)`,
   sends `X-GitHub-Api-Version: 2022-11-28`, and `getFileContent` gives a
   clear "exceeds the 1 MB API size limit" error for `encoding: "none"`
   responses instead of the generic base64 failure.

### P3 — conventions / UX / polish

1. ~~**tsconfig doesn't extend `@sovereignfs/tsconfig`**~~ ✅ Fixed. Now
   `"extends": "@sovereignfs/tsconfig/nextjs.json"` with local
   `baseUrl`/`paths`/`include`/`exclude`, matching `runtime/tsconfig.json`'s
   pattern. `nextjs.json`'s base adds stricter flags
   (`noUnusedLocals`/`noUnusedParameters`/`verbatimModuleSyntax`/
   `noUncheckedIndexedAccess`/`noImplicitOverride`) — typecheck passed clean
   with no fallout.
2. ~~**`package.json` ignores the pnpm catalog**~~ ✅ Fixed. `next`, `react`,
   `react-dom`, `@types/react`, `@types/react-dom`, `typescript` now use
   `"catalog:"`. (`@types/node` and `vitest` are not in the workspace catalog,
   so they keep literal ranges.)
3. ~~**Breakpoint zoo.**~~ ✅ Fixed. All primary sidebar/panel collapse
   breakpoints (previously 1040, 920, 700, 720×5 across six files)
   consolidated to 768px, matching `@sovereignfs/ui`'s `MOBILE_BREAKPOINT_PX`
   / `useIsMobile()` — each `@media` block now has a comment pointing at this.
   The two 560px breakpoints were left untouched: they're a distinct,
   smaller-tier "squeeze further on very narrow phones" threshold nested
   inside the already-collapsed layout, not part of the primary-collapse
   duplication the finding was about.
4. ~~**Raw HTML form controls throughout**~~ ✅ Fixed. `MarkdownEditor`,
   `NewProjectDialog`, the settings page, and the project page now use DS
   `Input`/`Select`/`Textarea`/`Button`/`Checkbox`/`FormField` exclusively
   (hidden `<input type="hidden">` fields are intentionally left raw — no
   visual/a11y surface to convert). Added `app/_components/FormCheckbox.tsx`:
   DS `Checkbox` is a controlled component, but this plugin's settings/project
   pages are server components submitting via native
   `<form action={serverAction}>` — `FormCheckbox` bridges the two with local
   state seeded from `defaultChecked`, matching the platform's
   `plugins/console/app/users/invite/invite-form.tsx` `FormField` usage
   pattern. Removed now-dead per-plugin CSS that hand-rolled input/select/
   button styling the DS components already own.
   **Not visually verified** — this environment has no way to reach an
   authenticated session (auth flow needs a running instance + seeded user)
   and port 3000 was held by an unrelated Docker service, so this could not
   be checked in a browser. Verified instead via: `pnpm typecheck`/`lint`/
   `test` all green, `grep` confirms zero remaining raw `<input>`/`<select>`/
   `<textarea>`/`<button>` outside the two intentional hidden inputs, and the
   `FormField` render-prop usage is a structural copy of the already-shipped
   `invite-form.tsx` pattern. **Please visually QA this page** (in particular
   the settings page's 3-column schema-field grid and the project page's
   `.newFileForm` grid) before relying on it.
5. ~~**`NewProjectDialog` can't be dismissed.**~~ ✅ Fixed. Tracks form dirtiness
   via an `onChange` handler on the form; `handleDismissRequest` (Esc,
   scrim-click, and now Cancel too) closes immediately when nothing's been
   entered, and shows a confirm prompt instead of silently swallowing the
   dismissal when it has.
6. ~~**Editor has no unsaved-changes protection.**~~ Partially fixed. Added
   dirty tracking (comparing current frontmatter/body against the
   as-loaded values) and a `beforeunload` guard, covering tab close/refresh/
   typed-URL navigation. In-app `<Link>` navigation (sidebar, "Project
   dashboard") is **not** guarded — `beforeunload` doesn't fire for Next.js
   client-side navigation, and doing this properly needs either a router-level
   guard or the platform's ConfirmDialog (DS Phase B, not shipped). Debounced
   autosave-as-draft remains open, folded into PLW-006 per the original note.
7. ~~**`window.confirm` for discard-draft**~~ ✅ Fixed. Replaced with a shared
   `app/_components/ConfirmDialog.tsx`, matching the native `<dialog>` pattern
   already used in `plugins/account`/`plugins/console` (kept plugin-local —
   this is within-Plainwrite reuse between `MarkdownEditor` and
   `NewProjectDialog`, not a new DS capability). Swap for the DS
   `ConfirmDialog` when Phase B ships.
8. **Mobile is a squeeze, not a design.** `layout.module.css` collapses the
   project sidebar above the content at ≤720px; the editor stacks three dense
   panels. Fine for v0.1 scaffolding, but flag: when the DS Phase B surfaces
   (Sheet, OverlayHeader, adaptive Menu) land, Plainwrite should adopt the
   same mobile taxonomy as tasks rather than inventing its own. DS-first —
   don't build plugin-local overlays here.
9. **`refreshProjectContentCache` is delete-then-insert without a
   transaction** — two concurrent syncs can race into unique-index errors, and
   a crash between the statements empties the cache until the next TTL sync.
   Low impact (self-healing), but wrap in a transaction when the SDK client
   exposes one, or tolerate conflict errors explicitly.
10. **Silent catches worth softening:** `getProject`'s directory lookup and
    `listContentFiles`' auto-refresh both swallow all errors (the latter has a
    comment). Acceptable, but attach a `lastError`-style surface (the
    credential row already has one) so failures are visible somewhere.

---

## Fix plan (suggested order; items 1–4 landed as direct commits to `main` per developer instruction, not branch/PR)

| # | Branch | Contents | Bump | Status |
| - | ------ | -------- | ---- | ------ |
| 1 | `fix/editor-remote-load-fallback` | P0 + P2-4 (timeout makes transient failures rarer; the P0 fix makes them safe). Regression tests for not-found vs transient-error. Commit the pending working-tree lint fixes here too (with the `?? 1` correction). | patch | ✅ done |
| 2 | `chore/remove-dead-lib-tree` | P1-1: delete/shim dead `lib/` code, port the two test files to the live modules, update `vitest.config.ts`, amend SPEC directory section. No behaviour change. | none | ✅ done |
| 3 | `fix/credential-lifecycle` | P1-2 + P1-3 + the pending PLW-004 credential tests (roadmap already owes them). | patch | ✅ done |
| 4 | `fix/path-scope-enforcement` | P2-1: pathPrefix + extension + `..` validation across editor state, drafts, publish. Tests. (Pull-forward slice of PLW-017.) | patch | ✅ done |
| 5 | `chore/manifest-permission-trim` | P2-2: trim manifest to used permissions. OAuth provider block kept as-is — PLW-009 landed since the review, so it's no longer dead. Note in roadmap PLW-010. | none (manifest change — re-validate against platform schema) | ✅ done |
| 6 | `fix/invite-directory-validation` | P2-3: validate invitee via `sdk.directory`. | patch | ✅ done |
| 6a | `fix/publish-all-bookkeeping-and-conflict` | Two P1s from a follow-up review after PLW-008/009 merged (see below). | patch | ✅ done |
| 7 | `chore/platform-conventions` | P3-1 + P3-2 (tsconfig extends, catalog versions). Verify typecheck/build in the monorepo mount after. | none | ✅ done |
| 8 | `fix/editor-ux-guardrails` | P3-5 + P3-6 + P3-7 (dialog dismissal, dirty tracking + beforeunload, confirm pattern). | patch | ✅ done (in-app nav guard for P3-6 deferred — see finding 6) |
| 9 | `chore/breakpoint-and-ds-controls` | P3-3 + P3-4: one breakpoint, DS form controls. Coordinate with DS Phase B (ConfirmDialog/Sheet) — don't hand-roll what B is about to ship. | none/patch | ✅ done — not visually verified, see note below |

Items P3-8/9/10 ride along where they fit or wait for DS Phase B / PLW-017.

**Item 6a detail — two P1s surfaced in a follow-up review after PLW-008/009
merged:**

- **Publish-all partial-failure drift.** After `provider.publishFiles`
  successfully commits to GitHub, the per-draft local bookkeeping
  (`plainwrite_drafts` → `published`, file cache upsert) ran inside a single
  `Promise.all` under the same `try`. If one draft's DB update failed, the
  whole `Promise.all` rejected, and the `catch` block recorded a *failed*
  publish event and rethrew — even though GitHub already had the commit.
  The user was told to retry, which would have created a second, conflicting
  commit for content already published. **Fix:** the GitHub call and the
  local bookkeeping are now in separate try blocks; bookkeeping runs as a
  sequential loop with a per-draft try/catch, and the publish event is always
  recorded as `success` once the GitHub commit lands, with a
  `partial_bookkeeping_failure` error code/summary listing any files whose
  local status update failed (rather than a silent or misleading failure).
- **TOCTOU window in the pre-publish conflict check** (previously described
  as "no protection" — on closer look, GitHub does provide a coarse-grained
  guarantee here). The per-file SHA pre-check in `assertNoPublishConflict`
  only narrows the race window; GitHub's tree API has no per-blob
  compare-and-swap. The actual atomicity guarantee is the final ref-update
  PATCH's `force: false`, which rejects *any* intervening commit on the
  branch as a non-fast-forward update — it just wasn't being classified as a
  conflict. Publish-all failures from that specific PATCH call were falling
  through to the generic per-status-code GitHub error text (a 422 read as
  "protected branch"), misleading users about what actually happened.
  **Fix:** that PATCH call's 422/409 failures are now re-thrown as an
  explicit conflict message ("the branch changed since this publish
  started"), which `classifyPublishFailure` correctly tags `conflict`. Also
  documented the actual (whole-ref, not per-file) atomicity guarantee in
  code comments so a future reader doesn't need to rediscover it.

## Verification per task

- `pnpm typecheck` + `pnpm test` in the plugin, plus monorepo `pnpm lint`
  (SDK boundary) and `pnpm format:check` from the platform root — run and
  green for every item above.
- Task 1: not manually verified end-to-end (opening a file with the provider
  mocked to fail transiently) — no live GitHub credentials in the working
  environment. Covered instead by `app/_lib/__tests__/git-providers.test.ts`'s
  404-vs-other-status classification tests, which is what the fix's branching
  logic depends on.
- Task 5: re-validated `manifest.json` against `packages/manifest`'s
  `validateManifest()` directly (see PR #181 in `sovereignfs/sovereign`) —
  passes once that PR is merged; the schema bug it fixes predates this task.
- Item 9 (DS form controls / breakpoints): **not visually verified** — see the
  note under finding 4. Recommend a manual pass before the next release.
