import { getTableName, type Table } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

const secretsGet = vi.fn(async () => 'test-token');
const publishFiles = vi.fn();
const getFileContent = vi.fn();

vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    auth: { requireSession: vi.fn(async () => ({ user: { id: 'user-1', tenantId: 'tenant-1' } })) },
    db: { getClient: vi.fn(async () => fakeDb) },
    secrets: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), get: secretsGet },
    connections: { disconnect: vi.fn() },
  },
}));

vi.mock('../git-providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../git-providers')>();
  return {
    ...actual,
    getGitProvider: vi.fn(() => ({ getFileContent, publishFiles })),
  };
});

interface Draft {
  id: string;
  filePath: string;
  content: string | null;
  status: string;
  baseSha: string | null;
  commitMessage: string | null;
}

let membershipRow: { role: string } | null = { role: 'editor' };
let projectRow: Record<string, unknown> | null = null;
let credentialRow: Record<string, unknown> | null = null;
let draftRows: Draft[] = [];
const updatedDraftIds: string[] = [];
const insertedPublishEvents: Array<Record<string, unknown>> = [];

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
            if (tableName === 'plainwrite_file_cache') return [];
            return [];
          },
          then: (resolve: (rows: unknown[]) => void) => {
            // publishAllCommittedDrafts' committed-drafts query awaits
            // directly (via .orderBy()) without a further .limit() call.
            resolve(tableName === 'plainwrite_drafts' ? draftRows : []);
          },
        };
      },
    };
  },
  insert(table: Table) {
    const tableName = getTableName(table);
    return {
      values: async (row: Record<string, unknown>) => {
        if (tableName === 'plainwrite_publish_events') insertedPublishEvents.push(row);
      },
    };
  },
  update(table: Table) {
    const tableName = getTableName(table);
    return {
      set: () => ({
        where: async (condition: { queryChunks?: unknown[] }) => {
          if (tableName !== 'plainwrite_drafts') return;
          // Extract which draft id this update targeted so a specific
          // draft's update can be made to fail.
          const id = extractEqValue(condition);
          if (id && failingDraftId && id === failingDraftId) {
            throw new Error('simulated DB failure');
          }
          if (id) updatedDraftIds.push(id);
        },
      }),
    };
  },
};

// drizzle's `eq()` builder shape isn't worth reproducing exactly — tests
// instead identify the target draft by call order via this counter.
let updateCallIndex = 0;
let failingDraftId: string | null = null;
function extractEqValue(_condition: unknown): string | null {
  const draft = draftRows[updateCallIndex];
  updateCallIndex += 1;
  return draft?.id ?? null;
}

beforeEach(() => {
  vi.clearAllMocks();
  updatedDraftIds.length = 0;
  insertedPublishEvents.length = 0;
  updateCallIndex = 0;
  failingDraftId = null;
  membershipRow = { role: 'editor' };
  credentialRow = {
    tenantId: 'tenant-1',
    projectId: 'project-1',
    userId: 'user-1',
    provider: 'github',
    authType: 'pat',
    connectionId: null,
    secretRef: 'secret-1',
    tokenExpiresAt: null,
    providerLogin: 'octocat',
    status: 'connected',
    lastError: null,
    createdAt: 1,
    updatedAt: 1,
  };
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
  draftRows = [
    {
      id: 'draft-1',
      filePath: 'src/content/a.md',
      content: 'A',
      status: 'committed',
      baseSha: 'sha-a',
      commitMessage: null,
    },
    {
      id: 'draft-2',
      filePath: 'src/content/b.md',
      content: 'B',
      status: 'committed',
      baseSha: 'sha-b',
      commitMessage: null,
    },
  ];
  getFileContent.mockImplementation(async (_project: unknown, path: string) => {
    const draft = draftRows.find((d) => d.filePath === path);
    return { content: draft?.content ?? '', sha: draft?.baseSha ?? null };
  });
  publishFiles.mockResolvedValue({
    commitSha: 'commit-1',
    contentSha: null,
    contentShas: { 'src/content/a.md': 'new-sha-a', 'src/content/b.md': 'new-sha-b' },
  });
});

describe('publishAllCommittedDrafts — bookkeeping failure after a successful commit', () => {
  it('reports success (not failure) when GitHub succeeds but one draft update fails', async () => {
    failingDraftId = 'draft-2';
    const { publishAllCommittedDrafts } = await import('../actions');
    const formData = new FormData();

    await expect(publishAllCommittedDrafts('project-1', null, formData)).resolves.toEqual({ ok: true });

    expect(publishFiles).toHaveBeenCalledOnce();
    expect(updatedDraftIds).toEqual(['draft-1']);
    expect(insertedPublishEvents).toHaveLength(1);
    const event = insertedPublishEvents[0];
    expect(event?.status).toBe('success');
    expect(event?.commitSha).toBe('commit-1');
    expect(event?.errorCode).toBe('partial_bookkeeping_failure');
    expect(String(event?.errorSummary)).toContain('src/content/b.md');
  });

  it('reports plain success with no error fields when every draft update succeeds', async () => {
    const { publishAllCommittedDrafts } = await import('../actions');
    const formData = new FormData();

    await publishAllCommittedDrafts('project-1', null, formData);

    expect(updatedDraftIds).toEqual(['draft-1', 'draft-2']);
    expect(insertedPublishEvents).toHaveLength(1);
    const event = insertedPublishEvents[0];
    expect(event?.status).toBe('success');
    expect(event?.errorCode).toBeNull();
    expect(event?.errorSummary).toBeNull();
  });
});
