'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Button, CodeTextarea, FormField, Input, SegmentedControl } from '@sovereignfs/ui';
import type { ActionResult, ImageUploadResult } from '../_lib/actions';
import { formatPostStatus } from '../_lib/copy';
import type { CollectionSchemaField } from '../_lib/schema-rules';
import {
  parseMarkdownDocument,
  renderSafeMarkdownPreview,
  serializeMarkdownDocument,
  serializeStructuredFrontmatter,
} from '../_lib/editor-rules';
import { ConfirmDialog } from './ConfirmDialog';
import { ConflictReviewDialog } from './ConflictReviewDialog';
import { RichTextBodyEditor } from './RichTextBodyEditor';
import { StructuredFrontmatterFields } from './StructuredFrontmatterFields';
import styles from './MarkdownEditor.module.css';

const AUTOSAVE_IDLE_MS = 2000;
const BODY_MODE_STORAGE_KEY = 'plainwrite:editor-body-mode';
type BodyMode = 'write' | 'markdown' | 'preview';

function isBodyMode(value: string | null): value is BodyMode {
  return value === 'write' || value === 'markdown' || value === 'preview';
}

/**
 * assertNoPublishConflict (actions.ts) always throws with this exact
 * prefix — the one place that convention is defined; checked here so the
 * "Review changes" affordance only appears for a real conflict, not any
 * other publish failure (missing token, network error, etc.).
 */
function isConflictError(message: string) {
  return message.startsWith('Conflict:');
}

/**
 * `formatPostStatus('unmodified')` reads "Live on site" — correct for an
 * existing post that matches what's already published, but actively wrong
 * for a brand-new post that has never been saved yet (same 'unmodified'
 * status, because no draft exists to diverge from). `baseSha` is null only
 * for that new-file case (see getEditorState), so it's the signal that
 * disambiguates the two — found via live testing the "New post" dialog.
 */
function editorStatusLabel(status: string, baseSha: string | null) {
  if (status === 'unmodified' && baseSha === null) return 'New post';
  return formatPostStatus(status);
}

interface MarkdownEditorProps {
  projectId: string;
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
  refreshBaseAction: (prevState: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  uploadImageAction: (formData: FormData) => Promise<ImageUploadResult>;
}

type FrontmatterMode = 'structured' | 'raw';
type AutosaveState = 'idle' | 'saving' | 'saved' | 'error';

export function MarkdownEditor({
  projectId,
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
  refreshBaseAction,
  uploadImageAction,
}: MarkdownEditorProps) {
  const parsed = useMemo(() => parseMarkdownDocument(content), [content]);
  const [frontmatterYaml, setFrontmatterYaml] = useState(parsed.frontmatterYaml);
  const [fieldData, setFieldData] = useState<Record<string, unknown>>(parsed.data);
  const [mode, setMode] = useState<FrontmatterMode>(schemaFields.length > 0 ? 'structured' : 'raw');
  const [body, setBody] = useState(parsed.body);
  const [message, setMessage] = useState(commitMessage ?? `Update ${path.split('/').at(-1) ?? path}`);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [conflictReviewOpen, setConflictReviewOpen] = useState(false);
  // Starts at the same default on server and client (avoids a hydration
  // mismatch from reading localStorage in the initializer) and is swapped
  // to the writer's remembered preference right after mount instead.
  const [bodyMode, setBodyModeState] = useState<BodyMode>('write');
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
  // The live TipTap instance, handed up by RichTextBodyEditor (only mounted
  // in Write mode) — needed to run its `setImage` command from the shared
  // upload button below, which lives outside that component.
  const [richEditor, setRichEditor] = useState<Editor | null>(null);
  // CodeTextarea (packages/ui) doesn't forward a `ref` prop, so the DOM node
  // is captured as a side effect of the change/focus handlers it already
  // has wired instead of adding one — avoids a design-system change for a
  // single plugin-local need.
  const bodyTextareaElRef = useRef<HTMLTextAreaElement | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const [imageUploadPending, setImageUploadPending] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);

