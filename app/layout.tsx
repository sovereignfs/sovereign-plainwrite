import type { ReactNode } from 'react';
import Link from 'next/link';
import styles from './layout.module.css';

export default function PlainwriteLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Plainwrite navigation">
        <div className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            Pw
          </span>
          <div>
            <p className={styles.kicker}>Plainwrite</p>
            <h1 className={styles.title}>Content</h1>
          </div>
        </div>
        <nav className={styles.nav}>
          <Link href="/plainwrite">Projects</Link>
        </nav>
      </aside>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
