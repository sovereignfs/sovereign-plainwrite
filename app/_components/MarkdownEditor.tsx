'use client';

import { useActionState, useEffect, useMemo, useState } from 'react';
import { Button, CodeTextarea, FormField, Input, SegmentedControl } from '@sovereignfs/ui';
import type { ActionResult } from '../_lib/actions';
import type { CollectionSchemaField } from '../_lib/schema-rules';
import {
  parseMarkdownDocument,
  renderSafeMarkdownPreview,
  serializeMarkdownDocument,
  serializeStructuredFrontmatter,
} from '../_lib/editor-rules';
import { ConfirmDialog } from './ConfirmDialog';
import { StructuredFrontmatterFields } from './StructuredFrontmatterFields';
import styles from './MarkdownEditor.module.css';

const AUTOSAVE_IDLE_MS = 2000;

interface MarkdownEditorProps {
  path: string;
  content: string;
  baseSha: string | null;
  status: string;
  commitMessage: string | null;
  userCanEdit: boolean;
  schemaFields: CollectionSchemaField[];
  saveAction: (formData: FormData) => void | Promise<void>;
  commitAction: (formData: FormData) => void | Promise<void>;
  publishAction: (prevState: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  discardAction: () => void | Promise<void>;
}

type FrontmatterMode = 'structured' | 'raw';
type AutosaveState = 'idle' | 'saving' | 'saved' | 'error';

export function MarkdownEditor({
  path,
  content,
  baseSha,
  status,
  commitMessage,
  userCanEdit,
  schemaFields,
  saveAction,
  commitAction,
  publishAction,
  discardAction,
}: MarkdownEditorProps) {
  const parsed = useMemo(() => parseMarkdownDocument(content), [content]);
  const [frontmatterYaml, setFrontmatterYaml] = useState(parsed.frontmatterYaml);
  const [fieldData, setFieldData] = useState<Record<string, unknown>>(parsed.data);
  const [mode, setMode] = useState<FrontmatterMode>(schemaFields.length > 0 ? 'structured' : 'raw');
  const [body, setBody] = useState(parsed.body);
  const [message, setMessage] = useState(commitMessage ?? `Update ${path.split('/').at(-1) ?? path}`);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  // Tracks the content as of the last successful save (manual or auto) —
  // NOT the originally-loaded content — so autosave correctly clears the
  // dirty flag instead of re-triggering itself and re-warning on unload
  // forever after the first save.
  const [lastSaved, setLastSaved] = useState({
    frontmatterYaml: parsed.frontmatterYaml,
    body: parsed.body,
  });
  const [autosaveState, setAutosaveState] = useState<AutosaveState>('idle');
  const [publishState, publishFormAction, publishPending] = useActionState<
    ActionResult | null,
    FormData
  >(publishAction, null);

  const serializedContent = useMemo(
    () => serializeMarkdownDocument(frontmatterYaml, body),
    [frontmatterYaml, body],
  );
  const previewHtml = useMemo(() => renderSafeMarkdownPreview(serializedContent), [serializedContent]);
  const isDirty = frontmatterYaml !== lastSaved.frontmatterYaml || body !== lastSaved.body;

  // Draft state lives in useState with no built-in persistence beyond this
  // component — closing the tab or refreshing loses unsaved edits silently
  // otherwise. beforeunload only covers full-page navigation (tab close,
  // refresh, typed URL); it does not fire for Next.js client-side <Link>
  // navigation (e.g. the sidebar or the "Project dashboard" link), which
  // needs the platform's ConfirmDialog (DS Phase B, not shipped yet) to
  // guard in-app route changes too.
  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Autosave after idle typing: same saveAction the "Save draft" button
  // uses, called directly with a manually-built FormData rather than a
  // native form submission (no need for a visible form transition for a
  // background save). lastSaved only updates on success, so a failed
  // autosave leaves isDirty (and the beforeunload guard) correctly set.
  useEffect(() => {
    if (!userCanEdit || !isDirty) return;
    const timer = setTimeout(() => {
      setAutosaveState('saving');
      const formData = new FormData();
      formData.set('baseSha', baseSha ?? '');
      formData.set('content', serializeMarkdownDocument(frontmatterYaml, body));
      formData.set('commitMessage', message);
      Promise.resolve(saveAction(formData))
        .then(() => {
          setLastSaved({ frontmatterYaml, body });
          setAutosaveState('saved');
        })
        .catch(() => setAutosaveState('error'));
    }, AUTOSAVE_IDLE_MS);
    return () => clearTimeout(timer);
  }, [frontmatterYaml, body, isDirty, userCanEdit, baseSha, message, saveAction]);

  function handleFieldChange(name: string, value: unknown) {
    const next = { ...fieldData, [name]: value };
    setFieldData(next);
    setFrontmatterYaml(serializeStructuredFrontmatter(next));
  }

  function handleModeChange(nextMode: FrontmatterMode) {
    if (nextMode === 'structured') {
      // Raw text is the single source of truth; re-derive structured field
      // values from whatever the user last typed there.
      setFieldData(parseMarkdownDocument(serializeMarkdownDocument(frontmatterYaml, '')).data);
    }
    setMode(nextMode);
  }

  return (
    <div className={styles.shell}>
      <form
        id="plainwrite-editor-form"
        className={styles.editorForm}
        action={saveAction}
        onSubmit={() => setLastSaved({ frontmatterYaml, body })}
      >
        <input type="hidden" name="baseSha" value={baseSha ?? ''} />
        <input type="hidden" name="content" value={serializedContent} />

        <section className={styles.frontmatterPanel} aria-labelledby="frontmatter-heading">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Metadata</p>
              <h2 id="frontmatter-heading">Frontmatter</h2>
            </div>
            {schemaFields.length > 0 ? (
              <SegmentedControl
                aria-label="Frontmatter editing mode"
                value={mode}
                onChange={handleModeChange}
                options={[
                  { label: 'Structured', value: 'structured' },
                  { label: 'Raw YAML', value: 'raw' },
                ]}
                size="sm"
              />
            ) : (
              <span>{frontmatterYaml.trim() ? 'Frontmatter enabled' : 'No frontmatter'}</span>
            )}
          </div>
          {mode === 'structured' && schemaFields.length > 0 ? (
            <StructuredFrontmatterFields
              fields={schemaFields}
              data={fieldData}
              onFieldChange={handleFieldChange}
              disabled={!userCanEdit}
            />
          ) : (
            <CodeTextarea
              aria-label="Raw YAML frontmatter"
              value={frontmatterYaml}
              onChange={(event) => setFrontmatterYaml(event.currentTarget.value)}
              rows={8}
              readOnly={!userCanEdit}
            />
          )}
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
            {userCanEdit && autosaveState !== 'idle' ? (
              <p className={styles.autosaveStatus} role={autosaveState === 'error' ? 'alert' : undefined}>
                {autosaveLabel(autosaveState)}
              </p>
            ) : null}
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
              <Button
                type="submit"
                form="plainwrite-editor-form"
                formAction={commitAction}
                variant="secondary"
              >
                Mark ready
              </Button>
              <form action={publishFormAction}>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={status !== 'committed' || publishPending}
                  className={styles.fullWidth}
                >
                  {publishPending ? 'Publishing…' : 'Publish'}
                </Button>
              </form>
            </div>
          ) : null}
          {publishState && !publishState.ok ? (
            <p className={styles.feedbackError} role="status" aria-live="polite">
              {publishState.error}
            </p>
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

function autosaveLabel(state: AutosaveState) {
  if (state === 'saving') return 'Autosaving…';
  if (state === 'saved') return 'Autosaved';
  if (state === 'error') return 'Autosave failed — save manually to keep your edits.';
  return null;
}
