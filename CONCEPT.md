# Concept — Plainwrite

## One sentence

A clean, self-hosted alternative to Netlify CMS / Decap CMS for editing
Markdown content in git-backed static sites — not a headless CMS.

## Design principles

**Git stays the source of truth.** Plainwrite does not replace the repository,
run a separate content database, or hide publishing behind a proprietary sync
layer. Drafts live in Sovereign until the user publishes; published content lands
back in the site's git repository with normal commits.

**Simple authoring for non-technical users.** The editor should make common
content updates feel direct: choose a project, open a Markdown file, edit
frontmatter and body, save, commit, and publish. Git concepts are translated into
plain workflow states without removing the safety checks that make git useful.

**Privacy and credentials are platform concerns.** Plainwrite stores runtime
credentials through `sdk.secrets` and connection metadata through
`sdk.connections`. It never stores plaintext tokens in plugin tables, exports, or
client payloads. Private repository metadata is visible only according to project
membership and explicit owner-controlled settings.

**Adapters earn extensibility.** v0.1 proves the model with GitHub and Astro.
Provider and SSG adapters exist so GitLab, Gitea/Forgejo, Jekyll, Hugo,
Eleventy, and custom static site layouts can be added without rewriting editor,
draft, or publish logic.

**Direct publish first; protected workflows later.** Plainwrite publishes
directly to the configured branch in v0.1. If branch protection, missing scopes,
or provider rules block the push, the plugin preserves the draft and records a
clear failed publish event. Pull-request and merge-request publishing are later
milestones.

## What it is not

- A general-purpose headless CMS
- A visual website builder
- A replacement for git hosting
- A git client for developers
- A branch protection bypass
- A collaborative document editor in v0.1
- A multi-repository publishing orchestrator in v0.1

Plainwrite expands deliberately: first GitHub + Astro, then richer editing and
more static site generators, then collaboration and protected-branch workflows.

## Workflow

Plainwrite is built around one authoring lifecycle:

| Step | State | Meaning |
| ---- | ----- | ------- |
| Sync | `remote` | Fetch file metadata and current blob identifiers from the git provider. |
| Edit | `draft` | Save local changes in Sovereign only; no provider write happens. |
| Commit | `committed` | Mark a draft ready to publish with a commit message. |
| Publish | `published` | Write one file or a batch of committed files back to the repository. |
| Audit | `publish_event` | Record success or failure without storing credentials or raw provider errors. |

The same lifecycle applies whether the file is edited through raw Markdown,
structured frontmatter fields, or a later rich text mode.

## Access model

Platform admins control whether the Plainwrite app is available to everyone,
admins, selected users, selected groups, or nobody. Inside Plainwrite, access is
project-scoped:

| Role | Scope |
| ---- | ----- |
| `owner` | Manage project settings, members, schemas, and all file actions. |
| `editor` | Create, edit, commit, and publish files. |
| `viewer` | Read visible project metadata and file listings. |

Each user connects their own git provider credential per project. That credential
determines what repository content they can read and whose identity appears on
provider commits.

## Relation to the Sovereign SDK

Plainwrite is intended to be the reference implementation for Sovereign plugins
that integrate with third-party APIs and runtime user credentials. It uses only
platform-supported plugin contracts:

- `@sovereignfs/sdk` for auth, database, env, secrets, connections, data,
  notifications, activity, portability, and future tool contracts.
- `@sovereignfs/ui` for interface primitives and design tokens.
- Manifest-declared `data.provides` for project, content index, and draft
  metadata contracts.
- Manifest-declared `connections.providers` for GitHub OAuth configuration.

It must not import platform internals. If Plainwrite needs a capability that the
SDK cannot provide, that gap should become a platform task instead of a plugin
shortcut.
