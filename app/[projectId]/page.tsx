import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EmptyState, PageHeader, StatusBadge } from '@sovereignfs/ui';
import { getProject } from '../_lib/actions';
import { canEditProject } from '../../lib/project-rules';
import styles from './page.module.css';

interface ProjectPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;
  const project = await getProject(projectId).catch(() => null);
  if (!project) notFound();
  const userCanEdit = canEditProject(project.currentUserRole);

  return (
    <div className={styles.page}>
      <PageHeader
        title={project.name}
        description={`${project.repoOwner}/${project.repoName} · ${project.branch} · ${project.pathPrefix}`}
        action={
          <StatusBadge status={project.archivedAt ? 'conflict' : 'unmodified'}>
            {project.currentUserRole}
          </StatusBadge>
        }
      />
      <div className={styles.links}>
        <Link href={`/plainwrite/${projectId}/settings`}>Settings</Link>
        {userCanEdit ? (
          <Link href={`/plainwrite/${projectId}/editor/src/content/example.md`}>Editor</Link>
        ) : null}
      </div>
      <section className={styles.summary} aria-label="Project summary">
        <div>
          <span>Provider</span>
          <strong>{project.provider}</strong>
        </div>
        <div>
          <span>SSG</span>
          <strong>{project.ssgType}</strong>
        </div>
        <div>
          <span>Visibility</span>
          <strong>{project.isPrivate ? 'Private' : 'Public'}</strong>
        </div>
        <div>
          <span>Metadata</span>
          <strong>{project.metadataVisibility}</strong>
        </div>
      </section>
      <EmptyState
        icon="package"
        heading="File sync is not wired yet"
        description="GitHub and Astro file discovery are planned in PLW-005."
      />
    </div>
  );
}
