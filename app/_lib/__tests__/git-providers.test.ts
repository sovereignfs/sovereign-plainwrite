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

interface RecordedCall {
  url: string;
  authorization: string | null;
  method: string;
  body?: unknown;
}

/** Queues responses in call order and records each request's url/method/auth/body. */
function queueFetch(responses: Array<{ ok: boolean; status: number; body: unknown }>) {
  const calls: RecordedCall[] = [];
  let index = 0;
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    const response = responses[index++];
    if (!response) throw new Error('Unexpected fetch call.');
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(url),
      authorization: headers.get('authorization'),
      method: init?.method ?? 'GET',
      ...(typeof init?.body === 'string' ? { body: JSON.parse(init.body) } : {}),
    });
    return new Response(JSON.stringify(response.body), { status: response.status });
  }) as typeof fetch;
  return { impl, calls };
}

describe('GitHubProvider — tree, validation, and publish', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('maps GitHub tree entries and drops entries missing a path/sha or of an unsupported type', async () => {
    const { impl } = queueFetch([
      {
        ok: true,
        status: 200,
        body: {
          tree: [
            { path: 'docs/hello.md', type: 'blob', sha: 'file-sha' },
            { path: 'docs', type: 'tree', sha: 'dir-sha' },
            { type: 'blob', sha: 'missing-path' },
            { path: 'ignored', type: 'commit', sha: 'ignored-sha' },
          ],
        },
      },
    ]);
    global.fetch = impl;
    const provider = getGitProvider('github');

    await expect(provider.getFileTree(project, { token: null })).resolves.toEqual([
      { path: 'docs/hello.md', type: 'file', sha: 'file-sha' },
      { path: 'docs', type: 'directory', sha: 'dir-sha' },
    ]);
  });

  it('validates a PAT and reports push access without exposing the token', async () => {
    const { impl, calls } = queueFetch([
      { ok: true, status: 200, body: { login: 'octocat' } },
      { ok: true, status: 200, body: { permissions: { pull: true, push: true } } },
    ]);
    global.fetch = impl;
    const provider = getGitProvider('github');

    await expect(provider.validatePat('test-token', project)).resolves.toEqual({
      login: 'octocat',
      canPush: true,
    });
    expect(calls.map((call) => call.authorization)).toEqual(['Bearer test-token', 'Bearer test-token']);
  });

  it('rejects a PAT without contents read access', async () => {
    const { impl } = queueFetch([
      { ok: true, status: 200, body: { login: 'octocat' } },
      { ok: true, status: 200, body: { permissions: { pull: false, push: false } } },
    ]);
    global.fetch = impl;
    const provider = getGitProvider('github');

    await expect(provider.validatePat('test-token', project)).rejects.toThrow(
      'GitHub token does not have contents read access for this repository.',
    );
  });

  it('publishes a single file update through the contents API', async () => {
    const { impl, calls } = queueFetch([
      { ok: true, status: 200, body: { content: { sha: 'new-content-sha' }, commit: { sha: 'commit-sha' } } },
    ]);
    global.fetch = impl;
    const provider = getGitProvider('github');

    await expect(
      provider.publishFile(
        project,
        { path: 'docs/hello.md', content: 'hello', baseSha: 'old-sha', message: 'Update hello' },
        { token: 'test-token' },
      ),
    ).resolves.toEqual({ commitSha: 'commit-sha', contentSha: 'new-content-sha' });

    expect(calls[0]).toMatchObject({
      method: 'PUT',
      body: {
        message: 'Update hello',
        content: Buffer.from('hello', 'utf8').toString('base64'),
        branch: 'main',
        sha: 'old-sha',
      },
    });
  });

  it('deletes a file through the contents API when content is null', async () => {
    const { impl, calls } = queueFetch([
      { ok: true, status: 200, body: { commit: { sha: 'delete-commit-sha' } } },
    ]);
    global.fetch = impl;
    const provider = getGitProvider('github');

    await expect(
      provider.publishFile(
        project,
        { path: 'docs/old.md', content: null, baseSha: 'old-sha', message: 'Delete old' },
        { token: 'test-token' },
      ),
    ).resolves.toEqual({ commitSha: 'delete-commit-sha', contentSha: null });

    expect(calls[0]).toMatchObject({
      method: 'DELETE',
      body: { message: 'Delete old', sha: 'old-sha', branch: 'main' },
    });
  });

  it('publishes multiple edits and deletions through one Git data commit', async () => {
    const { impl, calls } = queueFetch([
      { ok: true, status: 200, body: { object: { sha: 'parent-commit-sha' } } },
      { ok: true, status: 200, body: { tree: { sha: 'base-tree-sha' } } },
      { ok: true, status: 201, body: { sha: 'blob-sha' } },
      { ok: true, status: 201, body: { sha: 'next-tree-sha' } },
      { ok: true, status: 201, body: { sha: 'next-commit-sha' } },
      { ok: true, status: 200, body: { object: { sha: 'next-commit-sha' } } },
    ]);
    global.fetch = impl;
    const provider = getGitProvider('github');

    await expect(
      provider.publishFiles(
        project,
        [
          { path: 'docs/hello.md', action: 'update', content: 'hello', baseSha: 'old-sha', message: 'Update hello' },
          { path: 'docs/old.md', action: 'delete', content: null, baseSha: 'delete-sha', message: 'Delete old' },
        ],
        'Publish 2 files',
        { token: 'test-token' },
      ),
    ).resolves.toEqual({
      commitSha: 'next-commit-sha',
      contentSha: null,
      contentShas: { 'docs/hello.md': 'blob-sha' },
    });

    expect(calls.map((call) => [call.method, call.url])).toEqual([
      ['GET', 'https://api.github.com/repos/octo/docs/git/ref/heads%2Fmain'],
      ['GET', 'https://api.github.com/repos/octo/docs/git/commits/parent-commit-sha'],
      ['POST', 'https://api.github.com/repos/octo/docs/git/blobs'],
      ['POST', 'https://api.github.com/repos/octo/docs/git/trees'],
      ['POST', 'https://api.github.com/repos/octo/docs/git/commits'],
      ['PATCH', 'https://api.github.com/repos/octo/docs/git/refs/heads%2Fmain'],
    ]);
    expect(calls[3]?.body).toEqual({
      base_tree: 'base-tree-sha',
      tree: [
        { path: 'docs/hello.md', mode: '100644', type: 'blob', sha: 'blob-sha' },
        { path: 'docs/old.md', mode: '100644', type: 'blob', sha: null },
      ],
    });
  });

  it.each([422, 409])(
    'classifies a non-fast-forward ref update (%s) as a conflict, not a generic branch error',
    async (status) => {
      const { impl } = queueFetch([
        { ok: true, status: 200, body: { object: { sha: 'parent-commit-sha' } } },
        { ok: true, status: 200, body: { tree: { sha: 'base-tree-sha' } } },
        { ok: true, status: 201, body: { sha: 'blob-sha' } },
        { ok: true, status: 201, body: { sha: 'next-tree-sha' } },
        { ok: true, status: 201, body: { sha: 'next-commit-sha' } },
        // Someone else's commit landed on the branch in the meantime — the
        // fast-forward-only PATCH is rejected.
        { ok: false, status, body: { message: 'Update is not a fast forward' } },
      ]);
      global.fetch = impl;
      const provider = getGitProvider('github');

      const error = await provider
        .publishFiles(
          project,
          [{ path: 'docs/hello.md', action: 'update', content: 'hello', baseSha: 'old-sha', message: null }],
          'Publish 1 file',
          { token: 'test-token' },
        )
        .catch((err: unknown) => err);

      expect(error).toBeInstanceOf(GitProviderError);
      expect((error as GitProviderError).message).toContain(
        'the branch changed since this publish started',
      );
    },
  );

  it.each([
    [409, 'GitHub rejected the publish because the remote file changed.'],
    [422, 'GitHub rejected the publish request for this branch or file.'],
    [403, 'GitHub token is missing repository permissions or is rate limited.'],
  ])('normalizes a %s publish failure', async (status, expectedMessage) => {
    const { impl } = queueFetch([{ ok: false, status, body: { message: 'provider detail' } }]);
    global.fetch = impl;
    const provider = getGitProvider('github');

    await expect(
      provider.publishFile(
        project,
        { path: 'docs/hello.md', content: 'hello', baseSha: 'old-sha', message: 'Update hello' },
        { token: 'test-token' },
      ),
    ).rejects.toThrow(expectedMessage);
  });
});
