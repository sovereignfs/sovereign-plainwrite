import { CodeTextarea, PageHeader, SplitPane, StatusBadge } from '@sovereignfs/ui';
import styles from './page.module.css';

interface EditorPageProps {
  params: Promise<{ projectId: string; filePath: string[] }>;
}

export default async function EditorPage({ params }: EditorPageProps) {
  const { projectId, filePath } = await params;
  const path = filePath.join('/');
  const sample = `---\ntitle: Untitled\n---\n\nStart writing here.\n`;

  return (
    <div className={styles.page}>
      <PageHeader
        title={path}
        description={`Draft editor for ${projectId}`}
        action={<StatusBadge status="draft">Draft scaffold</StatusBadge>}
      />
      <SplitPane
        primaryLabel="Markdown editor"
        secondaryLabel="Preview"
        primary={<CodeTextarea aria-label="Markdown editor" defaultValue={sample} />}
        secondary={
          <section className={styles.preview} aria-label="Preview placeholder">
            <h2>Preview</h2>
            <p>Sanitized Markdown preview lands in PLW-006.</p>
          </section>
        }
      />
    </div>
  );
}
