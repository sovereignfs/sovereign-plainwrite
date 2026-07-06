import type {
  GitProviderAdapter,
  OAuthTokens,
  PendingFile,
  PlainwriteCredentialRef,
  PlainwriteProjectRef,
  TreeEntry,
} from './types';

function notImplemented(method: string): never {
  throw new Error(`GitHub provider ${method} is not implemented yet. See PLW-005/PLW-007.`);
}

export class GitHubProvider implements GitProviderAdapter {
  async getFileTree(
    _project: PlainwriteProjectRef,
    _credential: PlainwriteCredentialRef,
  ): Promise<TreeEntry[]> {
    notImplemented('getFileTree');
  }

  async getFileContent(
    _project: PlainwriteProjectRef,
    _path: string,
    _credential: PlainwriteCredentialRef,
  ): Promise<{ content: string; sha: string }> {
    notImplemented('getFileContent');
  }

  async publishFile(
    _project: PlainwriteProjectRef,
    _file: PendingFile,
    _credential: PlainwriteCredentialRef,
  ): Promise<void> {
    notImplemented('publishFile');
  }

  async publishFiles(
    _project: PlainwriteProjectRef,
    _files: PendingFile[],
    _message: string,
    _credential: PlainwriteCredentialRef,
  ): Promise<void> {
    notImplemented('publishFiles');
  }

  async deleteFile(
    _project: PlainwriteProjectRef,
    _path: string,
    _sha: string,
    _message: string,
    _credential: PlainwriteCredentialRef,
  ): Promise<void> {
    notImplemented('deleteFile');
  }

  getOAuthUrl(_state: string): string | null {
    return null;
  }

  async exchangeOAuthCode(_code: string): Promise<OAuthTokens> {
    notImplemented('exchangeOAuthCode');
  }

  async resolveUserInfo(
    _credential: PlainwriteCredentialRef,
  ): Promise<{ login: string; displayName: string }> {
    notImplemented('resolveUserInfo');
  }
}
