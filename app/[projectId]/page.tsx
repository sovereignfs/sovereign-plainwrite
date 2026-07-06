import Link from 'next/link';
import { EmptyState, PageHeader, StatusBadge } from '@sovereignfs/ui';
import styles from './page.module.css';

interface ProjectPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Project files"
        description={`Project ${projectId}`}
        action={<StatusBadge status="unmodified">Scaffold</StatusBadge>}
      />
      <div className={styles.links}>
        <Link href={`/plainwrite/${projectId}/settings`}>Settings</Link>
        <Link href={`/plainwrite/${projectId}/editor/src/content/example.md`}>Editor</Link>
      </div>
      <EmptyState
        icon="package"
        heading="File sync is not wired yet"
        description="GitHub and Astro file discovery are planned in PLW-005."
      />
    </div>
  );
}
