import { describe, expect, it } from 'vitest';
import { GitHubProvider } from '../providers/github';
import type { PlainwriteProjectRef } from '../providers/types';

const project: PlainwriteProjectRef = {
  id: 'project-1',
  provider: 'github',
  providerUrl: null,
  repoOwner: 'sovereignfs',
  repoName: 'site',
  branch: 'main',
  pathPrefix: 'src/content',
};

describe('GitHubProvider', () => {
  it('maps GitHub tree entries into provider tree entries', async () => {
    const provider = new GitHubProvider(mockFetch([
      {
        ok: true,
        status: 200,
        body: {
          tree: [
            { path: 'src/content/blog/hello.md', type: 'blob', sha: 'file-sha' },
            { path: 'src/content/blog', type: 'tree', sha: 'dir-sha' },
            { type: 'blob', sha: 'missing-path' },
            { path: 'ignored', type: 'commit', sha: 'ignored-sha' },
          ],
        },
      },
    ]));

    await expect(provider.getFileTree(project, { authType: 'pat', token: null, providerLogin: null }))
      .resolves.toEqual([
        { path: 'src/content/blog/hello.md', type: 'file', sha: 'file-sha' },
        { path: 'src/content/blog', type: 'directory', sha: 'dir-sha' },
      ]);
  });

  it('fetches and decodes file content with token authorization', async () => {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    const provider = new GitHubProvider(
      mockFetch(
        [
          {
            ok: true,
            status: 200,
            body: {
              content: Buffer.from('hello').toString('base64'),
              encoding: 'base64',
              sha: 'content-sha',
            },
          },
        ],
        calls,
      ),
    );

    await expect(
      provider.getFileContent(project, 'src/content/blog/hello world.md', {
        authType: 'pat',
        token: 'test-token',
        providerLogin: null,
      }),
    ).resolves.toEqual({ content: 'hello', sha: 'content-sha' });
    expect(calls[0]).toEqual({
      url: 'https://api.github.com/repos/sovereignfs/site/contents/src/content/blog/hello%20world.md?ref=main',
      authorization: 'Bearer test-token',
    });
  });

  it('validates PAT repository access without exposing the token', async () => {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    const provider = new GitHubProvider(
      mockFetch(
        [
          { ok: true, status: 200, body: { login: 'octocat' } },
          { ok: true, status: 200, body: { permissions: { pull: true, push: true } } },
        ],
        calls,
      ),
    );

    await expect(provider.validatePat('test-token', project)).resolves.toEqual({
      login: 'octocat',
      canPush: true,
    });
    expect(calls.map((call) => call.authorization)).toEqual([
      'Bearer test-token',
      'Bearer test-token',
    ]);
  });

  it('publishes a single file through the GitHub contents API', async () => {
    const calls: Array<{ url: string; authorization: string | null; method?: string; body?: unknown }> =
      [];
    const provider = new GitHubProvider(
      mockFetch(
        [
          {
            ok: true,
            status: 200,
            body: {
              content: { sha: 'new-content-sha' },
              commit: { sha: 'commit-sha' },
            },
          },
        ],
        calls,
      ),
    );

    await expect(
      provider.publishFile(
        project,
        {
          path: 'src/content/blog/hello world.md',
          action: 'update',
          content: 'hello',
          baseSha: 'old-content-sha',
          message: 'Update hello',
        },
        { authType: 'pat', token: 'test-token', providerLogin: null },
      ),
    ).resolves.toEqual({ commitSha: 'commit-sha', contentSha: 'new-content-sha' });

    expect(calls[0]).toEqual({
      url: 'https://api.github.com/repos/sovereignfs/site/contents/src/content/blog/hello%20world.md',
      authorization: 'Bearer test-token',
      method: 'PUT',
      body: {
        message: 'Update hello',
        content: Buffer.from('hello').toString('base64'),
        branch: 'main',
        sha: 'old-content-sha',
      },
    });
  });

  it('deletes a file through the GitHub contents API', async () => {
    const calls: Array<{ url: string; authorization: string | null; method?: string; body?: unknown }> =
      [];
    const provider = new GitHubProvider(
      mockFetch(
        [
          {
            ok: true,
            status: 200,
            body: {
              commit: { sha: 'delete-commit-sha' },
            },
          },
        ],
        calls,
      ),
    );

    await expect(
      provider.deleteFile(project, 'src/content/blog/old.md', 'old-content-sha', 'Delete old', {
        authType: 'pat',
        token: 'test-token',
        providerLogin: null,
      }),
    ).resolves.toEqual({ commitSha: 'delete-commit-sha', contentSha: null });

    expect(calls[0]).toEqual({
      url: 'https://api.github.com/repos/sovereignfs/site/contents/src/content/blog/old.md',
      authorization: 'Bearer test-token',
      method: 'DELETE',
      body: {
        message: 'Delete old',
        sha: 'old-content-sha',
        branch: 'main',
      },
    });
  });

  it('normalizes GitHub permission failures', async () => {
    const provider = new GitHubProvider(
      mockFetch([{ ok: false, status: 404, body: { message: 'private detail' } }]),
    );

    await expect(
      provider.getFileTree(project, { authType: 'pat', token: 'bad-token', providerLogin: null }),
    ).rejects.toThrow('GitHub repository was not found or the token cannot access it.');
  });

  it('normalizes publish conflicts without provider response details', async () => {
    const provider = new GitHubProvider(
      mockFetch([{ ok: false, status: 409, body: { message: 'sha does not match' } }]),
    );

    await expect(
      provider.publishFile(
        project,
        {
          path: 'src/content/blog/hello.md',
          action: 'update',
          content: 'hello',
          baseSha: 'stale-sha',
          message: 'Update hello',
        },
        { authType: 'pat', token: 'test-token', providerLogin: null },
      ),
    ).rejects.toThrow('GitHub rejected the publish because the remote file changed.');
  });

  it('normalizes protected branch or invalid publish requests', async () => {
    const provider = new GitHubProvider(
      mockFetch([{ ok: false, status: 422, body: { message: 'branch is protected' } }]),
    );

    await expect(
      provider.publishFile(
        project,
        {
          path: 'src/content/blog/hello.md',
          action: 'update',
          content: 'hello',
          baseSha: 'old-sha',
          message: 'Update hello',
        },
        { authType: 'pat', token: 'test-token', providerLogin: null },
      ),
    ).rejects.toThrow('GitHub rejected the publish request for this branch or file.');
  });

  it('normalizes missing scope or rate-limit publish failures', async () => {
    const provider = new GitHubProvider(
      mockFetch([{ ok: false, status: 403, body: { message: 'resource not accessible' } }]),
    );

    await expect(
      provider.publishFile(
        project,
        {
          path: 'src/content/blog/hello.md',
          action: 'update',
          content: 'hello',
          baseSha: 'old-sha',
          message: 'Update hello',
        },
        { authType: 'pat', token: 'test-token', providerLogin: null },
      ),
    ).rejects.toThrow('GitHub token is missing repository permissions or is rate limited.');
  });
});

function mockFetch(
  responses: Array<{ ok: boolean; status: number; body: unknown }>,
  calls: Array<{ url: string; authorization: string | null; method?: string; body?: unknown }> = [],
) {
  let index = 0;
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const response = responses[index++];
    if (!response) throw new Error('Unexpected fetch call.');
    const headers = new Headers(init?.headers);
    calls.push({
      url: String(url),
      authorization: headers.get('authorization'),
      ...(init?.method ? { method: init.method } : {}),
      ...(typeof init?.body === 'string' ? { body: JSON.parse(init.body) } : {}),
    });
    return {
      ok: response.ok,
      status: response.status,
      json: async () => response.body,
    } as Response;
  }) as typeof fetch;
}
