# Plainwrite

Plainwrite is a Sovereign plugin for editing Markdown content in git-backed
static sites. The current scaffold covers PLW-001: manifest, route shell,
package metadata, icon, and stable placeholder locations for the provider, SSG,
database, and editor work planned in `roadmap.md`.

## Local development

To test this standalone checkout against the platform, clone or copy it into a
platform workspace as a local plugin checkout:

```bash
plugins/sovereign-plainwrite.local
```

Then run the platform generate/dev workflow from the platform repository:

```bash
pnpm generate
pnpm dev
```

The app is served at `/plainwrite` once composed by the platform.

## Current scope

Implemented now:

- Sovereign manifest with data contracts, external GitHub provider declaration,
  portability permissions, and `0.18.2` platform compatibility.
- Placeholder project overview, project files, settings, editor, and GitHub
  OAuth callback routes.
- Typed provider and SSG adapter interfaces with Astro/GitHub placeholder
  modules.

Not implemented yet:

- Database migrations and full table schema.
- Project CRUD and membership.
- GitHub PAT/OAuth credential flows.
- Repository sync, Markdown editing, publishing, data contracts, portability,
  notifications, and activity events.
