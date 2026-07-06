import { notFound } from 'next/navigation';
import { Badge, PageHeader, StatusBadge } from '@sovereignfs/ui';
import {
  archiveProject,
  canManage,
  getProject,
  hardDeleteProject,
  inviteProjectMember,
  removeProjectMember,
  restoreProject,
  updateProjectSettings,
} from '../../_lib/actions';
import styles from './settings.module.css';

interface SettingsPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectSettingsPage({ params }: SettingsPageProps) {
  const { projectId } = await params;
  const project = await getProject(projectId).catch(() => null);
  if (!project) notFound();
  const userCanManage = canManage(project.currentUserRole);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Project settings"
        description={`Membership and repository settings for ${project.name}.`}
        action={
          <Badge variant="status" status={userCanManage ? 'active' : 'neutral'}>
            {project.currentUserRole}
          </Badge>
        }
      />

      <section className={styles.panel} aria-labelledby="repository-settings">
        <h2 id="repository-settings">Repository</h2>
        <form action={updateProjectSettings.bind(null, project.id)} className={styles.form}>
          <label>
            <span>Name</span>
            <input name="name" required defaultValue={project.name} disabled={!userCanManage} />
          </label>
          <label>
            <span>Description</span>
            <textarea
              name="description"
              rows={2}
              defaultValue={project.description ?? ''}
              disabled={!userCanManage}
            />
          </label>
          <div className={styles.grid}>
            <label>
              <span>Branch</span>
              <input name="branch" defaultValue={project.branch} disabled={!userCanManage} />
            </label>
            <label>
              <span>Path prefix</span>
              <input name="pathPrefix" defaultValue={project.pathPrefix} disabled={!userCanManage} />
            </label>
            <label>
              <span>SSG</span>
              <select name="ssgType" defaultValue={project.ssgType} disabled={!userCanManage}>
                <option value="astro">Astro</option>
              </select>
            </label>
            <label>
              <span>Metadata</span>
              <select
                name="metadataVisibility"
                defaultValue={project.metadataVisibility}
                disabled={!userCanManage}
              >
                <option value="members_with_credentials">Members with credentials</option>
                <option value="all_members">All members</option>
              </select>
            </label>
          </div>
          <label className={styles.checkbox}>
            <input
              name="isPrivate"
              type="checkbox"
              defaultChecked={project.isPrivate}
              disabled={!userCanManage}
            />
            <span>Private repository</span>
          </label>
          {userCanManage ? <button type="submit">Save settings</button> : null}
        </form>
      </section>

      <section className={styles.panel} aria-labelledby="members">
        <div className={styles.panelHeader}>
          <h2 id="members">Members</h2>
          <StatusBadge status="unmodified">{project.members.length} total</StatusBadge>
        </div>
        <div className={styles.members}>
          {project.members.map((member) => (
            <div key={member.userId} className={styles.member}>
              <div>
                <strong>{member.displayName ?? member.email ?? member.userId}</strong>
                <p>{member.email ?? member.userId}</p>
              </div>
              <StatusBadge status="unmodified">{member.role}</StatusBadge>
              {userCanManage ? (
                <form action={removeProjectMember.bind(null, project.id, member.userId)}>
                  <button type="submit">Remove</button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
        {userCanManage ? (
          <form action={inviteProjectMember.bind(null, project.id)} className={styles.inlineForm}>
            <label>
              <span>User ID</span>
              <input name="userId" required />
            </label>
            <label>
              <span>Role</span>
              <select name="role" defaultValue="viewer">
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="owner">Owner</option>
              </select>
            </label>
            <button type="submit">Add member</button>
          </form>
        ) : null}
      </section>

      {userCanManage ? (
        <section className={styles.panel} aria-labelledby="danger-zone">
          <h2 id="danger-zone">Project state</h2>
          <div className={styles.actions}>
            {project.archivedAt ? (
              <form action={restoreProject.bind(null, project.id)}>
                <button type="submit">Restore project</button>
              </form>
            ) : (
              <form action={archiveProject.bind(null, project.id)}>
                <button type="submit">Archive project</button>
              </form>
            )}
            <form action={hardDeleteProject.bind(null, project.id)} className={styles.deleteForm}>
              <label>
                <span>Type DELETE to permanently delete</span>
                <input name="confirm" />
              </label>
              <button type="submit">Delete permanently</button>
            </form>
          </div>
        </section>
      ) : null}
    </div>
  );
}
