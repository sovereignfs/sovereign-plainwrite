'use client';

import { useRef, useState } from 'react';
import { Button, Dialog } from '@sovereignfs/ui';
import { createProject } from '../_lib/actions';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './NewProjectDialog.module.css';

export function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function resetAndClose() {
    formRef.current?.reset();
    setDirty(false);
    setDiscardConfirmOpen(false);
    setOpen(false);
  }

  // Dialog focuses the first form field on open, so without a dirty check
  // Esc/scrim-click would need to fight past "is focus inside the form" —
  // that used to just silently swallow the dismissal instead. Now: close
  // immediately when nothing's been entered, confirm before discarding
  // entered input otherwise.
  function handleDismissRequest() {
    if (!dirty) {
      resetAndClose();
      return;
    }
    setDiscardConfirmOpen(true);
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        New project
      </Button>
      <Dialog open={open} onClose={handleDismissRequest} size="md" title="New project">
        <form
          ref={formRef}
          action={createProject}
          className={styles.form}
          onChange={() => setDirty(true)}
        >
          <div className={styles.header}>
            <h2>New project</h2>
            <p>Connect a GitHub repository that stores Astro content.</p>
          </div>
          <label>
            <span id="plainwrite-project-name-label">Name</span>
            <input
              name="name"
              required
              aria-labelledby="plainwrite-project-name-label"
              placeholder="Company blog"
            />
          </label>
          <label>
            <span id="plainwrite-repository-url-label">Repository URL</span>
            <input
              name="repositoryUrl"
              required
              aria-labelledby="plainwrite-repository-url-label"
              aria-describedby="plainwrite-repository-url-help"
              placeholder="https://github.com/acme/site or git@github.com:acme/site.git"
            />
            <small id="plainwrite-repository-url-help" className={styles.help}>
              Supports GitHub HTTPS and SSH repository URLs.
            </small>
          </label>
          <label>
            <span id="plainwrite-project-description-label">Description</span>
            <textarea
              name="description"
              rows={3}
              aria-labelledby="plainwrite-project-description-label"
              placeholder="Internal notes for this content project"
            />
          </label>
          <h3 className={styles.sectionTitle}>Content location</h3>
          <div className={styles.grid}>
            <label>
              <span id="plainwrite-branch-label">Branch</span>
              <input name="branch" defaultValue="main" aria-labelledby="plainwrite-branch-label" />
            </label>
            <label>
              <span id="plainwrite-content-folder-label">Content folder</span>
              <input
                name="pathPrefix"
                defaultValue="src/content"
                aria-labelledby="plainwrite-content-folder-label"
              />
            </label>
          </div>
          <label>
            <span id="plainwrite-ssg-label">Static site generator</span>
            <select name="ssgType" defaultValue="astro" aria-labelledby="plainwrite-ssg-label">
              <option value="astro">Astro</option>
            </select>
          </label>
          <label>
            <span id="plainwrite-metadata-visibility-label">Repository metadata visibility</span>
            <select
              name="metadataVisibility"
              defaultValue=""
              aria-labelledby="plainwrite-metadata-visibility-label"
              aria-describedby="plainwrite-metadata-visibility-help"
            >
              <option value="">Default by repository privacy</option>
              <option value="members_with_credentials">Members with credentials</option>
              <option value="all_members">All project members</option>
            </select>
            <small id="plainwrite-metadata-visibility-help" className={styles.help}>
              Private repositories default to members with credentials.
            </small>
          </label>
          <label className={styles.checkbox}>
            <input
              name="isPrivate"
              type="checkbox"
              aria-labelledby="plainwrite-private-repository-label"
            />
            <span id="plainwrite-private-repository-label">Private repository</span>
          </label>
          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={handleDismissRequest}>
              Cancel
            </Button>
            <Button type="submit">Create project</Button>
          </div>
        </form>
      </Dialog>
      <ConfirmDialog
        open={discardConfirmOpen}
        title="Discard new project?"
        message="The details you've entered will be lost."
        confirmLabel="Discard"
        onCancel={() => setDiscardConfirmOpen(false)}
        onConfirm={resetAndClose}
      />
    </>
  );
}
