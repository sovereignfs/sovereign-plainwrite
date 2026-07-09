import { getTableName, type Table } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

const resolveUsers = vi.fn();

vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    auth: { requireSession: vi.fn(async () => ({ user: { id: 'user-1', tenantId: 'tenant-1' } })) },
    db: { getClient: vi.fn(async () => fakeDb) },
    directory: { resolveUsers },
    secrets: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), get: vi.fn() },
    connections: { disconnect: vi.fn() },
  },
}));

let membershipRow: { role: string } | null = { role: 'owner' };
let projectRow: Record<string, unknown> | null = null;
let memberRows: Array<Record<string, unknown>> = [];

const fakeDb = {
  select() {
    return {
      from(table: Table) {
        const tableName = getTableName(table);
        return {
          where() {
            return this;
          },
          orderBy: async () => {
            if (tableName === 'plainwrite_project_members') return memberRows;
            return [];
          },
          limit: async () => {
            if (tableName === 'plainwrite_project_members') return membershipRow ? [membershipRow] : [];
            if (tableName === 'plainwrite_projects') return projectRow ? [projectRow] : [];
            if (tableName === 'plainwrite_credentials') return [];
            return [];
          },
        };
      },
    };
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  membershipRow = { role: 'owner' };
  projectRow = {
    id: 'project-1',
    tenantId: 'tenant-1',
    repoOwner: 'octo',
    repoName: 'docs',
    provider: 'github',
    branch: 'main',
    pathPrefix: 'src/content',
    ssgType: 'astro',
    isPrivate: false,
    archivedAt: null,
  };
  memberRows = [
    { tenantId: 'tenant-1', projectId: 'project-1', userId: 'user-1', role: 'owner', joinedAt: 1 },
  ];
});

describe('getProject — directory lookup failure surface', () => {
  it('sets directoryLookupFailed and falls back to null display fields when resolveUsers throws', async () => {
    resolveUsers.mockRejectedValue(new Error('directory service unavailable'));
    const { getProject } = await import('../actions');

    const project = await getProject('project-1');

    expect(project.directoryLookupFailed).toBe(true);
    expect(project.members).toEqual([
      expect.objectContaining({ userId: 'user-1', displayName: null, email: null }),
    ]);
  });

  it('leaves directoryLookupFailed false and populates display fields on success', async () => {
    resolveUsers.mockResolvedValue([{ id: 'user-1', name: 'Jamie', email: 'jamie@example.com' }]);
    const { getProject } = await import('../actions');

    const project = await getProject('project-1');

    expect(project.directoryLookupFailed).toBe(false);
    expect(project.members).toEqual([
      expect.objectContaining({ userId: 'user-1', displayName: 'Jamie', email: 'jamie@example.com' }),
    ]);
  });
});
