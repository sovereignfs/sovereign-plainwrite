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
  // NOT exercised — see the "does not use db.transaction()" test below for
  // why: better-sqlite3's native transaction() wrapper synchronously
  // rejects any async callback, and drizzle's better-sqlite3 session passes
  // the callback straight through to it unmodified. There's no callback
  // shape that's valid for both better-sqlite3 (sync only) and Postgres
  // (async only) without dialect-branching, which the SDK's opaque Db type
  // can't do — so refreshProjectContentCache must never call this.
  transaction: vi.fn(),
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

describe('syncProjectContent — file cache refresh', () => {
  it('does not use db.transaction() — better-sqlite3 rejects async transaction callbacks at runtime', async () => {
    const { syncProjectContent } = await import('../actions');

    await syncProjectContent('project-1', null, new FormData());

    expect(fakeDb.transaction).not.toHaveBeenCalled();
  });

  it('deletes the stale cache before inserting the freshly synced rows', async () => {
    const { syncProjectContent } = await import('../actions');

    await syncProjectContent('project-1', null, new FormData());

    const deleteIndex = events.indexOf('delete:plainwrite_file_cache');
    const insertIndex = events.indexOf('insert:plainwrite_file_cache');
    expect(deleteIndex).toBeGreaterThanOrEqual(0);
    expect(insertIndex).toBeGreaterThan(deleteIndex);
  });
});
