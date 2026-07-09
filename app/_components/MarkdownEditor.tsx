'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, CodeTextarea, FormField, Input } from '@sovereignfs/ui';
import {
  parseMarkdownDocument,
  renderSafeMarkdownPreview,
  serializeMarkdownDocument,
} from '../_lib/editor-rules';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './MarkdownEditor.module.css';

interface MarkdownEditorProps {
  path: string;
  content: string;
  baseSha: string | null;
  status: string;
  commitMessage: string | null;
  userCanEdit: boolean;
  saveAction: (formData: FormData) => void | Promise<void>;
  commitAction: (formData: FormData) => void | Promise<void>;
  publishAction: (formData: FormData) => void | Promise<void>;
  discardAction: () => void | Promise<void>;
}

export function MarkdownEditor({
  path,
  content,
  baseSha,
  status,
  commitMessage,
  userCanEdit,
  saveAction,
  commitAction,
  publishAction,
  discardAction,
}: MarkdownEditorProps) {
  const parsed = useMemo(() => parseMarkdownDocument(content), [content]);
  const [frontmatterYaml, setFrontmatterYaml] = useState(parsed.frontmatterYaml);
  const [body, setBody] = useState(parsed.body);
  const [message, setMessage] = useState(commitMessage ?? `Update ${path.split('/').at(-1) ?? path}`);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const serializedContent = useMemo(
    () => serializeMarkdownDocument(frontmatterYaml, body),
    [frontmatterYaml, body],
  );
  const previewHtml = useMemo(() => renderSafeMarkdownPreview(serializedContent), [serializedContent]);
  const isDirty = frontmatterYaml !== parsed.frontmatterYaml || body !== parsed.body;

  // Draft state lives in useState with no autosave — closing the tab or
  // refreshing loses unsaved edits silently otherwise. beforeunload only
  // covers full-page navigation (tab close, refresh, typed URL); it does not
  // fire for Next.js client-side <Link> navigation (e.g. the sidebar or the
  // "Project dashboard" link), which needs the platform's ConfirmDialog
  // (DS Phase B, not shipped yet) to guard in-app route changes too.
  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  return (
    <div className={styles.shell}>
      <form id="plainwrite-editor-form" className={styles.editorForm} action={saveAction}>
        <input type="hidden" name="baseSha" value={baseSha ?? ''} />
        <input type="hidden" name="content" value={serializedContent} />

        <section className={styles.frontmatterPanel} aria-labelledby="frontmatter-heading">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Metadata</p>
              <h2 id="frontmatter-heading">Raw YAML</h2>
            </div>
            <span>{frontmatterYaml.trim() ? 'Frontmatter enabled' : 'No frontmatter'}</span>
          </div>
          <CodeTextarea
            aria-label="Raw YAML frontmatter"
            value={frontmatterYaml}
            onChange={(event) => setFrontmatterYaml(event.currentTarget.value)}
            rows={8}
            readOnly={!userCanEdit}
          />
        </section>

        <section className={styles.bodyPanel} aria-labelledby="body-heading">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Markdown</p>
              <h2 id="body-heading">Body</h2>
            </div>
            <span>{statusLabel(status)}</span>
          </div>
          <CodeTextarea
            aria-label="Markdown body"
            value={body}
            onChange={(event) => setBody(event.currentTarget.value)}
            rows={24}
            readOnly={!userCanEdit}
          />
        </section>
      </form>

      <aside className={styles.sidePanel} aria-label="Draft controls and preview">
        <section className={styles.commitPanel} aria-labelledby="commit-heading">
          <div>
            <p className={styles.eyebrow}>Current state</p>
            <h2 id="commit-heading">{statusLabel(status)}</h2>
            <p>Saved drafts stay local until a publishing task connects Git write-back.</p>
          </div>
          <FormField label="Commit message" id="commitMessage">
            {(field) => (
              <Input
                {...field}
                form="plainwrite-editor-form"
                name="commitMessage"
                value={message}
                onChange={(event) => setMessage(event.currentTarget.value)}
                disabled={!userCanEdit}
              />
            )}
          </FormField>
          {userCanEdit ? (
            <div className={styles.actions}>
              <Button type="submit" form="plainwrite-editor-form">
                Save draft
              </Button>
              <Button type="submit" form="plainwrite-editor-form" formAction={commitAction} variant="secondary">
                Mark ready
              </Button>
              <form action={publishAction}>
                <Button type="submit" variant="secondary" disabled={status !== 'committed'} className={styles.fullWidth}>
                  Publish
                </Button>
              </form>
            </div>
          ) : null}
        </section>

        {userCanEdit ? (
          <>
            <Button
              type="button"
              variant="secondary"
              className={styles.discardTrigger}
              disabled={status === 'unmodified'}
              onClick={() => setDiscardConfirmOpen(true)}
            >
              Discard draft
            </Button>
            <ConfirmDialog
              open={discardConfirmOpen}
              title="Discard draft"
              message="This removes your local draft and reloads the current remote content. This cannot be undone."
              confirmLabel="Discard draft"
              onCancel={() => setDiscardConfirmOpen(false)}
              onConfirm={() => {
                setDiscardConfirmOpen(false);
                void discardAction();
              }}
            />
          </>
        ) : null}

        <section className={styles.previewPanel} aria-labelledby="preview-heading">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Preview</p>
              <h2 id="preview-heading">Rendered Markdown</h2>
            </div>
          </div>
          <div
            className={styles.preview}
            dangerouslySetInnerHTML={{ __html: previewHtml || '<p>Nothing to preview yet.</p>' }}
          />
        </section>
      </aside>
    </div>
  );
}

function statusLabel(status: string) {
  if (status === 'unmodified') return 'Unmodified';
  if (status === 'committed') return 'Ready to commit';
  return 'Draft';
}
