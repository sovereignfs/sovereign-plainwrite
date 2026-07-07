'use client';

import { useMemo, useState } from 'react';
import { CodeTextarea } from '@sovereignfs/ui';
import {
  parseMarkdownDocument,
  renderSafeMarkdownPreview,
  serializeMarkdownDocument,
} from '../_lib/editor-rules';
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
  const serializedContent = useMemo(
    () => serializeMarkdownDocument(frontmatterYaml, body),
    [frontmatterYaml, body],
  );
  const previewHtml = useMemo(() => renderSafeMarkdownPreview(serializedContent), [serializedContent]);

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
          <label htmlFor="commitMessage">Commit message</label>
          <input
            id="commitMessage"
            form="plainwrite-editor-form"
            name="commitMessage"
            value={message}
            onChange={(event) => setMessage(event.currentTarget.value)}
            disabled={!userCanEdit}
          />
          {userCanEdit ? (
            <div className={styles.actions}>
              <button type="submit" form="plainwrite-editor-form" className={styles.primaryAction}>
                Save draft
              </button>
              <button type="submit" form="plainwrite-editor-form" formAction={commitAction}>
                Mark ready
              </button>
              <form action={publishAction}>
                <button type="submit" disabled={status !== 'committed'}>
                  Publish
                </button>
              </form>
            </div>
          ) : null}
        </section>

        {userCanEdit ? (
          <form
            className={styles.discardForm}
            action={discardAction}
            onSubmit={(event) => {
              if (!window.confirm('Discard this local draft?')) {
                event.preventDefault();
              }
            }}
          >
            <button type="submit" disabled={status === 'unmodified'}>
              Discard draft
            </button>
          </form>
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
