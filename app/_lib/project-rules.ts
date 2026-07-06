export const PROJECT_ROLES = ['owner', 'editor', 'viewer'] as const;
export const PROJECT_PROVIDERS = ['github'] as const;
export const SSG_TYPES = ['astro'] as const;
export const METADATA_VISIBILITY = ['members_with_credentials', 'all_members'] as const;

export type ProjectRole = (typeof PROJECT_ROLES)[number];
export type ProjectProvider = (typeof PROJECT_PROVIDERS)[number];
export type SsgType = (typeof SSG_TYPES)[number];
export type MetadataVisibility = (typeof METADATA_VISIBILITY)[number];

export interface ParsedGitHubRepository {
  owner: string;
  name: string;
}

export interface ProjectInputDefaults {
  branch: string;
  pathPrefix: string;
  ssgType: SsgType;
  metadataVisibility: MetadataVisibility;
}

const roleRank: Record<ProjectRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

export function isProjectRole(value: string): value is ProjectRole {
  return PROJECT_ROLES.includes(value as ProjectRole);
}

export function isMetadataVisibility(value: string): value is MetadataVisibility {
  return METADATA_VISIBILITY.includes(value as MetadataVisibility);
}

export function isSsgType(value: string): value is SsgType {
  return SSG_TYPES.includes(value as SsgType);
}

export function normalizePathPrefix(value: string): string {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, '');
  return trimmed || 'src/content';
}

export function defaultMetadataVisibility(isPrivate: boolean): MetadataVisibility {
  return isPrivate ? 'members_with_credentials' : 'all_members';
}

export function projectInputDefaults(input: {
  branch?: string | null;
  pathPrefix?: string | null;
  ssgType?: string | null;
  metadataVisibility?: string | null;
  isPrivate: boolean;
}): ProjectInputDefaults {
  const ssgType = input.ssgType?.trim() || 'astro';
  if (!isSsgType(ssgType)) throw new Error('Unsupported SSG type.');

  const metadataVisibility =
    input.metadataVisibility?.trim() || defaultMetadataVisibility(input.isPrivate);
  if (!isMetadataVisibility(metadataVisibility)) {
    throw new Error('Unsupported metadata visibility.');
  }

  return {
    branch: input.branch?.trim() || 'main',
    pathPrefix: normalizePathPrefix(input.pathPrefix ?? ''),
    ssgType,
    metadataVisibility,
  };
}

export function hasProjectRole(
  actualRole: ProjectRole | null | undefined,
  requiredRole: ProjectRole,
): boolean {
  if (!actualRole) return false;
  return roleRank[actualRole] >= roleRank[requiredRole];
}

export function canEditProject(role: ProjectRole) {
  return hasProjectRole(role, 'editor');
}

export function canManageProject(role: ProjectRole) {
  return hasProjectRole(role, 'owner');
}

export function assertProjectRole(
  actualRole: ProjectRole | null | undefined,
  requiredRole: ProjectRole,
): asserts actualRole is ProjectRole {
  if (!hasProjectRole(actualRole, requiredRole)) {
    throw new Error('Not authorized');
  }
}

export function parseGitHubRepositoryUrl(input: string): ParsedGitHubRepository {
  const value = input.trim();
  if (!value) throw new Error('Repository URL is required.');

  const sshMatch = value.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  if (sshMatch) return normalizeGitHubParts(sshMatch[1], sshMatch[2]);

  const sshUrlMatch = value.match(/^ssh:\/\/git@github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  if (sshUrlMatch) return normalizeGitHubParts(sshUrlMatch[1], sshUrlMatch[2]);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Use a valid GitHub HTTPS or SSH repository URL.');
  }

  if (url.hostname.toLowerCase() !== 'github.com') {
    throw new Error('Only github.com repositories are supported in v0.1.');
  }

  const [owner, repo, ...rest] = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
  if (rest.length > 0) {
    throw new Error('Use the repository root URL, not a nested GitHub path.');
  }

  return normalizeGitHubParts(owner, repo);
}

function normalizeGitHubParts(owner: string | undefined, repo: string | undefined) {
  const repoName = repo?.replace(/\.git$/i, '') ?? '';
  if (!isGitHubPathPart(owner) || !isGitHubPathPart(repoName)) {
    throw new Error('GitHub repository URL must include a valid owner and repo name.');
  }
  return { owner, name: repoName };
}

function isGitHubPathPart(value: string | undefined): value is string {
  return Boolean(value && /^[A-Za-z0-9_.-]+$/.test(value));
}