  const serializedContent = useMemo(
    () => serializeMarkdownDocument(frontmatterYaml, body),
    [frontmatterYaml, body],
  );
  const previewHtml = useMemo(() => renderSafeMarkdownPreview(serializedContent), [serializedContent]);
  const isDirty = frontmatterYaml !== lastSaved.frontmatterYaml || body !== lastSaved.body;

  useEffect(() => {
    const stored = window.localStorage.getItem(BODY_MODE_STORAGE_KEY);
    if (isBodyMode(stored)) setBodyModeState(stored);
  }, []);

  function setBodyMode(next: BodyMode) {
    setBodyModeState(next);
    window.localStorage.setItem(BODY_MODE_STORAGE_KEY, next);
  }

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

  /**
   * Inserts the uploaded image's Markdown reference at the cursor for
   * whichever body mode is currently active. Write mode: TipTap's own
   * selection via `setImage`. Markdown mode: the raw textarea's
   * `selectionStart`/`selectionEnd`, replacing any selected text — done
   * imperatively (not through the controlled `body` state's change handler)
   * because there's no synthetic input event to drive here, only a
   * programmatic insert.
   */
  async function handleImageFileSelected(file: File) {
    setImageUploadError(null);
    setImageUploadPending(true);
    try {
      const formData = new FormData();
      formData.set('image', file);
      const result = await uploadImageAction(formData);
      if (!result.ok) {
        setImageUploadError(result.error);
        return;
      }
      if (bodyMode === 'write') {
        richEditor?.chain().focus().setImage({ src: result.url, alt: result.alt }).run();
        return;
      }
      const textarea = bodyTextareaElRef.current;
      if (!textarea) {
        setBody((current) => `${current}\n${result.markdown}\n`);
        return;
      }
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const next = `${body.slice(0, start)}${result.markdown}${body.slice(end)}`;
      setBody(next);
      const cursor = start + result.markdown.length;
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(cursor, cursor);
      });
    } finally {
      setImageUploadPending(false);
    }
  }

  return (
    <div className={styles.shell}>
      {/* The form carries only the two hidden inputs — the Post and Details
          panels are controlled components that feed the hidden `content`
          input, so they live outside the form (and the Save / Ready to
          publish buttons + change note reach it via form="…"). This lets the
          right column group Current state over Details in its own flow,
          independent of the (often much taller) Post column. */}
      <form
        id="plainwrite-editor-form"
        className={styles.formContents}
        action={saveAction}
        onSubmit={() => setLastSaved({ frontmatterYaml, body })}
      >
        <input type="hidden" name="baseSha" value={baseSha ?? ''} />
        <input type="hidden" name="content" value={serializedContent} />
      </form>

      <section className={styles.bodyPanel} aria-labelledby="body-heading">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Content</p>
              <h2 id="body-heading">Post</h2>
            </div>
            <div className={styles.bodyModeRow}>
              <SegmentedControl
                aria-label="Body editing mode"
                value={bodyMode}
                onChange={setBodyMode}
                options={[
                  { label: 'Write', value: 'write' },
                  { label: 'Markdown', value: 'markdown' },
                  { label: 'Preview', value: 'preview' },
                ]}
                size="sm"
              />
              {userCanEdit ? (
                <>
                  <input
                    ref={imageFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className={styles.hiddenInput}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void handleImageFileSelected(file);
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={bodyMode === 'preview' || imageUploadPending}
                    onClick={() => imageFileInputRef.current?.click()}
                  >
                    {imageUploadPending ? 'Uploading…' : 'Upload image'}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
          {imageUploadError ? <p className={styles.imageUploadError}>{imageUploadError}</p> : null}
          <div className={styles.editorArea}>
            {bodyMode === 'write' ? (
              <RichTextBodyEditor
                content={body}
                onChange={setBody}
                readOnly={!userCanEdit}
                onEditorReady={setRichEditor}
              />
            ) : bodyMode === 'markdown' ? (
              <CodeTextarea
                className={styles.markdownFill}
                aria-label="Post content"
                value={body}
                onChange={(event) => {
                  bodyTextareaElRef.current = event.currentTarget;
                  setBody(event.currentTarget.value);
                }}
                onFocus={(event) => {
                  bodyTextareaElRef.current = event.currentTarget;
                }}
                rows={24}
                readOnly={!userCanEdit}
              />
            ) : (
              <div
                className={styles.preview}
                dangerouslySetInnerHTML={{ __html: previewHtml || '<p>Nothing to preview yet.</p>' }}
              />
            )}
          </div>
        </section>

        <aside className={styles.sideCol}>
          <section className={styles.currentState} aria-label="Publish controls">
            <div className={styles.currentStateHead}>
              <p className={styles.eyebrow}>Current state</p>
              <h2>{editorStatusLabel(status, baseSha)}</h2>
              <p className={styles.statusHint}>Changes stay private until you publish them.</p>
              {userCanEdit && autosaveState !== 'idle' ? (
                <p
                  className={styles.autosaveStatus}
                  role={autosaveState === 'error' ? 'alert' : undefined}
                >
                  {autosaveLabel(autosaveState)}
                </p>
              ) : null}
            </div>

            {userCanEdit ? (
              <>
                <div className={styles.actions}>
                  <Button type="submit" form="plainwrite-editor-form">
                    Save
                  </Button>
                  <Button
                    type="submit"
                    form="plainwrite-editor-form"
                    formAction={commitAction}
                    variant="secondary"
                  >
                    Ready to publish
                  </Button>
                  <form action={publishFormAction}>
                    <Button
                      type="submit"
                      variant="secondary"
                      disabled={status !== 'committed' || publishPending}
                    >
                      {publishPending ? 'Publishing…' : 'Publish'}
                    </Button>
                  </form>
                </div>
                <FormField label="Change note" id="commitMessage">
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
                <div className={styles.discardRow}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={status === 'unmodified'}
                    onClick={() => setDiscardConfirmOpen(true)}
                  >
                    Discard changes
                  </Button>
                </div>
              </>
            ) : null}

            {publishState && !publishState.ok ? (
              <div className={styles.feedbackError} role="status" aria-live="polite">
                <p>{publishState.error}</p>
                {isConflictError(publishState.error) ? (
                  <button
                    type="button"
                    className={styles.reviewChangesLink}
                    onClick={() => setConflictReviewOpen(true)}
                  >
                    Review changes
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className={styles.frontmatterPanel} aria-labelledby="frontmatter-heading">
          <div className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>Metadata</p>
              <h2 id="frontmatter-heading">Details</h2>
            </div>
            {schemaFields.length > 0 ? (
              <SegmentedControl
                aria-label="Details editing mode"
                value={mode}
                onChange={handleModeChange}
                options={[
                  { label: 'Structured', value: 'structured' },
                  { label: 'Raw text', value: 'raw' },
                ]}
                size="sm"
              />
            ) : (
              <span>{frontmatterYaml.trim() ? 'Details added' : 'No details yet'}</span>
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
              aria-label="Raw text details"
              value={frontmatterYaml}
              onChange={(event) => setFrontmatterYaml(event.currentTarget.value)}
              rows={8}
              readOnly={!userCanEdit}
            />
          )}
        </section>
      </aside>

      {userCanEdit ? (
        <>
          <ConfirmDialog
            open={discardConfirmOpen}
            title="Discard changes"
            message="This removes your changes and reloads the current version from your site. This cannot be undone."
            confirmLabel="Discard changes"
            onCancel={() => setDiscardConfirmOpen(false)}
            onConfirm={() => {
              setDiscardConfirmOpen(false);
              void discardAction();
            }}
          />
          <ConflictReviewDialog
            open={conflictReviewOpen}
            onClose={() => setConflictReviewOpen(false)}
            projectId={projectId}
            path={path}
            discardAction={discardAction}
            refreshBaseAction={refreshBaseAction}
            forcePublishAction={publishAction}
          />
        </>
      ) : null}
    </div>
  );
}

function autosaveLabel(state: AutosaveState) {
  if (state === 'saving') return 'Autosaving…';
  if (state === 'saved') return 'Autosaved';
  if (state === 'error') return 'Autosave failed — save manually to keep your edits.';
  return null;
}
