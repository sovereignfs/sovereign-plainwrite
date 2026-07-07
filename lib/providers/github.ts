import { Buffer } from 'node:buffer';
import type {
  GitProviderAdapter,
  OAuthTokens,
  PendingFile,
  PlainwriteCredentialRef,
  PlainwriteProjectRef,
  PublishResult,
  TreeEntry,
} from './types';

function notImplemented(method: string): never {
  throw new Error(`GitHub provider ${method} is not implemented yet. See PLW-005/PLW-007.`);
}

type Fetcher = typeof fetch;

export class GitHubProvider implements GitProviderAdapter {
  constructor(private readonly fetcher: Fetcher = fetch) {}

  async getFileTree(
    project: PlainwriteProjectRef,
    credential: PlainwriteCredentialRef,
  ): Promise<TreeEntry[]> {
    const body = await this.fetchGitHubJson<{
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
    project: PlainwriteProjectRef,
    path: string,
    credential: PlainwriteCredentialRef,
  ): Promise<{ content: string; sha: string }> {
    const body = await this.fetchGitHubJson<{ content?: string; encoding?: string; sha?: string }>(
      `https://api.github.com/repos/${project.repoOwner}/${project.repoName}/contents/${path
        .split('/')
        .map(encodeURIComponent)
        .join('/')}?ref=${encodeURIComponent(project.branch)}`,
      credential.token,
    );
    if (!body.content || body.encoding !== 'base64' || !body.sha) {
      throw new Error('GitHub file response did not include base64 content.');
    }
    return {
      content: Buffer.from(body.content, 'base64').toString('utf8'),
      sha: body.sha,
    };
  }

  async publishFile(
    project: PlainwriteProjectRef,
    file: PendingFile,
    credential: PlainwriteCredentialRef,
  ): Promise<PublishResult> {
    if (!credential.token) throw new Error('Connect a GitHub token before publishing.');
    const message = file.message ?? `Update ${file.path.split('/').at(-1) ?? file.path}`;
    if (file.action === 'delete' || file.content === null) {
      if (!file.baseSha) throw new Error('Cannot delete a file without a remote base revision.');
      return this.deleteFile(project, file.path, file.baseSha, message, credential);
    }

    const response = await this.fetchGitHubJson<GitHubContentsWriteResponse>(
      contentsUrl(project, file.path),
      credential.token,
      {
        method: 'PUT',
        body: JSON.stringify({
          message,
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
    _project: PlainwriteProjectRef,
    _files: PendingFile[],
    _message: string,
    _credential: PlainwriteCredentialRef,
  ): Promise<PublishResult> {
    notImplemented('publishFiles');
  }

  async deleteFile(
    project: PlainwriteProjectRef,
    path: string,
    sha: string,
    message: string,
    credential: PlainwriteCredentialRef,
  ): Promise<PublishResult> {
    if (!credential.token) throw new Error('Connect a GitHub token before publishing.');
    const response = await this.fetchGitHubJson<GitHubContentsWriteResponse>(
      contentsUrl(project, path),
      credential.token,
      {
        method: 'DELETE',
        body: JSON.stringify({
          message,
          sha,
          branch: project.branch,
        }),
      },
    );
    if (!response.commit?.sha) throw new Error('GitHub delete response did not include a commit.');
    return {
      commitSha: response.commit.sha,
      contentSha: null,
    };
  }

  getOAuthUrl(_state: string): string | null {
    return null;
  }

  async exchangeOAuthCode(_code: string): Promise<OAuthTokens> {
    notImplemented('exchangeOAuthCode');
  }

  async resolveUserInfo(
    credential: PlainwriteCredentialRef,
  ): Promise<{ login: string; displayName: string }> {
    const user = await this.fetchGitHubJson<{ login?: string; name?: string | null }>(
      'https://api.github.com/user',
      credential.token,
    );
    if (!user.login) throw new Error('GitHub user response did not include a login.');
    return {
      login: user.login,
      displayName: user.name ?? user.login,
    };
  }

  async validatePat(
    token: string,
    project: PlainwriteProjectRef,
  ): Promise<{ login: string; canPush: boolean }> {
    const [userResponse, repoResponse] = await Promise.all([
      this.fetchGitHubJson<{ login?: string }>('https://api.github.com/user', token),
      this.fetchGitHubJson<{ permissions?: { pull?: boolean; push?: boolean } }>(
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

  private async fetchGitHubJson<T>(
    url: string,
    token?: string | null,
    init: RequestInit = {},
  ): Promise<T> {
    const response = await this.fetcher(url, {
      ...init,
      headers: gitHubHeaders(token, init.headers),
    });
    if (!response.ok) {
      throw new Error(sanitizeGitHubError(response.status));
    }
    return (await response.json()) as T;
  }
}

interface GitHubContentsWriteResponse {
  content?: { sha?: string };
  commit?: { sha?: string };
}

function contentsUrl(project: PlainwriteProjectRef, path: string) {
  return `https://api.github.com/repos/${project.repoOwner}/${project.repoName}/contents/${path
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
}

function gitHubHeaders(token?: string | null, initHeaders?: HeadersInit) {
  const headers = new Headers(initHeaders);
  headers.set('accept', 'application/vnd.github+json');
  headers.set('content-type', 'application/json');
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
