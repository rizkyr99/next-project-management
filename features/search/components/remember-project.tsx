'use client';

import { useEffect } from 'react';
import { rememberRecent } from '../recent';

/** Records a project visit for ⌘K's recent items. Renders nothing. */
export function RememberProject({
  workspaceSlug,
  projectId,
  name,
}: Readonly<{ workspaceSlug: string; projectId: string; name: string }>) {
  useEffect(() => {
    rememberRecent(workspaceSlug, { type: 'project', id: projectId, title: name, projectId });
  }, [workspaceSlug, projectId, name]);
  return null;
}
