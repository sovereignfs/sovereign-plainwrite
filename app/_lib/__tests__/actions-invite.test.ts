import { getTableName, type Table } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

const resolveUsers = vi.fn();

vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    auth: { requireSession: vi.fn(async () => ({ user: { id: 'owner-1', tenantId: 'tenant-1' } })) },
    db: { getClient: vi.fn(async () => fakeDb) },
    directory: { resolveUsers },
    secrets: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), get: vi.fn() },
    connections: { disconnect: vi.fn() },
  },
}));

// requireProjectRole's own-role lookup and inviteProjectMember's
// existing-membership lookup both query plainwrite_project_members with
// .limit(1) but for different users — the fake can't distinguish them by
// predicate, so it answers by call order instead: 1st call = current user's
// role, 2nd call = the invited user's existing membership (if any).
let membershipRow: { role: string } | null = { role: 'owner' };
let existingInvitedMemberRow: Record<string, unknown> | null = null;
let projectMemberLimitCalls = 0;
const insertedMembers: Array<Record<string, unknown>> = [];

const fakeDb = {
  select() {
    return {
      from(table: Table) {
        const tableName = getTableName(table);
        return {
          where() {
            return this;
          },
          limit: async () => {
            if (tableName !== 'plainwrite_project_members') return [];
            projectMemberLimitCalls += 1;
            if (projectMemberLimitCalls === 1) return membershipRow ? [membershipRow] : [];
            return existingInvitedMemberRow ? [existingInvitedMemberRow] : [];
          },
        };
      },
    };
  },
  insert(table: Table) {
    const tableName = getTableName(table);
    return {
      values: async (row: Record<string, unknown>) => {
        if (tableName === 'plainwrite_project_members') insertedMembers.push(row);
      },
    };
  },
  update() {
    return {
      set: () => ({
        where: async () => {},
      }),
    };
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  insertedMembers.length = 0;
  membershipRow = { role: 'owner' };
  existingInvitedMemberRow = null;
  projectMemberLimitCalls = 0;
});

describe('inviteProjectMember — directory validation', () => {
  it('rejects an unknown user ID instead of inserting a phantom member', async () => {
    resolveUsers.mockResolvedValue([]);
    const { inviteProjectMember } = await import('../actions');
    const formData = new FormData();
    formData.set('userId', 'typo-d-user-id');
    formData.set('role', 'editor');

    await expect(inviteProjectMember('project-1', formData)).rejects.toThrow(
      'No active user found with that ID.',
    );
    expect(insertedMembers).toHaveLength(0);
  });

  it('invites a user the directory resolves', async () => {
    resolveUsers.mockResolvedValue([{ id: 'user-2', name: 'Jamie', email: 'jamie@example.com' }]);
    const { inviteProjectMember } = await import('../actions');
    const formData = new FormData();
    formData.set('userId', 'user-2');
    formData.set('role', 'editor');

    await inviteProjectMember('project-1', formData);

    expect(insertedMembers).toHaveLength(1);
    expect(insertedMembers[0]?.userId).toBe('user-2');
    expect(resolveUsers).toHaveBeenCalledWith({ ids: ['user-2'] });
  });
});
