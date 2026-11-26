'use client';

import { Button } from '@/components/ui/button';
import { CalendarDays, Kanban, List, Table } from 'lucide-react';
import { ProBadge, useUpgrade } from '@/features/billing/components/upgrade';
import { useSearchParams } from 'next/navigation';
import { parseView, setView, type View } from '../view';

const views: { id: View; label: string; icon: typeof Kanban }[] = [
  { id: 'board', label: 'Board', icon: Kanban },
  { id: 'list', label: 'List', icon: List },
  { id: 'table', label: 'Table', icon: Table },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
];

export function ViewSwitcher() {
  const currentView = parseView(useSearchParams().get('view'));
  // B4: the calendar is Pro; on Free its button is marked and opens the calendar's upgrade panel.
  const { canUse } = useUpgrade();

  return (
    <div role='group' aria-label='View' className='flex items-center gap-1 bg-secondary w-fit rounded-lg p-1'>
      {views.map(({ id, label, icon: Icon }) => (
        <Button
          key={id}
          variant={currentView === id ? 'outline' : 'ghost'}
          size='sm'
          aria-pressed={currentView === id}
          onClick={() => setView(id)}>
          <Icon />
          <span>{label}</span>
          {id === 'calendar' && !canUse('calendar') && <ProBadge />}
        </Button>
      ))}
    </div>
  );
}
