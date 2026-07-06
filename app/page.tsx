import { Button, EmptyState, PageHeader } from '@sovereignfs/ui';
import styles from './page.module.css';

export default function ProjectsPage() {
  return (
    <div className={styles.page}>
      <PageHeader
        title="Projects"
        description="Connect static site repositories and manage Markdown content."
        action={<Button disabled>New project</Button>}
      />
      <EmptyState
        icon="pencil"
        heading="No projects yet"
        description="Project creation lands in PLW-003. This scaffold keeps the route ready for implementation."
      />
    </div>
  );
}
