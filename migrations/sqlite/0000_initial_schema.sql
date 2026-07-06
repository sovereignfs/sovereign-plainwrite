CREATE TABLE `plainwrite_projects` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `created_by` text NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `provider` text NOT NULL,
  `provider_url` text,
  `repo_owner` text NOT NULL,
  `repo_name` text NOT NULL,
  `branch` text NOT NULL,
  `path_prefix` text NOT NULL,
  `ssg_type` text NOT NULL,
  `is_private` integer DEFAULT 0 NOT NULL,
  `metadata_visibility` text NOT NULL,
  `archived_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plainwrite_project_members` (
  `tenant_id` text NOT NULL,
  `project_id` text NOT NULL,
  `user_id` text NOT NULL,
  `role` text NOT NULL,
  `invited_by` text,
  `joined_at` integer NOT NULL,
  PRIMARY KEY (`project_id`, `user_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plainwrite_project_members_project_user_idx` ON `plainwrite_project_members` (`project_id`, `user_id`);
--> statement-breakpoint
CREATE TABLE `plainwrite_credentials` (
  `tenant_id` text NOT NULL,
  `project_id` text NOT NULL,
  `user_id` text NOT NULL,
  `provider` text NOT NULL,
  `auth_type` text NOT NULL,
  `connection_id` text,
  `secret_ref` text NOT NULL,
  `token_expires_at` integer,
  `provider_login` text,
  `status` text NOT NULL,
  `last_error` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  PRIMARY KEY (`project_id`, `user_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plainwrite_credentials_project_user_idx` ON `plainwrite_credentials` (`project_id`, `user_id`);
--> statement-breakpoint
CREATE TABLE `plainwrite_file_cache` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `project_id` text NOT NULL,
  `path` text NOT NULL,
  `collection` text,
  `filename` text NOT NULL,
  `sha` text NOT NULL,
  `last_synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plainwrite_file_cache_project_path_idx` ON `plainwrite_file_cache` (`project_id`, `path`);
--> statement-breakpoint
CREATE TABLE `plainwrite_drafts` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `project_id` text NOT NULL,
  `file_path` text NOT NULL,
  `user_id` text NOT NULL,
  `content` text,
  `status` text NOT NULL,
  `commit_message` text,
  `base_sha` text,
  `committed_at` integer,
  `published_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plainwrite_drafts_project_file_user_idx` ON `plainwrite_drafts` (`project_id`, `file_path`, `user_id`);
--> statement-breakpoint
CREATE TABLE `plainwrite_collection_schemas` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `project_id` text NOT NULL,
  `collection` text NOT NULL,
  `schema` text NOT NULL,
  `inferred_at` integer,
  `updated_at` integer NOT NULL,
  `updated_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plainwrite_collection_schemas_project_collection_idx` ON `plainwrite_collection_schemas` (`project_id`, `collection`);
--> statement-breakpoint
CREATE TABLE `plainwrite_publish_events` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL,
  `project_id` text NOT NULL,
  `user_id` text NOT NULL,
  `provider` text NOT NULL,
  `branch` text NOT NULL,
  `commit_sha` text,
  `message` text NOT NULL,
  `files` text NOT NULL,
  `status` text NOT NULL,
  `error_code` text,
  `error_summary` text,
  `created_at` integer NOT NULL
);
