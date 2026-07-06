'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { sdk } from '@sovereignfs/sdk';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import {
  plainwriteCollectionSchemas,
  plainwriteCredentials,
  plainwriteDrafts,
  plainwriteFileCache,
  plainwriteProjectMembers,
  plainwriteProjects,
  plainwritePublishEvents,
  type PlainwriteProject,
  type PlainwriteProjectMember,
} from '../../db/schema';
import {
  assertProjectRole,
  isProjectRole,
  parseGitHubRepositoryUrl,
  projectInputDefaults,
  type ProjectRole,
} from '../../lib/project-rules';

// The SDK intentionally returns an opaque dialect-agnostic DB client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = BaseSQLiteDatabase<'async', any, any>;

export interface ProjectSummary extends PlainwriteProject {
  currentUserRole: ProjectRole;
}

export interface ProjectMemberSummary extends PlainwriteProjectMember {
  displayName: string | null;
  email: string | null;
}

export interface ProjectDetail extends ProjectSummary {
  members: ProjectMemberSummary[];
}

interface ProjectContext {
  db: Db;
  userId: string;
  tenantId: string;
}

function now() {
  return Math.floor(Date.now() / 1000);
}

async function getContext(): Promise<ProjectContext> {
  const session = await sdk.auth.requireSession();
  const db = (await sdk.db.getClient()) as Db;
  return { db, userId: session.user.id, tenantId: session.user.tenantId };
}

function formString(formData: FormData, key: string, fallback = '') {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : fallback;
}

function formBoolean(formData: FormData, key: string) {
  return formData.get(key) === 'on';
}

async function getMembership(
  db: Db,
  tenantId: string,
  projectId: string,
  userId: string,
): Promise<ProjectRole | null> {
  const rows = await db
    .select({ role: plainwriteProjectMembers.role })
    .from(plainwriteProjectMembers)
    .where(
      and(
        eq(plainwriteProjectMembers.tenantId, tenantId),
        eq(plainwriteProjectMembers.projectId, projectId),
        eq(plainwriteProjectMembers.userId, userId),
      ),
    )
    .limit(1);
  const role = rows[0]?.role;
  return role && isProjectRole(role) ? role : null;
}

async function requireProjectRole(
  db: Db,
  tenantId: string,
  projectId: string,
  userId: string,
  requiredRole: ProjectRole,
): Promise<ProjectRole> {
  const role = await getMembership(db, tenantId, projectId, userId);
  assertProjectRole(role, requiredRole);
  return role;
}

export async function listProjects(options: { includeArchived?: boolean } = {}) {
  const { db, userId, tenantId } = await getContext();
  const memberships = await db
    .select()
    .from(plainwriteProjectMembers)
    .where(
      and(
        eq(plainwriteProjectMembers.tenantId, tenantId),
        eq(plainwriteProjectMembers.userId, userId),
      ),
    );

  const projectIds = memberships.map((membership) => membership.projectId);
  if (projectIds.length === 0) return [];

  const conditions = [
    eq(plainwriteProjects.tenantId, tenantId),
    inArray(plainwriteProjects.id, projectIds),
  ];
  if (!options.includeArchived) conditions.push(isNull(plainwriteProjects.archivedAt));

  const projects = await db
    .select()
    .from(plainwriteProjects)
    .where(and(...conditions))
    .orderBy(asc(plainwriteProjects.name));

  const roleByProjectId = new Map(
    memberships
      .filter((membership) => isProjectRole(membership.role))
      .map((membership) => [membership.projectId, membership.role as ProjectRole]),
  );

  return projects.flatMap((project): ProjectSummary[] => {
    const currentUserRole = roleByProjectId.get(project.id);
    return currentUserRole ? [{ ...project, currentUserRole }] : [];
  });
}

