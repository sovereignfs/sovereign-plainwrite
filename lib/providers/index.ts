import { GitHubProvider } from './github';
import type { GitProvider, GitProviderAdapter } from './types';

export function getProvider(provider: GitProvider): GitProviderAdapter {
  if (provider === 'github') return new GitHubProvider();
  throw new Error(`Git provider "${provider}" is not implemented yet.`);
}

export type {
  GitProvider,
  GitProviderAdapter,
  OAuthTokens,
  PendingFile,
  PlainwriteCredentialRef,
  PlainwriteProjectRef,
  TreeEntry,
} from './types';
