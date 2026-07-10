'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getProjectNavigation } from '../_lib/actions';
import styles from './PlainwriteSidebar.module.css';

interface ProjectNavigationDetails {
  id: string;
  name: string;
  repoOwner: string;
  repoName: string;
  archivedAt: number | null;
  currentUserRole: string;
}

interface SidebarState {
  projectId: string | null;
  section: 'projects' | 'content' | 'editor' | 'settings';
  filePath: string | null;
}

export function PlainwriteSidebar() {
  const state = useSidebarState(usePathname());
  const project = useProjectNavigation(state.projectId);

  return (
    <aside className={styles.sidebar} aria-label="Plainwrite navigation">
      <div className={styles.brand}>
        <span className={styles.mark} aria-hidden="true">
          Pw
        </span>
        <div>
          <p className={styles.kicker}>Plainwrite</p>
          <h1 className={styles.title}>{state.projectId ? 'Workspace' : 'Content'}</h1>
        </div>
      </div>

      {state.projectId ? <ProjectNav state={state} project={project} /> : <ProjectsNav />}
    </aside>
  );
}

function ProjectsNav() {
  return (
    <nav className={styles.nav} aria-label="Plainwrite sections">
      <Link href="/plainwrite" className={styles.active} aria-current="page">
        Projects
      </Link>
    </nav>
  );
}

function ProjectNav({
  state,
  project,
}: {
  state: SidebarState;
  project: ProjectNavigationDetails | null;
}) {
  const projectHref = `/plainwrite/${state.projectId}`;
  const settingsHref = `${projectHref}/settings`;

  return (
    <div className={styles.projectNav}>
      <Link href="/plainwrite" className={styles.backLink}>
        Back to projects
      </Link>

      <div className={styles.projectCard}>
        <p className={styles.kicker}>Current project</p>
        <strong>{project?.name ?? shortProjectId(state.projectId)}</strong>
        {project ? (
          <span>
            {project.repoOwner}/{project.repoName}
          </span>
        ) : null}
      </div>

      <nav className={styles.nav} aria-label="Project sections">
        <Link
          href={projectHref}
          className={state.section === 'content' ? styles.active : undefined}
          aria-current={state.section === 'content' ? 'page' : undefined}
        >
          Content
        </Link>
        <Link
          href={settingsHref}
          className={state.section === 'settings' ? styles.active : undefined}
          aria-current={state.section === 'settings' ? 'page' : undefined}
        >
          Settings
        </Link>
      </nav>

      {state.section === 'editor' && state.filePath ? (
        <div className={styles.fileCard}>
          <p className={styles.kicker}>Open file</p>
          <strong>{state.filePath}</strong>
        </div>
      ) : null}
    </div>
  );
}

function useProjectNavigation(projectId: string | null) {
  const [project, setProject] = useState<ProjectNavigationDetails | null>(null);

  useEffect(() => {
    let cancelled = false;
    setProject(null);
    if (!projectId) return;

    getProjectNavigation(projectId)
      .then((nextProject) => {
        if (!cancelled) setProject(nextProject);
      })
      .catch(() => {
        if (!cancelled) setProject(null);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return project;
}

function useSidebarState(pathname: string | null): SidebarState {
  const segments = (pathname ?? '/plainwrite').split('/').filter(Boolean);
  const plainwriteIndex = segments.indexOf('plainwrite');
  const projectId = plainwriteIndex >= 0 ? segments[plainwriteIndex + 1] : null;
  const childSegment = plainwriteIndex >= 0 ? segments[plainwriteIndex + 2] : null;

  if (!projectId) return { projectId: null, section: 'projects', filePath: null };
  if (childSegment === 'settings') return { projectId, section: 'settings', filePath: null };
  if (childSegment === 'editor') {
    const fileSegments = segments.slice(plainwriteIndex + 3).map((segment) => decode(segment));
    return {
      projectId,
      section: 'editor',
      filePath: fileSegments.length > 0 ? fileSegments.join('/') : null,
    };
  }
  return { projectId, section: 'content', filePath: null };
}

function shortProjectId(projectId: string | null) {
  if (!projectId) return 'Project';
  return projectId.length > 12 ? `${projectId.slice(0, 8)}...` : projectId;
}

function decode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
