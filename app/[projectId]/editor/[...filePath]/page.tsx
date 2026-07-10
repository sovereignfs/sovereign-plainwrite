import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader } from '@sovereignfs/ui';
import { MarkdownEditor } from '../../../_components/MarkdownEditor';
import {
  commitDraft,
  discardDraft,
  getEditorState,
  publishCommittedDraft,
  saveDraft,
} from '../../../_lib/actions';
import { canEditProject } from '../../../_lib/project-rules';
import styles from './page.module.css';

interface EditorPageProps {
  params: Promise<{ projectId: string; filePath: string[] }>;
}

export default async function EditorPage({ params }: EditorPageProps) {
  const { projectId, filePath } = await params;
  const path = filePath.join('/');
  // Project-not-found / access-denied still 404; a remote load failure is
  // surfaced explicitly via editor.loadError instead of being swallowed here,
  // so it never gets mistaken for "this is a new file".
  const editor = await getEditorState(projectId, path).catch(() => null);
  if (!editor) notFound();
  const userCanEdit = canEditProject(editor.currentUserRole);
  const repositoryLabel = `${editor.project.repoOwner}/${editor.project.repoName}`;

  return (
    <div className={styles.page}>
      <PageHeader
        title={path}
        description={`${editor.project.name} · ${repositoryLabel} · ${editor.project.branch}`}
      />

      {editor.loadError ? (
        <section className={styles.toolbar} role="alert">
          <div>
            <p className={styles.eyebrow}>Couldn&apos;t load this file</p>
            <p>{editor.loadError}</p>
          </div>
          <div className={styles.toolbarActions}>
            <Link href={`/plainwrite/${projectId}/editor/${path}`}>Retry</Link>
            <Link href={`/plainwrite/${projectId}`}>Project dashboard</Link>
          </div>
        </section>
      ) : (
        <>
          <section className={styles.toolbar} aria-label="Editor actions">
            <div>
              <p className={styles.eyebrow}>Base revision</p>
              <p>{editor.baseSha ?? 'New file'}</p>
            </div>
            <div className={styles.toolbarActions}>
              <Link href={`/plainwrite/${projectId}`}>Project dashboard</Link>
            </div>
          </section>

          <MarkdownEditor
            path={path}
            content={editor.content}
            baseSha={editor.baseSha}
            status={editor.status}
            commitMessage={editor.commitMessage}
            userCanEdit={userCanEdit}
            schemaFields={editor.schemaFields}
            saveAction={saveDraft.bind(null, projectId, path)}
            commitAction={commitDraft.bind(null, projectId, path)}
            publishAction={publishCommittedDraft.bind(null, projectId, path)}
            discardAction={discardDraft.bind(null, projectId, path)}
          />
        </>
      )}
    </div>
  );
}
