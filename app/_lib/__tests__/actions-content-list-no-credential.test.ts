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

let membershipRow: { role: string } | null = { role: 'editor' };
let projectRow: Record<string, unknown> | null = null;
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
          orderBy: async () => [],
          limit: async () => {
            if (tableName === 'plainwrite_project_members') return membershipRow ? [membershipRow] : [];
            if (tableName === 'plainwrite_projects') return projectRow ? [projectRow] : [];
            if (tableName === 'plainwrite_credentials') return [];
            return [];
          },
          then(resolve: (rows: unknown[]) => void) {
            // Mirrors the production query's isNotNull(content) filter —
            // this fake doesn't model per-row WHERE evaluation, so drop
            // pending-delete drafts (null content) here instead.
            if (tableName === 'plainwrite_drafts') {
              return resolve(draftRows.filter((row) => row.content !== null));
            }
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
    isPrivate: true,
    metadataVisibility: 'members_with_credentials',
  };
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
      updatedAt: 1000,
    },
    {
      id: 'draft-2',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      filePath: 'src/content/blog/ready-post.md',
      userId: 'user-1',
      content: '# Ready',
      status: 'committed',
      commitMessage: 'Add ready post',
      baseSha: null,
      updatedAt: 2000,
    },
    {
      id: 'draft-3',
      tenantId: 'tenant-1',
      projectId: 'project-1',
      filePath: 'src/content/blog/deleted-post.md',
      userId: 'user-1',
      content: null,
      status: 'committed',
      commitMessage: 'Delete post',
      baseSha: 'sha-abc',
      updatedAt: 3000,
    },
  ];
});

describe('listContentFiles — private repo without a connected credential', () => {
  it('still surfaces the user’s own local drafts instead of an empty list', async () => {
    const { listContentFiles } = await import('../actions');

    const result = await listContentFiles('project-1');

    expect(result.files.map((file) => file.path)).toEqual([
      'src/content/blog/hello-world.md',
      'src/content/blog/ready-post.md',
    ]);
    expect(result.files[0]?.status).toBe('draft');
    expect(result.files[1]?.status).toBe('committed');
    expect(result.syncError).toMatch(/Connect a GitHub token/);
  });

  it('excludes drafts staged for deletion (null content) from the local-only listing', async () => {
    const { listContentFiles } = await import('../actions');

    const result = await listContentFiles('project-1');

    expect(result.files).toHaveLength(2);
    expect(result.files.some((file) => file.path === 'src/content/blog/deleted-post.md')).toBe(false);
  });
});
