import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

vi.mock('@sovereignfs/sdk', () => ({
  sdk: {
    auth: { requireSession: vi.fn(async () => ({ user: { id: 'user-1', tenantId: 'tenant-1' } })) },
    db: { getClient: vi.fn(async () => ({})) },
    secrets: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), get: vi.fn() },
    connections: { disconnect: vi.fn() },
  },
}));

const detectGitHubRepository = vi.fn();
const detectGitHubRepositoryFiles = vi.fn();

vi.mock('../git-providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../git-providers')>();
  return { ...actual, detectGitHubRepository, detectGitHubRepositoryFiles };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('detectRepository — "Connect a site" wizard step 1', () => {
  it('returns branch, suggested path prefix, and a post count for a public repo', async () => {
    detectGitHubRepository.mockResolvedValue({ defaultBranch: 'main' });
    detectGitHubRepositoryFiles.mockResolvedValue([
      { path: 'src/content/blog/one.md', type: 'file', sha: 'a' },
      { path: 'src/content/blog/two.md', type: 'file', sha: 'b' },
      { path: 'README.md', type: 'file', sha: 'c' },
    ]);
    const { detectRepository } = await import('../actions');

    const result = await detectRepository('https://github.com/acme/site');

    expect(result).toEqual({
      ok: true,
      owner: 'acme',
      name: 'site',
      branch: 'main',
      pathPrefix: 'src/content',
      postCount: 2,
    });
  });

  it('falls back to a sensible default prefix when the repo has no markdown content yet', async () => {
    detectGitHubRepository.mockResolvedValue({ defaultBranch: 'main' });
    detectGitHubRepositoryFiles.mockResolvedValue([{ path: 'package.json', type: 'file', sha: 'a' }]);
    const { detectRepository } = await import('../actions');

    const result = await detectRepository('https://github.com/acme/empty-site');

    expect(result).toEqual({
      ok: true,
      owner: 'acme',
      name: 'empty-site',
      branch: 'main',
      pathPrefix: 'src/content',
      postCount: 0,
    });
  });

  it('returns a friendly error for a private or nonexistent repository', async () => {
    detectGitHubRepository.mockResolvedValue(null);
    const { detectRepository } = await import('../actions');

    const result = await detectRepository('https://github.com/acme/private-site');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Couldn't find");
    expect(detectGitHubRepositoryFiles).not.toHaveBeenCalled();
  });

  it('returns a validation error for a malformed repository URL without calling GitHub', async () => {
    const { detectRepository } = await import('../actions');

    const result = await detectRepository('not a url');

    expect(result.ok).toBe(false);
    expect(detectGitHubRepository).not.toHaveBeenCalled();
  });
});
