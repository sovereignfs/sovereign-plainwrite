export type GitProvider = 'github' | 'gitlab' | 'gitea' | 'custom';

export interface PlainwriteProjectRef {
  id: string;
  provider: GitProvider;
  providerUrl: string | null;
  repoOwner: string;
  repoName: string;
  branch: string;
  pathPrefix: string;
}

export interface PlainwriteCredentialRef {
  authType: 'oauth' | 'pat';
  secretRef: string;
  providerLogin: string | null;
}

export interface TreeEntry {
  path: string;
  type: 'file' | 'directory';
  sha: string;
}

export interface PendingFile {
  path: string;
  action: 'create' | 'update' | 'delete';
  content: string | null;
  baseSha: string | null;
  message: string | null;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface GitProviderAdapter {
  getFileTree(project: PlainwriteProjectRef, credential: PlainwriteCredentialRef): Promise<TreeEntry[]>;
  getFileContent(
    project: PlainwriteProjectRef,
    path: string,
    credential: PlainwriteCredentialRef,
  ): Promise<{ content: string; sha: string }>;
  publishFile(
    project: PlainwriteProjectRef,
    file: PendingFile,
    credential: PlainwriteCredentialRef,
  ): Promise<void>;
  publishFiles(
    project: PlainwriteProjectRef,
    files: PendingFile[],
    message: string,
    credential: PlainwriteCredentialRef,
  ): Promise<void>;
  deleteFile(
    project: PlainwriteProjectRef,
    path: string,
    sha: string,
    message: string,
    credential: PlainwriteCredentialRef,
  ): Promise<void>;
  getOAuthUrl(state: string): string | null;
  exchangeOAuthCode(code: string): Promise<OAuthTokens>;
  resolveUserInfo(
    credential: PlainwriteCredentialRef,
  ): Promise<{ login: string; displayName: string }>;
}
