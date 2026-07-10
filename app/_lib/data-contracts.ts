import { sdk } from '@sovereignfs/sdk';
import { and, eq, inArray } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import {
  plainwriteDrafts,
  plainwriteFileCache,
  plainwriteProjectMembers,
  plainwriteProjects,
  type PlainwriteProject,
} from '../_db/schema';

// The SDK intentionally returns an opaque dialect-agnostic DB client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = BaseSQLiteDatabase<'async', any, any>;

interface ProjectsContractRow {
  id: string;
  name: string;
  repoOwner: string;
  repoName: string;
  branch: string;
  isPrivate: boolean;
  archivedAt: number | null;
  currentUserRole: string;
}

interface ContentIndexContractRow {
  projectId: string;
  path: string;
  collection: string | null;
  filename: string;
  lastSyncedAt: number;
}

interface DraftsContractRow {
  id: string;
  projectId: string;
  filePath: string;
  status: string;
  commitMessage: string | null;
  committedAt: number | null;
  publishedAt: number | null;
  updatedAt: number;
}

async function currentUserContext(): Promise<{ db: Db; userId: string; tenantId: string }> {
  const session = await sdk.auth.requireSession();
  const db = (await sdk.db.getClient()) as Db;
  return { db, userId: session.user.id, tenantId: session.user.tenantId };
}

/**
 * Registers Plainwrite's three read-only data contracts (RFC 0002). Must be
 * called from a request-scoped Plainwrite route (registration reads
 * `x-sovereign-plugin-id` internally) — this repo calls it from
 * `app/layout.tsx`, so it re-registers on every request to any Plainwrite
 * page. Registrations are in-process and reset on restart; a consumer
 * querying before any Plainwrite page has been visited in this process's
 * lifetime gets "no resolver registered" until that happens.
 */
export function registerDataContracts(): void {
  sdk.data.provide('plainwrite.projects', resolveProjectsContract);
  sdk.data.provide('plainwrite.content-index', resolveContentIndexContract);
  sdk.data.provide('plainwrite.drafts', resolveDraftsContract);
}

// Same non-project-owner project-visibility rule as the dashboard/settings
// UI: a private project's file metadata is only exposed when the project
// opts every member into visibility, since a data-contract resolver has no
// per-request GitHub credential to fall back on the way the UI's
// canViewCachedMetadata(project, token) does.
function projectMetadataVisible(project: PlainwriteProject): boolean {
  return !project.isPrivate || project.metadataVisibility === 'all_members';
}

async function currentUserProjectIds(db: Db, tenantId: string, userId: string): Promise<string[]> {
  const memberships = await db
    .select({ projectId: plainwriteProjectMembers.projectId })
    .from(plainwriteProjectMembers)
    .where(
      and(eq(plainwriteProjectMembers.tenantId, tenantId), eq(plainwriteProjectMembers.userId, userId)),
    );
  return memberships.map((row) => row.projectId);
}

async function resolveProjectsContract(): Promise<ProjectsContractRow[]> {
  const { db, userId, tenantId } = await currentUserContext();
  const memberships = await db
    .select()
    .from(plainwriteProjectMembers)
    .where(
      and(eq(plainwriteProjectMembers.tenantId, tenantId), eq(plainwriteProjectMembers.userId, userId)),
    );
  const projectIds = memberships.map((membership) => membership.projectId);
  if (projectIds.length === 0) return [];

  const roleByProjectId = new Map(memberships.map((m) => [m.projectId, m.role]));
  const projects = await db
    .select()
    .from(plainwriteProjects)
    .where(and(eq(plainwriteProjects.tenantId, tenantId), inArray(plainwriteProjects.id, projectIds)));

  return projects
    .filter((project) => !project.archivedAt)
    .map((project) => ({
      id: project.id,
      name: project.name,
      repoOwner: project.repoOwner,
      repoName: project.repoName,
      branch: project.branch,
      isPrivate: project.isPrivate,
      archivedAt: project.archivedAt,
      currentUserRole: roleByProjectId.get(project.id) ?? 'viewer',
    }));
}

async function resolveContentIndexContract(): Promise<ContentIndexContractRow[]> {
  const { db, userId, tenantId } = await currentUserContext();
  const projectIds = await currentUserProjectIds(db, tenantId, userId);
  if (projectIds.length === 0) return [];

  const projects = await db
    .select()
    .from(plainwriteProjects)
    .where(and(eq(plainwriteProjects.tenantId, tenantId), inArray(plainwriteProjects.id, projectIds)));
  const visibleProjectIds = projects.filter(projectMetadataVisible).map((project) => project.id);
  if (visibleProjectIds.length === 0) return [];

  const files = await db
    .select()
    .from(plainwriteFileCache)
    .where(
      and(
        eq(plainwriteFileCache.tenantId, tenantId),
        inArray(plainwriteFileCache.projectId, visibleProjectIds),
      ),
    );

  // No file body is cached anywhere in Plainwrite today (plainwrite_file_cache
  // is metadata-only — path/collection/filename/sha), so this contract can't
  // include the "searchable snippets" SPEC.md originally described without a
  // live per-file GitHub fetch per row. Metadata-only for now; snippets are
  // deferred until file content is cached.
  return files.map((file) => ({
    projectId: file.projectId,
    path: file.path,
    collection: file.collection,
    filename: file.filename,
    lastSyncedAt: file.lastSyncedAt,
  }));
}

async function resolveDraftsContract(): Promise<DraftsContractRow[]> {
  const { db, userId, tenantId } = await currentUserContext();
  const drafts = await db
    .select()
    .from(plainwriteDrafts)
    .where(and(eq(plainwriteDrafts.tenantId, tenantId), eq(plainwriteDrafts.userId, userId)));

  // Metadata only — content is intentionally omitted per SPEC.md: "Full draft
  // content is never exposed by default and requires an explicit future
  // contract revision."
  return drafts.map((draft) => ({
    id: draft.id,
    projectId: draft.projectId,
    filePath: draft.filePath,
    status: draft.status,
    commitMessage: draft.commitMessage,
    committedAt: draft.committedAt,
    publishedAt: draft.publishedAt,
    updatedAt: draft.updatedAt,
  }));
}
