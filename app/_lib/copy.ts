import type { ProjectRole } from './project-rules';

/**
 * Plain-language translations for internal/git vocabulary — the jargon
 * table in docs/adhoc/plainwrite-ui-redesign.md §3. Centralized here so the
 * mapping stays consistent across the dashboard, editor, and settings
 * screens instead of drifting per-file. These only change what's displayed;
 * the underlying stored values (role strings, status strings, visibility
 * enum) are unchanged.
 */

const ROLE_LABELS: Record<ProjectRole, string> = {
  owner: 'Owner',
  editor: 'Writer',
  viewer: 'Reader',
};

export function formatProjectRole(role: ProjectRole | string): string {
  return ROLE_LABELS[role as ProjectRole] ?? role;
}

export function formatMetadataVisibility(value: string): string {
  if (value === 'members_with_credentials') return 'People with publishing access';
  if (value === 'all_members') return 'Everyone with access';
  return value;
}

export function formatPostStatus(status: string): string {
  if (status === 'unmodified') return 'Live on site';
  if (status === 'draft') return 'Writing';
  if (status === 'committed') return 'Ready to publish';
  if (status === 'pending-delete') return 'Removing on next publish';
  if (status === 'conflict') return 'Needs review';
  return status;
}
