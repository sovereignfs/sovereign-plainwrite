import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGitProvider, GitProviderError } from '../git-providers';
import type { PlainwriteProject } from '../../_db/schema';

const project = {
  id: 'project-1',
  repoOwner: 'octo',
  repoName: 'docs',
  branch: 'main',
  provider: 'github',
} as PlainwriteProject;

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

describe('GitHubProvider.getFileContent error classification', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('marks a 404 response as notFound so callers can treat it as a new file', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse(404, {}));
    const provider = getGitProvider('github');

    const error = await provider
      .getFileContent(project, 'docs/hello.md', { token: 'tok' })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(GitProviderError);
    expect((error as GitProviderError).notFound).toBe(true);
    expect((error as GitProviderError).status).toBe(404);
  });

  it('does NOT mark a rate-limit (403) response as notFound', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse(403, {}));
    const provider = getGitProvider('github');

    const error = await provider
      .getFileContent(project, 'docs/hello.md', { token: 'tok' })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(GitProviderError);
    expect((error as GitProviderError).notFound).toBe(false);
    expect((error as GitProviderError).status).toBe(403);
  });

  it('does NOT mark a server error (500) response as notFound', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse(500, {}));
    const provider = getGitProvider('github');

    const error = await provider
      .getFileContent(project, 'docs/hello.md', { token: 'tok' })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(GitProviderError);
    expect((error as GitProviderError).notFound).toBe(false);
    expect((error as GitProviderError).status).toBe(500);
  });

  it('does NOT mark an auth failure (401) response as notFound', async () => {
    vi.mocked(global.fetch).mockResolvedValue(jsonResponse(401, {}));
    const provider = getGitProvider('github');

    const error = await provider
      .getFileContent(project, 'docs/hello.md', { token: 'tok' })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(GitProviderError);
    expect((error as GitProviderError).notFound).toBe(false);
    expect((error as GitProviderError).status).toBe(401);
  });

  it('throws a clear error for files over the 1 MB contents-API limit', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse(200, { encoding: 'none', sha: 'abc123' }),
    );
    const provider = getGitProvider('github');

    await expect(provider.getFileContent(project, 'assets/big.md', { token: 'tok' })).rejects.toThrow(
      /1 MB/,
    );
  });

  it('resolves with content and sha on success', async () => {
    const content = Buffer.from('# Hello', 'utf8').toString('base64');
    vi.mocked(global.fetch).mockResolvedValue(
      jsonResponse(200, { content, encoding: 'base64', sha: 'sha-1' }),
    );
    const provider = getGitProvider('github');

    const result = await provider.getFileContent(project, 'docs/hello.md', { token: 'tok' });

    expect(result).toEqual({ content: '# Hello', sha: 'sha-1' });
  });
});
