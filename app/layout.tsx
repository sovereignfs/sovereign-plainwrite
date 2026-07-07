import type { ReactNode } from 'react';
import { PlainwriteSidebar } from './_components/PlainwriteSidebar';
import styles from './layout.module.css';

export default function PlainwriteLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <PlainwriteSidebar />
      <main className={styles.content}>{children}</main>
    </div>
  );
}
