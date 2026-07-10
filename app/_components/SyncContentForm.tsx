'use client';

import { useActionState } from 'react';
import { Button } from '@sovereignfs/ui';
import type { ActionResult } from '../_lib/actions';
import styles from '../[projectId]/page.module.css';

export function SyncContentForm({
  action,
}: {
  action: (prevState: ActionResult | null, formData: FormData) => Promise<ActionResult>;
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(action, null);

  return (
    <form action={formAction}>
      {state && !state.ok ? (
        <p className={styles.feedbackError} role="status" aria-live="polite">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Checking…' : 'Check for updates'}
      </Button>
    </form>
  );
}
