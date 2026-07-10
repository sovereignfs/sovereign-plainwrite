'use client';

import { useActionState } from 'react';
import { Button } from '@sovereignfs/ui';
import type { ActionResult } from '../_lib/actions';
import { FormCheckbox } from './FormCheckbox';
import styles from '../[projectId]/page.module.css';

export function PublishAllForm({
  action,
  committedCount,
}: {
  action: (prevState: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  committedCount: number;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);

  return (
    <div>
      <form action={formAction} className={styles.publishAllForm}>
        <FormCheckbox name="skipConflicts" label="Skip posts that changed on the site" />
        <Button type="submit" disabled={committedCount === 0 || pending}>
          {pending ? 'Publishing…' : committedCount > 0 ? `Put ${committedCount} live` : 'Publish'}
        </Button>
      </form>
      {state && !state.ok ? (
        <p className={styles.feedbackError} role="status" aria-live="polite">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
