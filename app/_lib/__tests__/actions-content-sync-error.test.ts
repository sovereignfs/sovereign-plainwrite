import { getTableName, type Table } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    auth: { requireSession: vi.fn(async () => ({ user: { id: 'user-1', tenantId: 'tenant-1' } })) },
    db: { getClient: vi.fn(async () => fakeDb) },
    secrets: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), get: vi.fn() },
    connections: { disconnect: vi.fn() },
  },
}));

vi.mock('../git-providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../git-providers')>();
  return {
    ...actual,
    getGitProvider: vi.fn(() => ({
      getFileTree: vi.fn(async () => {
        throw new Error('GitHub request timed out.');
      }),
    })),
  };
});

let membershipRow: { role: string } | null = { role: 'viewer' };
let projectRow: Record<string, unknown> | null = null;

const fakeDb = {
  select() {
    return {
      from(table: Table) {
        const tableName = getTableName(table);
        // Empty for every table — drives shouldRefreshContentCache(...) to
        // true (no cached lastSyncedAt values) and gives an empty drafts
        // list. where() is both chainable (orderBy/limit) and directly
        // awaitable (then), matching how listContentFiles queries drafts
        // without a terminal .orderBy()/.limit() call.
        const builder = {
          where() {
            return builder;
          },
          orderBy: async () => [],
          limit: async () => {
            if (tableName === 'plainwrite_project_members') return membershipRow ? [membershipRow] : [];
            if (tableName === 'plainwrite_projects') return projectRow ? [projectRow] : [];
            return [];
          },
          then(resolve: (rows: unknown[]) => void) {
            resolve([]);
          },
        };
        return builder;
      },
    };
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  membershipRow = { role: 'viewer' };
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
  };
});

describe('listContentFiles — automatic sync failure surface', () => {
  it('sets syncError instead of silently swallowing an automatic refresh failure', async () => {
    const { listContentFiles } = await import('../actions');

    const result = await listContentFiles('project-1');

    expect(result.files).toEqual([]);
    expect(result.syncError).toBe(
      'Automatic content sync failed. Showing the last successfully synced files.',
    );
  });
});
