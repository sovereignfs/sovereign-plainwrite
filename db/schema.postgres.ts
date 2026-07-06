import { integer, pgTable, primaryKey, text, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Plainwrite Postgres schema mirror.
 *
 * Application code should import `db/schema.ts`. This file mirrors the same
 * physical column names and broadly compatible scalar types for Postgres
 * migration generation.
 */

export const plainwriteProjects = pgTable('plainwrite_projects', {
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
  isPrivate: integer('is_private').notNull().default(0),
  metadataVisibility: text('metadata_visibility').notNull(),
  archivedAt: integer('archived_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const plainwriteProjectMembers = pgTable(
  'plainwrite_project_members',
  {
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    userId: text('user_id').notNull(),
    role: text('role').notNull(),
    invitedBy: text('invited_by'),
    joinedAt: integer('joined_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    uniqueIndex('plainwrite_project_members_project_user_idx').on(t.projectId, t.userId),
  ],
);

export const plainwriteCredentials = pgTable(
  'plainwrite_credentials',
  {
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    userId: text('user_id').notNull(),
    provider: text('provider').notNull(),
    authType: text('auth_type').notNull(),
    connectionId: text('connection_id'),
    secretRef: text('secret_ref').notNull(),
    tokenExpiresAt: integer('token_expires_at'),
    providerLogin: text('provider_login'),
    status: text('status').notNull(),
    lastError: text('last_error'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.userId] }),
    uniqueIndex('plainwrite_credentials_project_user_idx').on(t.projectId, t.userId),
  ],
);

export const plainwriteFileCache = pgTable(
  'plainwrite_file_cache',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    path: text('path').notNull(),
    collection: text('collection'),
    filename: text('filename').notNull(),
    sha: text('sha').notNull(),
    lastSyncedAt: integer('last_synced_at').notNull(),
  },
  (t) => [uniqueIndex('plainwrite_file_cache_project_path_idx').on(t.projectId, t.path)],
);

export const plainwriteDrafts = pgTable(
  'plainwrite_drafts',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    filePath: text('file_path').notNull(),
    userId: text('user_id').notNull(),
    content: text('content'),
    status: text('status').notNull(),
    commitMessage: text('commit_message'),
    baseSha: text('base_sha'),
    committedAt: integer('committed_at'),
    publishedAt: integer('published_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('plainwrite_drafts_project_file_user_idx').on(
      t.projectId,
      t.filePath,
      t.userId,
    ),
  ],
);

export const plainwriteCollectionSchemas = pgTable(
  'plainwrite_collection_schemas',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    projectId: text('project_id').notNull(),
    collection: text('collection').notNull(),
    schemaJson: text('schema').notNull(),
    inferredAt: integer('inferred_at'),
    updatedAt: integer('updated_at').notNull(),
    updatedBy: text('updated_by'),
  },
  (t) => [
    uniqueIndex('plainwrite_collection_schemas_project_collection_idx').on(
      t.projectId,
      t.collection,
    ),
  ],
);

export const plainwritePublishEvents = pgTable('plainwrite_publish_events', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull(),
  projectId: text('project_id').notNull(),
  userId: text('user_id').notNull(),
  provider: text('provider').notNull(),
  branch: text('branch').notNull(),
  commitSha: text('commit_sha'),
  message: text('message').notNull(),
  files: text('files').notNull(),
  status: text('status').notNull(),
  errorCode: text('error_code'),
  errorSummary: text('error_summary'),
  createdAt: integer('created_at').notNull(),
});
