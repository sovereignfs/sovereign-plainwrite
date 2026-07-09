'use client';

import { useRef, useState } from 'react';
import { Button, Checkbox, Dialog, FormField, Input, Select, Textarea } from '@sovereignfs/ui';
import { createProject } from '../_lib/actions';
import { ConfirmDialog } from './ConfirmDialog';
import styles from './NewProjectDialog.module.css';

export function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function resetAndClose() {
    formRef.current?.reset();
    setDirty(false);
    setIsPrivate(false);
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
          <FormField label="Name" required>
            {(field) => <Input {...field} name="name" required placeholder="Company blog" />}
          </FormField>
          <FormField
            label="Repository URL"
            required
            hint="Supports GitHub HTTPS and SSH repository URLs."
          >
            {(field) => (
              <Input
                {...field}
                name="repositoryUrl"
                required
                placeholder="https://github.com/acme/site or git@github.com:acme/site.git"
              />
            )}
          </FormField>
          <FormField label="Description">
            {(field) => (
              <Textarea
                {...field}
                name="description"
                rows={3}
                placeholder="Internal notes for this content project"
              />
            )}
          </FormField>
          <h3 className={styles.sectionTitle}>Content location</h3>
          <div className={styles.grid}>
            <FormField label="Branch">
              {(field) => <Input {...field} name="branch" defaultValue="main" />}
            </FormField>
            <FormField label="Content folder">
              {(field) => <Input {...field} name="pathPrefix" defaultValue="src/content" />}
            </FormField>
          </div>
          <FormField label="Static site generator">
            {(field) => (
              <Select {...field} name="ssgType" defaultValue="astro">
                <option value="astro">Astro</option>
              </Select>
            )}
          </FormField>
          <FormField
            label="Repository metadata visibility"
            hint="Private repositories default to members with credentials."
          >
            {(field) => (
              <Select {...field} name="metadataVisibility" defaultValue="">
                <option value="">Default by repository privacy</option>
                <option value="members_with_credentials">Members with credentials</option>
                <option value="all_members">All project members</option>
              </Select>
            )}
          </FormField>
          <Checkbox
            name="isPrivate"
            checked={isPrivate}
            onChange={setIsPrivate}
            label="Private repository"
          />
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