export async function getProject(projectId: string): Promise<ProjectDetail> {
  const { db, userId, tenantId } = await getContext();
  const currentUserRole = await requireProjectRole(db, tenantId, projectId, userId, 'viewer');
  const rows = await db
    .select()
    .from(plainwriteProjects)
    .where(and(eq(plainwriteProjects.tenantId, tenantId), eq(plainwriteProjects.id, projectId)))
    .limit(1);
  const project = rows[0];
  if (!project) throw new Error('Project not found');

  const memberRows = await db
    .select()
    .from(plainwriteProjectMembers)
    .where(
      and(
        eq(plainwriteProjectMembers.tenantId, tenantId),
        eq(plainwriteProjectMembers.projectId, projectId),
      ),
    )
    .orderBy(asc(plainwriteProjectMembers.joinedAt));

  let directoryRows: Awaited<ReturnType<typeof sdk.directory.resolveUsers>> = [];
  try {
    directoryRows = await sdk.directory.resolveUsers({
      ids: memberRows.map((member) => member.userId),
    });
  } catch {
    directoryRows = [];
  }
  const userById = new Map(directoryRows.map((user) => [user.id, user]));

  return {
    ...project,
    currentUserRole,
    members: memberRows.map((member) => {
      const user = userById.get(member.userId);
      return {
        ...member,
        displayName: user?.name ?? null,
        email: user?.email ?? null,
      };
    }),
  };
}

export async function createProject(formData: FormData) {
  const { db, userId, tenantId } = await getContext();
  const name = formString(formData, 'name');
  if (!name) throw new Error('Project name is required.');

  const repositoryUrl = formString(formData, 'repositoryUrl');
  const repo = parseGitHubRepositoryUrl(repositoryUrl);
  const isPrivate = formBoolean(formData, 'isPrivate');
  const defaults = projectInputDefaults({
    branch: formString(formData, 'branch'),
    pathPrefix: formString(formData, 'pathPrefix'),
    ssgType: formString(formData, 'ssgType'),
    metadataVisibility: formString(formData, 'metadataVisibility'),
    isPrivate,
  });
  const id = randomUUID();
  const ts = now();

  await db.insert(plainwriteProjects).values({
    id,
    tenantId,
    createdBy: userId,
    name,
    description: formString(formData, 'description') || null,
    provider: 'github',
    providerUrl: null,
    repoOwner: repo.owner,
    repoName: repo.name,
    branch: defaults.branch,
    pathPrefix: defaults.pathPrefix,
    ssgType: defaults.ssgType,
    isPrivate,
    metadataVisibility: defaults.metadataVisibility,
    archivedAt: null,
    createdAt: ts,
    updatedAt: ts,
  });

  await db.insert(plainwriteProjectMembers).values({
    tenantId,
    projectId: id,
    userId,
    role: 'owner',
    invitedBy: null,
    joinedAt: ts,
  });

  revalidatePath('/plainwrite');
  redirect(`/plainwrite/${id}`);
}

export async function updateProjectSettings(projectId: string, formData: FormData) {
  const { db, userId, tenantId } = await getContext();
  await requireProjectRole(db, tenantId, projectId, userId, 'owner');
  const isPrivate = formBoolean(formData, 'isPrivate');
  const defaults = projectInputDefaults({
    branch: formString(formData, 'branch'),
    pathPrefix: formString(formData, 'pathPrefix'),
    ssgType: formString(formData, 'ssgType'),
    metadataVisibility: formString(formData, 'metadataVisibility'),
    isPrivate,
  });

  await db
    .update(plainwriteProjects)
    .set({
      name: formString(formData, 'name'),
      description: formString(formData, 'description') || null,
      branch: defaults.branch,
      pathPrefix: defaults.pathPrefix,
      ssgType: defaults.ssgType,
      isPrivate,
      metadataVisibility: defaults.metadataVisibility,
      updatedAt: now(),
    })
    .where(and(eq(plainwriteProjects.tenantId, tenantId), eq(plainwriteProjects.id, projectId)));

  revalidateProject(projectId);
}

export async function archiveProject(projectId: string) {
  const { db, userId, tenantId } = await getContext();
  await requireProjectRole(db, tenantId, projectId, userId, 'owner');
  await db
    .update(plainwriteProjects)
    .set({ archivedAt: now(), updatedAt: now() })
    .where(and(eq(plainwriteProjects.tenantId, tenantId), eq(plainwriteProjects.id, projectId)));
  revalidateProject(projectId);
}

export async function restoreProject(projectId: string) {
  const { db, userId, tenantId } = await getContext();
  await requireProjectRole(db, tenantId, projectId, userId, 'owner');
  await db
    .update(plainwriteProjects)
    .set({ archivedAt: null, updatedAt: now() })
    .where(and(eq(plainwriteProjects.tenantId, tenantId), eq(plainwriteProjects.id, projectId)));
  revalidateProject(projectId);
}

