import { getTableName, type Table } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    auth: { requireSession: vi.fn(async () => ({ user: { id: 'user-1', tenantId: 'tenant-1' } })) },
    db: { getClient: vi.fn(async () => fakeDb) },
    secrets: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), get: vi.fn(async () => 'test-token') },
    connections: { disconnect: vi.fn() },
  },
}));

vi.mock('../git-providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../git-providers')>();
  return {
    ...actual,
    getGitProvider: vi.fn(() => ({
      getFileTree: vi.fn(async () => [
        { path: 'src/content/hello.md', type: 'file', sha: 'sha-1' },
      ]),
    })),
  };
});

let membershipRow: { role: string } | null = { role: 'editor' };
let projectRow: Record<string, unknown> | null = null;
let credentialRow: Record<string, unknown> | null = null;

const events: string[] = [];

const fakeDb = {
  select() {
    return {
      from(table: Table) {
        const tableName = getTableName(table);
        return {
          where() {
            return this;
          },
          orderBy() {
            return this;
          },
          limit: async () => {
            if (tableName === 'plainwrite_project_members') return membershipRow ? [membershipRow] : [];
            if (tableName === 'plainwrite_projects') return projectRow ? [projectRow] : [];
            if (tableName === 'plainwrite_credentials') return credentialRow ? [credentialRow] : [];
            return [];
          },
        };
      },
    };
  },
  delete(table: Table) {
    events.push(`delete:${getTableName(table)}`);
    return { where: async () => {} };
  },
  insert(table: Table) {
    events.push(`insert:${getTableName(table)}`);
    return { values: async () => {} };
  },
  transaction: vi.fn(async (callback: (tx: unknown) => Promise<void>) => {
    events.push('transaction:start');
    await callback(fakeDb);
    events.push('transaction:end');
  }),
};

beforeEach(() => {
  vi.clearAllMocks();
  events.length = 0;
  membershipRow = { role: 'editor' };
  credentialRow = null;
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

describe('syncProjectContent — file cache refresh is transactional', () => {
  it('wraps the delete-then-insert cache refresh in a single db.transaction()', async () => {
    const { syncProjectContent } = await import('../actions');

    await syncProjectContent('project-1');

    expect(fakeDb.transaction).toHaveBeenCalledOnce();
    // Both the delete and the insert must happen inside the transaction
    // (between transaction:start and transaction:end), not before/after it —
    // otherwise a concurrent sync or a crash between the two statements can
    // leave plainwrite_file_cache empty or duplicated.
    const startIndex = events.indexOf('transaction:start');
    const endIndex = events.indexOf('transaction:end');
    const deleteIndex = events.indexOf('delete:plainwrite_file_cache');
    const insertIndex = events.indexOf('insert:plainwrite_file_cache');

    expect(startIndex).toBeGreaterThanOrEqual(0);
    expect(endIndex).toBeGreaterThan(startIndex);
    expect(deleteIndex).toBeGreaterThan(startIndex);
    expect(deleteIndex).toBeLessThan(endIndex);
    expect(insertIndex).toBeGreaterThan(startIndex);
    expect(insertIndex).toBeLessThan(endIndex);
  });
});
