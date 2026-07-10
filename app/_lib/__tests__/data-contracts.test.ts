import { getTableName, type Table } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const capturedResolvers: Record<string, (params?: unknown) => Promise<unknown[]>> = {};
const provide = vi.fn((contract: string, resolver: (params?: unknown) => Promise<unknown[]>) => {
  capturedResolvers[contract] = resolver;
});

vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    auth: { requireSession: vi.fn(async () => ({ user: { id: 'user-1', tenantId: 'tenant-1' } })) },
    db: { getClient: vi.fn(async () => fakeDb) },
    data: { provide },
  },
}));

let membershipRows: Array<{ projectId: string; userId: string; role: string; tenantId: string }> = [];
let projectRows: Array<Record<string, unknown>> = [];
let fileCacheRows: Array<Record<string, unknown>> = [];
let draftRows: Array<Record<string, unknown>> = [];

const fakeDb = {
  select() {
    return {
      from(table: Table) {
        const tableName = getTableName(table);
        return {
          where: async () => {
            if (tableName === 'plainwrite_project_members') return membershipRows;
            if (tableName === 'plainwrite_projects') return projectRows;
            if (tableName === 'plainwrite_file_cache') return fileCacheRows;
            if (tableName === 'plainwrite_drafts') return draftRows;
            return [];
          },
        };
      },
    };
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  membershipRows = [];
  projectRows = [];
  fileCacheRows = [];
  draftRows = [];
});

describe('plainwrite.projects', () => {
  it('returns only non-archived projects the current user is a member of, with their role', async () => {
    const { registerDataContracts } = await import('../data-contracts');
    registerDataContracts();

    membershipRows = [{ tenantId: 'tenant-1', projectId: 'p1', userId: 'user-1', role: 'editor' }];
    projectRows = [
      {
        id: 'p1',
        name: 'Blog',
        repoOwner: 'octo',
        repoName: 'blog',
        branch: 'main',
        isPrivate: false,
        metadataVisibility: 'all_members',
        archivedAt: null,
      },
      {
        id: 'p2',
        name: 'Archived one',
        repoOwner: 'octo',
        repoName: 'old',
        branch: 'main',
        isPrivate: false,
        metadataVisibility: 'all_members',
        archivedAt: 123,
      },
    ];

    const rows = await capturedResolvers['plainwrite.projects']?.();

    expect(rows).toEqual([
      {
        id: 'p1',
        name: 'Blog',
        repoOwner: 'octo',
        repoName: 'blog',
        branch: 'main',
        isPrivate: false,
        archivedAt: null,
        currentUserRole: 'editor',
      },
    ]);
  });

  it('returns nothing when the user has no memberships', async () => {
    const { registerDataContracts } = await import('../data-contracts');
    registerDataContracts();
    membershipRows = [];

    const rows = await capturedResolvers['plainwrite.projects']?.();

    expect(rows).toEqual([]);
  });
});

describe('plainwrite.content-index', () => {
  it('includes file metadata for a public project', async () => {
    const { registerDataContracts } = await import('../data-contracts');
    registerDataContracts();

    membershipRows = [{ tenantId: 'tenant-1', projectId: 'p1', userId: 'user-1', role: 'viewer' }];
    projectRows = [
      {
        id: 'p1',
        isPrivate: false,
        metadataVisibility: 'members_with_credentials',
      },
    ];
    fileCacheRows = [
      { projectId: 'p1', path: 'src/content/a.md', collection: null, filename: 'a.md', lastSyncedAt: 1 },
    ];

    const rows = await capturedResolvers['plainwrite.content-index']?.();

    expect(rows).toEqual([
      { projectId: 'p1', path: 'src/content/a.md', collection: null, filename: 'a.md', lastSyncedAt: 1 },
    ]);
  });

  it('excludes file metadata for a private project unless visibility is all_members', async () => {
    const { registerDataContracts } = await import('../data-contracts');
    registerDataContracts();

    membershipRows = [{ tenantId: 'tenant-1', projectId: 'p1', userId: 'user-1', role: 'viewer' }];
    projectRows = [
      {
        id: 'p1',
        isPrivate: true,
        metadataVisibility: 'members_with_credentials',
      },
    ];
    fileCacheRows = [
      { projectId: 'p1', path: 'src/content/secret.md', collection: null, filename: 'secret.md', lastSyncedAt: 1 },
    ];

    const rows = await capturedResolvers['plainwrite.content-index']?.();

    expect(rows).toEqual([]);
  });

  it('includes a private project when visibility is all_members', async () => {
    const { registerDataContracts } = await import('../data-contracts');
    registerDataContracts();

    membershipRows = [{ tenantId: 'tenant-1', projectId: 'p1', userId: 'user-1', role: 'viewer' }];
    projectRows = [{ id: 'p1', isPrivate: true, metadataVisibility: 'all_members' }];
    fileCacheRows = [
      { projectId: 'p1', path: 'src/content/open.md', collection: null, filename: 'open.md', lastSyncedAt: 1 },
    ];

    const rows = await capturedResolvers['plainwrite.content-index']?.();

    expect(rows).toHaveLength(1);
  });
});

describe('plainwrite.drafts', () => {
  it('returns the current user\'s draft metadata without content', async () => {
    const { registerDataContracts } = await import('../data-contracts');
    registerDataContracts();

    draftRows = [
      {
        id: 'd1',
        projectId: 'p1',
        filePath: 'src/content/a.md',
        content: 'secret draft body',
        status: 'draft',
        commitMessage: null,
        committedAt: null,
        publishedAt: null,
        updatedAt: 5,
      },
    ];

    const rows = await capturedResolvers['plainwrite.drafts']?.();

    expect(rows).toEqual([
      {
        id: 'd1',
        projectId: 'p1',
        filePath: 'src/content/a.md',
        status: 'draft',
        commitMessage: null,
        committedAt: null,
        publishedAt: null,
        updatedAt: 5,
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain('secret draft body');
  });
});
