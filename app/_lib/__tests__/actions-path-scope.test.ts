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
            // Path-scope rejection must happen before any other table is
            // read (drafts, file cache, credentials) — fail loudly if a
            // test reaches this branch, since that means the guard ran too
            // late to short-circuit unnecessary work.
            throw new Error(`Unexpected read from table "${tableName}" after path-scope check.`);
          },
        };
      },
    };
  },
  insert() {
    throw new Error('Unexpected write — path-scope rejection must happen before any draft write.');
  },
  update() {
    throw new Error('Unexpected write — path-scope rejection must happen before any draft write.');
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
  };
});

describe('content path scoping', () => {
  it('getEditorState rejects a path outside the project content prefix', async () => {
    const { getEditorState } = await import('../actions');

    await expect(getEditorState('project-1', '.github/workflows/deploy.yml')).rejects.toThrow(
      "File path is outside this project's configured content path.",
    );
  });

  it('getEditorState rejects a path with directory traversal', async () => {
    const { getEditorState } = await import('../actions');

    await expect(getEditorState('project-1', 'src/content/../../etc/passwd')).rejects.toThrow(
      'Invalid file path.',
    );
  });

  it('saveDraft rejects a path outside the project content prefix', async () => {
    const { saveDraft } = await import('../actions');
    const formData = new FormData();
    formData.set('content', 'malicious payload');

    await expect(saveDraft('project-1', '.github/workflows/deploy.yml', formData)).rejects.toThrow(
      "File path is outside this project's configured content path.",
    );
  });

  it('publishCommittedDraft rejects a path outside the project content prefix', async () => {
    const { publishCommittedDraft } = await import('../actions');

    await expect(publishCommittedDraft('project-1', '.github/workflows/deploy.yml')).rejects.toThrow(
      "File path is outside this project's configured content path.",
    );
  });

  it('allows a path inside the project content prefix through to the next check', async () => {
    const { getEditorState } = await import('../actions');

    // The in-scope path clears assertContentPathAllowed and proceeds to read
    // drafts/file-cache tables, which this fake db doesn't stub — so we only
    // assert it does NOT fail with the path-scope error.
    await expect(getEditorState('project-1', 'src/content/blog/hello.md')).rejects.not.toThrow(
      "File path is outside this project's configured content path.",
    );
  });
});
