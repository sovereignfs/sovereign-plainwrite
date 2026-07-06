import { Badge, EmptyState, PageHeader } from '@sovereignfs/ui';

interface SettingsPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectSettingsPage({ params }: SettingsPageProps) {
  const { projectId } = await params;

  return (
    <div>
      <PageHeader
        title="Project settings"
        description={`Membership, repository settings, and schemas for ${projectId}.`}
        action={<Badge variant="status" status="pending">Planned</Badge>}
      />
      <EmptyState
        icon="settings"
        heading="Settings are not wired yet"
        description="Project settings and membership are planned in PLW-003."
      />
    </div>
  );
}
