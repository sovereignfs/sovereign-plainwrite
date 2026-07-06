import Link from 'next/link';
import { Badge, EmptyState, PageHeader, StatusBadge } from '@sovereignfs/ui';
import { createProject, listProjects } from './_lib/actions';
import styles from './page.module.css';

export default async function ProjectsPage() {
  const [projects, allProjects] = await Promise.all([
    listProjects(),
    listProjects({ includeArchived: true }),
  ]);
  const archivedProjects = allProjects.filter((project) => project.archivedAt !== null);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Projects"
        description="Connect static site repositories and manage Markdown content."
        action={
          <Badge variant="status" status="neutral">
            GitHub + Astro
          </Badge>
        }
      />

      <section className={styles.panel} aria-labelledby="create-project">
        <h2 id="create-project">New project</h2>
        <form action={createProject} className={styles.form}>
          <label>
            <span>Name</span>
            <input name="name" required placeholder="Company blog" />
          </label>
          <label>
            <span>Repository URL</span>
            <input
              name="repositoryUrl"
              required
              placeholder="https://github.com/acme/site or git@github.com:acme/site.git"
            />
          </label>
          <label>
            <span>Description</span>
            <textarea name="description" rows={2} />
          </label>
          <div className={styles.grid}>
            <label>
              <span>Branch</span>
              <input name="branch" defaultValue="main" />
            </label>
            <label>
              <span>Path prefix</span>
              <input name="pathPrefix" defaultValue="src/content" />
            </label>
            <label>
              <span>SSG</span>
              <select name="ssgType" defaultValue="astro">
                <option value="astro">Astro</option>
              </select>
            </label>
            <label>
              <span>Metadata</span>
              <select name="metadataVisibility" defaultValue="">
                <option value="">Default by repository privacy</option>
                <option value="members_with_credentials">Members with credentials</option>
                <option value="all_members">All members</option>
              </select>
            </label>
          </div>
          <label className={styles.checkbox}>
            <input name="isPrivate" type="checkbox" />
            <span>Private repository</span>
          </label>
          <button type="submit">Create project</button>
        </form>
      </section>

      {projects.length === 0 ? (
        <EmptyState
          icon="pencil"
          heading="No active projects"
          description="Create a project to connect a GitHub repository and start managing static site content."
        />
      ) : (
        <section className={styles.projectList} aria-label="Active projects">
          {projects.map((project) => (
            <Link key={project.id} href={`/plainwrite/${project.id}`} className={styles.project}>
              <div>
                <h2>{project.name}</h2>
                <p>
                  {project.repoOwner}/{project.repoName} · {project.branch} · {project.pathPrefix}
                </p>
              </div>
              <StatusBadge status="unmodified">{project.currentUserRole}</StatusBadge>
            </Link>
          ))}
        </section>
      )}

      {archivedProjects.length > 0 ? (
        <section className={styles.projectList} aria-label="Archived projects">
          <h2>Archived</h2>
          {archivedProjects.map((project) => (
            <Link key={project.id} href={`/plainwrite/${project.id}/settings`} className={styles.project}>
              <div>
                <h3>{project.name}</h3>
                <p>
                  {project.repoOwner}/{project.repoName}
                </p>
              </div>
              <StatusBadge status="conflict">Archived</StatusBadge>
            </Link>
          ))}
        </section>
      ) : null}
    </div>
  );
}
