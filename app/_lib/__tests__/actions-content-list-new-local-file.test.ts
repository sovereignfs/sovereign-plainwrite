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

const nowSeconds = Math.floor(Date.now() / 1000);

let membershipRow: { role: string } | null = { role: 'editor' };
let projectRow: Record<string, unknown> | null = null;
let fileCacheRows: Record<string, unknown>[] = [];
let draftRows: Record<string, unknown>[] = [];

const fakeDb = {
  select() {
    return {
      from(table: Table) {
        const tableName = getTableName(table);
        const builder = {
          where() {
            return builder;
          },
          orderBy: async () => {
            if (tableName === 'plainwrite_file_cache') return fileCacheRows;
            return [];
          },
          limit: async () => {
            if (tableName === 'plainwrite_project_members') return membershipRow ? [membershipRow] : [];
            if (tableName === 'plainwrite_projects') return projectRow ? [projectRow] : [];
            if (tableName === 'plainwrite_credentials') return [];
            return [];
          },
          then(resolve: (rows: unknown[]) => void) {
            if (tableName === 'plainwrite_drafts') return resolve(draftRows);
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
  membershipRow = { role: 'editor' };
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
    metadataVisibility: 'all_members',
  };
  fileCacheRows = [
    {
      id: 'file-1',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      path: 'src/content/blog/existing-post.md',
      collection: 'blog',
      filename: 'existing-post.md',
      sha: 'sha-1',
      lastSyncedAt: nowSeconds,
    },
  ];
  draftRows = [
    {
      id: 'draft-1',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      filePath: 'src/content/blog/hello-world.md',
      userId: 'user-1',
      content: '# Hello world',
      status: 'draft',
      commitMessage: null,
      baseSha: null,
      updatedAt: nowSeconds,
    },
  ];
});

describe('listContentFiles — brand-new local file with no file-cache row', () => {
  it('surfaces a draft for a file created via "New content file" that was never synced from GitHub', async () => {
    const { listContentFiles } = await import('../actions');

    const result = await listContentFiles('project-1');

    expect(result.files.map((file) => file.path)).toEqual([
      'src/content/blog/existing-post.md',
      'src/content/blog/hello-world.md',
    ]);
    const newFile = result.files.find((file) => file.path === 'src/content/blog/hello-world.md');
    expect(newFile?.status).toBe('draft');
    expect(newFile?.collection).toBe('blog');
    expect(newFile?.filename).toBe('hello-world.md');
  });

  it('does not duplicate a file that already has both a cache row and a draft', async () => {
    draftRows.push({
      id: 'draft-2',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      filePath: 'src/content/blog/existing-post.md',
      userId: 'user-1',
      content: '# Updated',
      status: 'committed',
      commitMessage: null,
      baseSha: 'sha-1',
      updatedAt: nowSeconds,
    });
    const { listContentFiles } = await import('../actions');

    const result = await listContentFiles('project-1');

    const matches = result.files.filter((file) => file.path === 'src/content/blog/existing-post.md');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.status).toBe('committed');
  });
});
