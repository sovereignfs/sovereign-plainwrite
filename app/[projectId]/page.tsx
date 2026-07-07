import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, PageHeader, StatusBadge } from '@sovereignfs/ui';
import {
  createContentFile,
  getProject,
  listContentFiles,
  listPublishEvents,
  syncProjectContent,
} from '../_lib/actions';
import { groupContentFiles } from '../_lib/content-rules';
import { canEditProject, canManageProject } from '../_lib/project-rules';
import styles from './page.module.css';

interface ProjectPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;
  const [project, contentFiles, publishEvents] = await Promise.all([
    getProject(projectId).catch(() => null),
    listContentFiles(projectId).catch(() => []),
    listPublishEvents(projectId).catch(() => []),
  ]);
  if (!project) notFound();
  const userCanEdit = canEditProject(project.currentUserRole);
  const userCanManage = canManageProject(project.currentUserRole);
  const metadataLabel = formatMetadataVisibility(project.metadataVisibility);
  const repositoryLabel = `${project.repoOwner}/${project.repoName}`;
  const contentGroups = groupContentFiles(contentFiles);

  return (
    <div className={styles.page}>
      <PageHeader
        title={project.name}
        description={`${repositoryLabel} · ${project.branch} · ${project.pathPrefix}`}
        action={
          <StatusBadge status={project.archivedAt ? 'conflict' : 'unmodified'}>
            {project.currentUserRole}
          </StatusBadge>
        }
      />

      <section className={styles.heroGrid} aria-label="Project dashboard">
        <Card className={styles.primaryCard} padding="lg">
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Repository</p>
              <h2>{repositoryLabel}</h2>
            </div>
            <StatusBadge status={project.archivedAt ? 'conflict' : 'unmodified'}>
              {project.archivedAt ? 'Archived' : 'Active'}
            </StatusBadge>
          </div>
          <dl className={styles.details}>
            <div>
              <dt>Branch</dt>
              <dd>{project.branch}</dd>
            </div>
            <div>
              <dt>Content folder</dt>
              <dd>{project.pathPrefix}</dd>
            </div>
            <div>
              <dt>Static site generator</dt>
              <dd>{project.ssgType}</dd>
            </div>
            <div>
              <dt>Repository visibility</dt>
              <dd>{project.isPrivate ? 'Private' : 'Public'}</dd>
            </div>
            <div>
              <dt>Metadata visibility</dt>
              <dd>{metadataLabel}</dd>
            </div>
            <div>
              <dt>Members</dt>
              <dd>{project.members.length}</dd>
            </div>
          </dl>
        </Card>

        <Card className={styles.statusCard} padding="lg">
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Setup</p>
              <h2>Ready for content sync</h2>
            </div>
            <StatusBadge status="warning">Pending</StatusBadge>
          </div>
          <ol className={styles.checklist}>
            <li>
              <span className={styles.doneDot} aria-hidden="true" />
              Project and membership created
            </li>
            <li>
              <span className={contentFiles.length > 0 ? styles.doneDot : styles.pendingDot} aria-hidden="true" />
              {contentFiles.length > 0 ? `${contentFiles.length} content files cached` : 'Content files not synced yet'}
            </li>
            <li>
              <span className={styles.pendingDot} aria-hidden="true" />
              Git credentials not connected yet for private repositories
            </li>
          </ol>
        </Card>
      </section>

      <section className={styles.actionsPanel} aria-label="Project actions">
        <div>
          <h2>Next actions</h2>
          <p>Sync repository content, create a local draft, or manage project access.</p>
        </div>
        <div className={styles.actions}>
          {userCanEdit ? (
            <form action={syncProjectContent.bind(null, projectId)}>
              <button type="submit">Sync content</button>
            </form>
          ) : null}
          <Link href={`/plainwrite/${projectId}/settings`}>
            {userCanManage ? 'Manage project' : 'View settings'}
          </Link>
        </div>
      </section>

      {userCanEdit ? (
        <section className={styles.newFilePanel} aria-labelledby="new-file">
          <div>
            <h2 id="new-file">New content file</h2>
            <p>
              Create a local draft under <strong>{project.pathPrefix}</strong>. Saving stores it in
              Plainwrite until publishing is connected.
            </p>
          </div>
          <form className={styles.newFileForm} action={createContentFile.bind(null, projectId)}>
            <label>
              Collection
              <input name="collection" placeholder="blog" />
            </label>
            <label>
              Filename
              <input name="filename" placeholder="hello-world.md" required />
            </label>
            <button type="submit">Create file</button>
          </form>
        </section>
      ) : null}

      <section className={styles.contentPanel} aria-labelledby="content-files">
        <div className={styles.cardHeader}>
          <div>
            <h2 id="content-files">Content files</h2>
            <p>
              Markdown and MDX files under <strong>{project.pathPrefix}</strong>.
            </p>
          </div>
          <StatusBadge status={contentFiles.length > 0 ? 'synced' : 'warning'}>
            {contentFiles.length > 0 ? `${contentFiles.length} files` : 'Not synced'}
          </StatusBadge>
        </div>
        {contentGroups.length > 0 ? (
          <div className={styles.collections}>
            {contentGroups.map((group) => (
              <section key={group.collection} className={styles.collection}>
                <h3>{group.collection}</h3>
                <div className={styles.fileList}>
                  {group.files.map((file) => (
                    <Link
                      key={file.path}
                      href={`/plainwrite/${projectId}/editor/${file.path}`}
                      className={styles.fileRow}
                    >
                      <span>{file.filename}</span>
                      <StatusBadge status={file.status}>{formatFileStatus(file.status)}</StatusBadge>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <p className={styles.emptyText}>
            Run sync to fetch public GitHub repository content. Private repository sync needs the
            credential task next.
          </p>
        )}
      </section>

      <section className={styles.grid} aria-label="Project work areas">
        <DashboardCard
          title="Content"
          status={contentFiles.length > 0 ? `${contentFiles.length} files` : 'Pending sync'}
          description="Collections and Markdown files appear here after GitHub tree sync."
        />
        <DashboardCard
          title="Drafts"
          status="Not started"
          description="Local draft tracking is planned after repository content can be read."
        />
        <DashboardCard
          title="Publishing"
          status="Not connected"
          description="Publishing will commit validated changes back to the configured branch."
        />
        <DashboardCard
          title="Members"
          status={`${project.members.length} total`}
          description="Owners manage project access from settings."
          href={`/plainwrite/${projectId}/settings`}
        />
      </section>

      <section className={styles.contentPanel} aria-labelledby="publish-events">
        <div className={styles.cardHeader}>
          <div>
            <h2 id="publish-events">Publish events</h2>
            <p>Recent single-file publish attempts for this project.</p>
          </div>
          <StatusBadge status={publishEvents.length > 0 ? 'synced' : 'unmodified'}>
            {publishEvents.length > 0 ? `${publishEvents.length} recent` : 'No events'}
          </StatusBadge>
        </div>
        {publishEvents.length > 0 ? (
          <div className={styles.eventList}>
            {publishEvents.map((event) => (
              <article key={event.id} className={styles.eventRow}>
                <div>
                  <h3>{event.message}</h3>
                  <p>{event.files.join(', ') || 'No files recorded'}</p>
                  {event.errorSummary ? <p>{event.errorSummary}</p> : null}
                </div>
                <div className={styles.eventMeta}>
                  <StatusBadge status={event.status === 'success' ? 'synced' : 'error'}>
                    {event.status === 'success' ? 'Published' : event.errorCode || 'Failed'}
                  </StatusBadge>
                  <span>{formatEventDate(event.createdAt)}</span>
                  {event.commitSha ? <code>{event.commitSha.slice(0, 7)}</code> : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className={styles.emptyText}>Publish a committed draft to create the first audit event.</p>
        )}
      </section>
    </div>
  );
}

function DashboardCard({
  title,
  status,
  description,
  href,
}: {
  title: string;
  status: string;
  description: string;
  href?: string;
}) {
  const content = (
    <>
      <div className={styles.cardHeader}>
        <h2>{title}</h2>
        <StatusBadge status="draft">{status}</StatusBadge>
      </div>
      <p>{description}</p>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={styles.cardLink}>
        <Card interactive>{content}</Card>
      </Link>
    );
  }

  return <Card>{content}</Card>;
}

function formatMetadataVisibility(value: string) {
  if (value === 'members_with_credentials') return 'Members with credentials';
  if (value === 'all_members') return 'All project members';
  return value;
}

function formatFileStatus(status: string) {
  if (status === 'pending-delete') return 'Pending delete';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatEventDate(value: number) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value * 1000);
}
