import { notFound } from 'next/navigation';
import { Badge, Button, FormField, Input, PageHeader, Select, StatusBadge, Textarea } from '@sovereignfs/ui';
import {
  archiveProject,
  connectGitHubPat,
  disconnectGitHubCredential,
  getGitHubOAuthStatus,
  getProject,
  hardDeleteProject,
  inviteProjectMember,
  listCollectionSchemas,
  removeProjectMember,
  resetCollectionSchema,
  restoreProject,
  startGitHubOAuth,
  updateCollectionSchema,
  updateProjectSettings,
} from '../../_lib/actions';
import { canEditProject, canManageProject } from '../../_lib/project-rules';
import { FormCheckbox } from '../../_components/FormCheckbox';
import { InviteMemberForm } from '../../_components/InviteMemberForm';
import styles from './settings.module.css';

interface SettingsPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectSettingsPage({ params }: SettingsPageProps) {
  const { projectId } = await params;
  const [project, schemas, oauthStatus] = await Promise.all([
    getProject(projectId).catch(() => null),
    listCollectionSchemas(projectId).catch(() => []),
    getGitHubOAuthStatus(projectId).catch(() => null),
  ]);
  if (!project) notFound();
  const userCanEdit = canEditProject(project.currentUserRole);
  const userCanManage = canManageProject(project.currentUserRole);

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
          <FormField label="Name">
            {(field) => (
              <Input
                {...field}
                name="name"
                required
                defaultValue={project.name}
                disabled={!userCanManage}
              />
            )}
          </FormField>
          <FormField label="Description">
            {(field) => (
              <Textarea
                {...field}
                name="description"
                rows={2}
                defaultValue={project.description ?? ''}
                disabled={!userCanManage}
              />
            )}
          </FormField>
          <div className={styles.grid}>
            <FormField label="Branch">
              {(field) => (
                <Input {...field} name="branch" defaultValue={project.branch} disabled={!userCanManage} />
              )}
            </FormField>
            <FormField label="Path prefix">
              {(field) => (
                <Input
                  {...field}
                  name="pathPrefix"
                  defaultValue={project.pathPrefix}
                  disabled={!userCanManage}
                />
              )}
            </FormField>
            <FormField label="SSG">
              {(field) => (
                <Select {...field} name="ssgType" defaultValue={project.ssgType} disabled={!userCanManage}>
                  <option value="astro">Astro</option>
                </Select>
              )}
            </FormField>
            <FormField label="Metadata">
              {(field) => (
                <Select
                  {...field}
                  name="metadataVisibility"
                  defaultValue={project.metadataVisibility}
                  disabled={!userCanManage}
                >
                  <option value="members_with_credentials">Members with credentials</option>
                  <option value="all_members">All members</option>
                </Select>
              )}
            </FormField>
          </div>
          <FormCheckbox
            name="isPrivate"
            defaultChecked={project.isPrivate}
            disabled={!userCanManage}
            label="Private repository"
          />
          {userCanManage ? <Button type="submit">Save settings</Button> : null}
        </form>
      </section>

      <section className={styles.panel} aria-labelledby="github-credential">
        <div className={styles.panelHeader}>
          <div>
            <h2 id="github-credential">GitHub credential</h2>
            <p className={styles.panelDescription}>
              Connect GitHub OAuth when configured, or use a personal access token fallback.
            </p>
          </div>
          <StatusBadge status={project.credential?.status === 'connected' ? 'synced' : 'warning'}>
            {project.credential?.status === 'connected' ? 'Connected' : 'Not connected'}
          </StatusBadge>
        </div>

        {project.credential ? (
          <dl className={styles.credentialDetails}>
            <div>
              <dt>Provider</dt>
              <dd>GitHub</dd>
            </div>
            <div>
              <dt>Account</dt>
              <dd>{project.credential.providerLogin ?? 'Unknown'}</dd>
            </div>
            <div>
              <dt>Auth type</dt>
              <dd>{project.credential.authType.toUpperCase()}</dd>
            </div>
            <div>
              <dt>Connection</dt>
              <dd>{project.credential.connectionId ? 'Platform-managed' : 'Plainwrite token'}</dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>{formatTimestamp(project.credential.updatedAt)}</dd>
            </div>
          </dl>
        ) : null}

        {project.credential?.lastError ? (
          <p className={styles.errorText}>{project.credential.lastError}</p>
        ) : null}