export async function hardDeleteProject(projectId: string, formData: FormData) {
  const { db, userId, tenantId } = await getContext();
  await requireProjectRole(db, tenantId, projectId, userId, 'owner');
  if (formString(formData, 'confirm') !== 'DELETE') {
    throw new Error('Type DELETE to permanently delete the project.');
  }

  await db
    .delete(plainwritePublishEvents)
    .where(and(eq(plainwritePublishEvents.tenantId, tenantId), eq(plainwritePublishEvents.projectId, projectId)));
  await db
    .delete(plainwriteCollectionSchemas)
    .where(and(eq(plainwriteCollectionSchemas.tenantId, tenantId), eq(plainwriteCollectionSchemas.projectId, projectId)));
  await db
    .delete(plainwriteDrafts)
    .where(and(eq(plainwriteDrafts.tenantId, tenantId), eq(plainwriteDrafts.projectId, projectId)));
  await db
    .delete(plainwriteFileCache)
    .where(and(eq(plainwriteFileCache.tenantId, tenantId), eq(plainwriteFileCache.projectId, projectId)));
  await db
    .delete(plainwriteCredentials)
    .where(and(eq(plainwriteCredentials.tenantId, tenantId), eq(plainwriteCredentials.projectId, projectId)));
  await db
    .delete(plainwriteProjectMembers)
    .where(and(eq(plainwriteProjectMembers.tenantId, tenantId), eq(plainwriteProjectMembers.projectId, projectId)));
  await db
    .delete(plainwriteProjects)
    .where(and(eq(plainwriteProjects.tenantId, tenantId), eq(plainwriteProjects.id, projectId)));

  revalidatePath('/plainwrite');
  redirect('/plainwrite');
}

export async function inviteProjectMember(projectId: string, formData: FormData) {
  const { db, userId, tenantId } = await getContext();
  await requireProjectRole(db, tenantId, projectId, userId, 'owner');
  const invitedUserId = formString(formData, 'userId');
  const role = formString(formData, 'role');
  if (!invitedUserId) throw new Error('User ID is required.');
  if (!isProjectRole(role)) throw new Error('Invalid project role.');

  const existing = await db
    .select()
    .from(plainwriteProjectMembers)
    .where(
      and(
        eq(plainwriteProjectMembers.tenantId, tenantId),
        eq(plainwriteProjectMembers.projectId, projectId),
        eq(plainwriteProjectMembers.userId, invitedUserId),
      ),
    )
    .limit(1);

  if (existing.length) {
    await db
      .update(plainwriteProjectMembers)
      .set({ role })
      .where(
        and(
          eq(plainwriteProjectMembers.tenantId, tenantId),
          eq(plainwriteProjectMembers.projectId, projectId),
          eq(plainwriteProjectMembers.userId, invitedUserId),
        ),
      );
  } else {
    await db.insert(plainwriteProjectMembers).values({
      tenantId,
      projectId,
      userId: invitedUserId,
      role,
      invitedBy: userId,
      joinedAt: now(),
    });
  }

  revalidateProject(projectId);
}

export async function removeProjectMember(projectId: string, memberUserId: string) {
  const { db, userId, tenantId } = await getContext();
  await requireProjectRole(db, tenantId, projectId, userId, 'owner');

  const members = await db
    .select()
    .from(plainwriteProjectMembers)
    .where(
      and(
        eq(plainwriteProjectMembers.tenantId, tenantId),
        eq(plainwriteProjectMembers.projectId, projectId),
      ),
    );
  const target = members.find((member) => member.userId === memberUserId);
  if (!target) return;
  const ownerCount = members.filter((member) => member.role === 'owner').length;
  if (target.userId === userId && target.role === 'owner' && ownerCount <= 1) {
    throw new Error('The last owner cannot remove themselves.');
  }

  await db
    .delete(plainwriteProjectMembers)
    .where(
      and(
        eq(plainwriteProjectMembers.tenantId, tenantId),
        eq(plainwriteProjectMembers.projectId, projectId),
        eq(plainwriteProjectMembers.userId, memberUserId),
      ),
    );

  revalidateProject(projectId);
}

export async function requireEditAccess(projectId: string) {
  const { db, userId, tenantId } = await getContext();
  return requireProjectRole(db, tenantId, projectId, userId, 'editor');
}

export async function requirePublishAccess(projectId: string) {
  const { db, userId, tenantId } = await getContext();
  return requireProjectRole(db, tenantId, projectId, userId, 'editor');
}

function revalidateProject(projectId: string) {
  revalidatePath('/plainwrite');
  revalidatePath(`/plainwrite/${projectId}`);
  revalidatePath(`/plainwrite/${projectId}/settings`);
}
