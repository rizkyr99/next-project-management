'use client';

import { useSearchParams } from 'next/navigation';
import type { ComponentProps } from 'react';
import BoardView from './board-view-client';
import { ListView } from './list-view';
import { TableView } from './table-view';
import { CalendarView } from '@/features/calendar/components/calendar-view';
import { parseView } from '../view';

/** The page's project data, which each view reads its own subset of. */
type ProjectData = ComponentProps<typeof BoardView>['project'] &
  NonNullable<ComponentProps<typeof ListView>['project']> &
  NonNullable<ComponentProps<typeof TableView>['project']>;

type Props = {
  project: ProjectData;
  commentCountMap: ComponentProps<typeof BoardView>['commentCountMap'];
  workspaceMembers: NonNullable<ComponentProps<typeof ListView>['workspaceMembers']>;
  currentUserId: string;
  /** Changes whenever the data shown changes; remounts the list and table. */
  dataKey: string;
};

/**
 * Renders the view chosen in the URL. Switching is instant: the data is
 * already here, so no server request is made (see ../view.ts).
 */
export function ProjectViews({ project, commentCountMap, workspaceMembers, currentUserId, dataKey }: Props) {
  const view = parseView(useSearchParams().get('view'));

  if (view === 'list') {
    return <ListView key={dataKey} project={project} workspaceMembers={workspaceMembers} currentUserId={currentUserId} />;
  }
  if (view === 'calendar') {
    // Remounted when the data changes, like the list and table; the month lives in the URL.
    return <CalendarView key={dataKey} project={project} currentUserId={currentUserId} />;
  }
  if (view === 'table') {
    return <TableView key={dataKey} project={project} workspaceMembers={workspaceMembers} currentUserId={currentUserId} />;
  }
  return <BoardView project={project} commentCountMap={commentCountMap} currentUserId={currentUserId} />;
}