        {userCanEdit ? (
          <div className={styles.credentialForms}>
            {oauthStatus?.configured ? (
              <form action={startGitHubOAuth.bind(null, project.id)} className={styles.form}>
                <p className={styles.helpText}>
                  GitHub OAuth is configured for this instance. Authorization opens GitHub and
                  stores the returned token in the platform secret vault.
                </p>
                <Button type="submit">
                  {project.credential?.authType === 'oauth' ? 'Reconnect GitHub' : 'Connect GitHub'}
                </Button>
              </form>
            ) : (
              <p className={styles.helpText}>
                GitHub OAuth is not configured for this instance. PAT fallback remains available.
              </p>
            )}

            <form action={connectGitHubPat.bind(null, project.id)} className={styles.form}>
              <FormField label="Personal access token">
                {(field) => (
                  <Input
                    {...field}
                    name="token"
                    type="password"
                    required
                    autoComplete="off"
                    placeholder="github_pat_..."
                  />
                )}
              </FormField>
              <p className={styles.helpText}>
                Use a fine-grained token with contents read/write access for
                {` ${project.repoOwner}/${project.repoName}`}. The token is stored in the platform
                secret vault and is never saved in Plainwrite tables.
              </p>
              <Button type="submit">
                {project.credential?.status === 'connected' ? 'Reconnect token' : 'Connect token'}
              </Button>
            </form>

            {project.credential?.status === 'connected' ? (
              <form action={disconnectGitHubCredential.bind(null, project.id)}>
                <Button type="submit" variant="secondary">
                  Disconnect
                </Button>
              </form>
            ) : null}
          </div>
        ) : (
          <p className={styles.helpText}>Viewers cannot connect publishing credentials.</p>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="collection-schemas">
        <div className={styles.panelHeader}>
          <div>
            <h2 id="collection-schemas">Collection schemas</h2>
            <p className={styles.panelDescription}>
              Inferred frontmatter fields stay editable by project owners.
            </p>
          </div>
          <StatusBadge status={schemas.length > 0 ? 'synced' : 'warning'}>
            {schemas.length > 0 ? `${schemas.length} collections` : 'Not inferred'}
          </StatusBadge>
        </div>

        {schemas.length > 0 ? (
          <div className={styles.schemaList}>
            {schemas.map((schema) => (
              <form
                key={schema.collection}
                action={updateCollectionSchema.bind(null, project.id, schema.collection)}
                className={styles.schemaCard}
              >
                <div className={styles.panelHeader}>
                  <div>
                    <h3>{schema.collection}</h3>
                    <p className={styles.panelDescription}>
                      {schema.isManual ? 'Manual schema' : 'Inferred schema'}
                    </p>
                  </div>
                  {userCanManage ? (
                    <Button
                      type="submit"
                      formAction={resetCollectionSchema.bind(null, project.id, schema.collection)}
                      variant="secondary"
                    >
                      Reset
                    </Button>
                  ) : null}
                </div>
                <div className={styles.schemaFields}>
                  {[...schema.fields, { name: '', type: 'string' as const, required: false }].map(
                    (field, index) => (
                      <div key={`${schema.collection}-${index}`} className={styles.schemaField}>
                        <FormField label="Name">
                          {(fieldProps) => (
                            <Input
                              {...fieldProps}
                              name="fieldName"
                              defaultValue={field.name}
                              disabled={!userCanManage}
                            />
                          )}
                        </FormField>
                        <FormField label="Type">
                          {(fieldProps) => (
                            <Select
                              {...fieldProps}
                              name="fieldType"
                              defaultValue={field.type}
                              disabled={!userCanManage}
                            >
                              <option value="string">Text</option>
                              <option value="date">Date</option>
                              <option value="number">Number</option>
                              <option value="boolean">Toggle</option>
                              <option value="array">Tags</option>
                            </Select>
                          )}
                        </FormField>
                        <FormCheckbox
                          name="fieldRequired"
                          value={String(index)}
                          defaultChecked={field.required}
                          disabled={!userCanManage}
                          label="Required"
                        />
                      </div>
                    ),
                  )}
                </div>
                {userCanManage ? <Button type="submit">Save schema</Button> : null}
              </form>
            ))}
          </div>
        ) : (
          <p className={styles.helpText}>Run content sync to infer schemas from existing files.</p>
        )}
      </section>

      <section className={styles.panel} aria-labelledby="members">
        <div className={styles.panelHeader}>
          <h2 id="members">Members</h2>
          <StatusBadge status="unmodified">{project.members.length} total</StatusBadge>
        </div>
        {project.directoryLookupFailed ? (
          <p className={styles.errorText}>
            Could not load member display names and emails from the platform directory. Showing
            user IDs only.
          </p>
        ) : null}
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
                  <Button type="submit">Remove</Button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
        {userCanManage ? (
          <InviteMemberForm projectId={project.id} action={inviteProjectMember.bind(null, project.id)} />
        ) : null}
      </section>

      {userCanManage ? (
        <section className={styles.panel} aria-labelledby="danger-zone">
          <h2 id="danger-zone">Project state</h2>
          <div className={styles.actions}>
            {project.archivedAt ? (
              <form action={restoreProject.bind(null, project.id)}>
                <Button type="submit">Restore project</Button>
              </form>
            ) : (
              <form action={archiveProject.bind(null, project.id)}>
                <Button type="submit">Archive project</Button>
              </form>
            )}
            <form action={hardDeleteProject.bind(null, project.id)} className={styles.deleteForm}>
              <FormField label="Type DELETE to permanently delete">
                {(field) => <Input {...field} name="confirm" />}
              </FormField>
              <Button type="submit">Delete permanently</Button>
            </form>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function formatTimestamp(value: number) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value * 1000));
}
