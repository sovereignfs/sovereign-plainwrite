import type { ReactNode } from 'react';
import Link from 'next/link';
import styles from './BackLink.module.css';

/**
 * The muted "← Back to …" affordance the redesign spec puts at the top-left
 * of every project-scoped screen (see the editor wireframe). It replaces the
 * old Plainwrite sidebar's navigation: one level up the hierarchy
 * (Sites → a site's posts → settings/editor), so back navigation is a plain
 * breadcrumb instead of a persistent side rail. Kept plugin-local rather than
 * in `@sovereignfs/ui` for now — a back/breadcrumb affordance is a reasonable
 * future design-system candidate, but this is a thin styled Link and living
 * here avoids a cross-repo change to ship the sidebar removal.
 */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={styles.backLink}>
      <span aria-hidden="true">←</span>
      {children}
    </Link>
  );
}
