import Link from 'next/link';
import { Badge, EmptyState, PageHeader, StatusBadge } from '@sovereignfs/ui';
import { NewProjectDialog } from './_components/NewProjectDialog';
import { listProjects } from './_lib/actions';
import { formatProjectRole } from './_lib/copy';
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
        title="Your sites"
        description="Write and publish content for your sites."
        action={
          <div className={styles.headerActions}>
            <Badge variant="status" status="neutral">
              GitHub + Astro
            </Badge>
            <NewProjectDialog />
          </div>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon="pencil"
          heading="Connect your first site"
          description="Plainwrite turns your website's content into a simple writing space. Connect a site to start writing and publishing."
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
              <StatusBadge status="unmodified">{formatProjectRole(project.currentUserRole)}</StatusBadge>
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
