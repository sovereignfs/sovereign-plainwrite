import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const plainwriteProjects = sqliteTable('plainwrite_projects', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  createdBy: text('created_by').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  provider: text('provider').notNull(),
  providerUrl: text('provider_url'),
  repoOwner: text('repo_owner').notNull(),
  repoName: text('repo_name').notNull(),
  branch: text('branch').notNull(),
  pathPrefix: text('path_prefix').notNull(),
  ssgType: text('ssg_type').notNull(),
  isPrivate: text('is_private').notNull(),
  metadataVisibility: text('metadata_visibility').notNull(),
  archivedAt: text('archived_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
