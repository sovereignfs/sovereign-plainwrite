import { Buffer } from 'node:buffer';
import type { PlainwriteProject } from '../_db/schema';

const GITHUB_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Thrown for any failed GitHub API response. `notFound` lets callers
 * distinguish "this path doesn't exist" (safe to treat as a new file) from
 * every other failure (rate limit, auth, network) which must never be
 * silently treated as "no remote content".
 */
export class GitProviderError extends Error {
  readonly status: number;
  readonly notFound: boolean;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GitProviderError';
    this.status = status;
    this.notFound = status === 404;
  }
}

export interface GitCredential {
  token: string | null;
}

export interface GitFileContent {
  content: string;
  sha: string | null;
}

export interface GitTreeEntry {
  path: string;
  type: 'file' | 'directory';
  sha: string;
}

export interface GitUserInfo {
  login: string;
  canPush: boolean;
}

export interface GitPublishResult {
  commitSha: string;
  contentSha: string | null;
  contentShas?: Record<string, string>;
}

export interface GitProviderAdapter {
  getFileTree(project: PlainwriteProject, credential: GitCredential): Promise<GitTreeEntry[]>;
  getFileContent(
    project: PlainwriteProject,
    path: string,
    credential: GitCredential,
  ): Promise<GitFileContent>;
  validatePat(token: string, project: PlainwriteProject): Promise<GitUserInfo>;
  publishFile(
    project: PlainwriteProject,
    file: {
      path: string;
      content: string | null;
      baseSha: string | null;
      message: string;
    },
    credential: GitCredential,
  ): Promise<GitPublishResult>;
  publishFiles(
    project: PlainwriteProject,
    files: Array<{
      path: string;
      action: 'create' | 'update' | 'delete';
      content: string | null;
      baseSha: string | null;
      message: string | null;
    }>,
    message: string,
    credential: GitCredential,
  ): Promise<GitPublishResult>;
}

export function getGitProvider(provider: string): GitProviderAdapter {
  if (provider === 'github') return new GitHubProvider();
  throw new Error(`Git provider "${provider}" is not implemented yet.`);
}

/**
 * Unauthenticated repository lookup for the "Connect a site" wizard, which
 * runs before a project row (and therefore before any credential, which is
 * stored per-project) exists — there's nothing to authenticate with yet.
 * Only ever succeeds for a public repository; a private repo and a
 * genuinely nonexistent one are indistinguishable here (both 404), which is
 * why the wizard's copy hedges ("couldn't find it, or it's private") rather
 * than asserting either.
 */
export async function detectGitHubRepository(
  owner: string,
  repo: string,
): Promise<{ defaultBranch: string } | null> {
  try {
    const body = await fetchGitHubJson<{ default_branch?: string }>(
      `https://api.github.com/repos/${owner}/${repo}`,
    );
    return body.default_branch ? { defaultBranch: body.default_branch } : null;
  } catch (error) {
    if (error instanceof GitProviderError && error.notFound) return null;
    throw error;
  }
}

