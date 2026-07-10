import type { ReactNode } from 'react';
import { PlainwriteSidebar } from './_components/PlainwriteSidebar';
import { registerDataContracts } from './_lib/data-contracts';
import { registerPortabilityHandlers } from './_lib/portability';
import styles from './layout.module.css';

export default async function PlainwriteLayout({ children }: { children: ReactNode }) {
  // Both registries are in-process and reset on restart — the platform SDK
  // requires re-registering from a request-scoped plugin route, so this runs
  // on every request to any Plainwrite page. Never let a registration
  // failure take down the whole plugin shell.
  try {
    registerDataContracts();
    await registerPortabilityHandlers();
  } catch {
    // Data contracts / portability are best-effort platform integrations —
    // a registration failure here must not block Plainwrite's own UI.
  }

  return (
    <div className={styles.shell}>
      <PlainwriteSidebar />
      <main className={styles.content}>{children}</main>
    </div>
  );
}