/** Companion to detectGitHubRepository — same unauthenticated, pre-project constraints. */
export async function detectGitHubRepositoryFiles(
  owner: string,
  repo: string,
  branch: string,
): Promise<GitTreeEntry[]> {
  try {
    const body = await fetchGitHubJson<{
      tree?: Array<{ path?: string; type?: string; sha?: string }>;
    }>(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    return (body.tree ?? []).flatMap((entry): GitTreeEntry[] => {
      if (!entry.path || !entry.sha) return [];
      if (entry.type !== 'blob' && entry.type !== 'tree') return [];
      return [{ path: entry.path, type: entry.type === 'blob' ? 'file' : 'directory', sha: entry.sha }];
    });
  } catch (error) {
    if (error instanceof GitProviderError && error.notFound) return [];
    throw error;
  }
}

class GitHubProvider implements GitProviderAdapter {
  async getFileTree(
    project: PlainwriteProject,
    credential: GitCredential,
  ): Promise<GitTreeEntry[]> {
    const body = await fetchGitHubJson<{
      tree?: Array<{ path?: string; type?: string; sha?: string }>;
    }>(
      `https://api.github.com/repos/${project.repoOwner}/${project.repoName}/git/trees/${encodeURIComponent(project.branch)}?recursive=1`,
      credential.token,
    );

    return (body.tree ?? []).flatMap((entry) => {
      if (!entry.path || !entry.sha) return [];
      if (entry.type !== 'blob' && entry.type !== 'tree') return [];
      return [
        {
          path: entry.path,
          type: entry.type === 'blob' ? 'file' : 'directory',
          sha: entry.sha,
        },
      ];
    });
  }

  async getFileContent(
    project: PlainwriteProject,
    path: string,
    credential: GitCredential,
  ): Promise<GitFileContent> {
    const body = await fetchGitHubJson<{ content?: string; encoding?: string; sha?: string }>(
      `https://api.github.com/repos/${project.repoOwner}/${project.repoName}/contents/${path
        .split('/')
        .map(encodeURIComponent)
        .join('/')}?ref=${encodeURIComponent(project.branch)}`,
      credential.token,
    );
    if (body.encoding === 'none') {
      throw new Error('GitHub file exceeds the 1 MB API size limit and cannot be loaded through Plainwrite.');
    }
    if (!body.content || body.encoding !== 'base64') {
      throw new Error('GitHub file response did not include base64 content.');
    }
    return {
      content: Buffer.from(body.content, 'base64').toString('utf8'),
      sha: body.sha ?? null,
    };
  }

  async validatePat(token: string, project: PlainwriteProject): Promise<GitUserInfo> {
    const [userResponse, repoResponse] = await Promise.all([
      fetchGitHubJson<{ login?: string }>('https://api.github.com/user', token),
      fetchGitHubJson<{ permissions?: { pull?: boolean; push?: boolean } }>(
        `https://api.github.com/repos/${project.repoOwner}/${project.repoName}`,
        token,
      ),
    ]);
    if (!userResponse.login) throw new Error('GitHub token validation did not return a login.');
    if (repoResponse.permissions && !repoResponse.permissions.pull) {
      throw new Error('GitHub token does not have contents read access for this repository.');
    }
    return {
      login: userResponse.login,
      canPush: Boolean(repoResponse.permissions?.push),
    };
  }

  async publishFile(
    project: PlainwriteProject,
    file: {
      path: string;
      content: string | null;
      baseSha: string | null;
      message: string;
    },
    credential: GitCredential,
  ): Promise<GitPublishResult> {
    if (!credential.token) throw new Error('Connect a GitHub token before publishing.');
    if (file.content === null) {
      if (!file.baseSha) throw new Error('Cannot delete a file without a remote base revision.');
      const response = await fetchGitHubJson<GitHubContentsWriteResponse>(
        contentsUrl(project, file.path),
        credential.token,
        {
          method: 'DELETE',
          body: JSON.stringify({
            message: file.message,
            sha: file.baseSha,
            branch: project.branch,
          }),
        },
      );
      return {
        commitSha: response.commit?.sha ?? '',
        contentSha: null,
      };
    }

    const response = await fetchGitHubJson<GitHubContentsWriteResponse>(
      contentsUrl(project, file.path),
      credential.token,
      {
        method: 'PUT',
        body: JSON.stringify({
          message: file.message,
          content: Buffer.from(file.content, 'utf8').toString('base64'),
          branch: project.branch,
          ...(file.baseSha ? { sha: file.baseSha } : {}),
        }),
      },
    );
    if (!response.commit?.sha) throw new Error('GitHub publish response did not include a commit.');
    return {
      commitSha: response.commit.sha,
      contentSha: response.content?.sha ?? null,
    };
  }

  async publishFiles(
    project: PlainwriteProject,
    files: Array<{
      path: string;
      action: 'create' | 'update' | 'delete';
      content: string | null;
      baseSha: string | null;
      message: string | null;
    }>,
    message: string,
    credential: GitCredential,
  ): Promise<GitPublishResult> {
    if (!credential.token) throw new Error('Connect a GitHub token before publishing.');
    if (files.length === 0) throw new Error('Select at least one file to publish.');

    const branchRef = `heads/${project.branch}`;
    const ref = await fetchGitHubJson<{ object?: { sha?: string } }>(
      `https://api.github.com/repos/${project.repoOwner}/${project.repoName}/git/ref/${encodeURIComponent(branchRef)}`,
      credential.token,
    );
    const parentSha = ref.object?.sha;
    if (!parentSha) throw new Error('GitHub branch ref response did not include a commit SHA.');

    const commit = await fetchGitHubJson<{ tree?: { sha?: string } }>(
      `https://api.github.com/repos/${project.repoOwner}/${project.repoName}/git/commits/${parentSha}`,
      credential.token,
    );
    const baseTreeSha = commit.tree?.sha;
    if (!baseTreeSha) throw new Error('GitHub commit response did not include a tree SHA.');

    const contentShas: Record<string, string> = {};
    const tree = await Promise.all(
      files.map(async (file) => {
        if (file.action === 'delete' || file.content === null) {
          return { path: file.path, mode: '100644', type: 'blob', sha: null };
        }

        const blob = await fetchGitHubJson<{ sha?: string }>(
          `https://api.github.com/repos/${project.repoOwner}/${project.repoName}/git/blobs`,
          credential.token,
          {
            method: 'POST',
            body: JSON.stringify({
              content: Buffer.from(file.content, 'utf8').toString('base64'),
              encoding: 'base64',
            }),
          },
        );
        if (!blob.sha) throw new Error(`GitHub blob response did not include a SHA for ${file.path}.`);
        contentShas[file.path] = blob.sha;
        return { path: file.path, mode: '100644', type: 'blob', sha: blob.sha };
      }),
    );

    const nextTree = await fetchGitHubJson<{ sha?: string }>(
      `https://api.github.com/repos/${project.repoOwner}/${project.repoName}/git/trees`,
      credential.token,
      {
        method: 'POST',
        body: JSON.stringify({ base_tree: baseTreeSha, tree }),
      },
    );
    if (!nextTree.sha) throw new Error('GitHub tree response did not include a SHA.');

    const nextCommit = await fetchGitHubJson<{ sha?: string }>(
      `https://api.github.com/repos/${project.repoOwner}/${project.repoName}/git/commits`,
      credential.token,
      {
        method: 'POST',
        body: JSON.stringify({
          message,
          tree: nextTree.sha,
          parents: [parentSha],
        }),
      },
    );
    if (!nextCommit.sha) throw new Error('GitHub commit response did not include a SHA.');

    // The per-file SHA checks in assertNoPublishConflict (actions.ts) run
    // before this call and only narrow the race window — GitHub's tree API
    // has no per-blob compare-and-swap. The real guarantee is here:
    // `force: false` makes this PATCH a fast-forward-only ref update, so it
    // is atomically rejected if *any* commit (from this project or a direct
    // push) landed on the branch after `parentSha` was read above, whether
    // or not it touched the same files. Re-classify that rejection as a
    // conflict rather than the generic per-status-code GitHub error text,
    // since a stale `parentSha` is exactly what "conflict" means here and a
    // "protected branch" message would send the user down the wrong path.
    try {
      await fetchGitHubJson<{ object?: { sha?: string } }>(
        `https://api.github.com/repos/${project.repoOwner}/${project.repoName}/git/refs/${encodeURIComponent(branchRef)}`,
        credential.token,
        {
          method: 'PATCH',
          body: JSON.stringify({ sha: nextCommit.sha, force: false }),
        },
      );
    } catch (error) {
      if (error instanceof GitProviderError && (error.status === 422 || error.status === 409)) {
        throw new GitProviderError(
          'Conflict: the branch changed since this publish started. Sync and try again.',
          error.status,
        );
      }
      throw error;
    }

    return {
      commitSha: nextCommit.sha,
      contentSha: null,
      contentShas,
    };
  }
}

interface GitHubContentsWriteResponse {
  content?: { sha?: string };
  commit?: { sha?: string };
}

async function fetchGitHubJson<T>(
  url: string,
  token?: string | null,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: gitHubHeaders(token, init.headers),
      signal: init.signal ?? AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new GitProviderError('GitHub request timed out.', 0);
    }
    throw error;
  }
  if (!response.ok) {
    throw new GitProviderError(sanitizeGitHubError(response.status), response.status);
  }
  return (await response.json()) as T;
}

function contentsUrl(project: PlainwriteProject, path: string) {
  return `https://api.github.com/repos/${project.repoOwner}/${project.repoName}/contents/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

function gitHubHeaders(token?: string | null, initHeaders?: HeadersInit) {
  const headers = new Headers(initHeaders);
  headers.set('accept', 'application/vnd.github+json');
  headers.set('content-type', 'application/json');
  headers.set('x-github-api-version', '2022-11-28');
  if (token) headers.set('authorization', `Bearer ${token}`);
  return headers;
}

function sanitizeGitHubError(status: number) {
  if (status === 401) return 'GitHub rejected the token. Reconnect with a valid token.';
  if (status === 403) return 'GitHub token is missing repository permissions or is rate limited.';
  if (status === 404) return 'GitHub repository was not found or the token cannot access it.';
  if (status === 409) return 'GitHub rejected the publish because the remote file changed.';
  if (status === 422) return 'GitHub rejected the publish request for this branch or file.';
  return `GitHub request failed with ${status}.`;
}
