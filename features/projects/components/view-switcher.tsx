'use client';

import { Button } from '@/components/ui/button';
import { Kanban, List, Table } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { parseView, setView, type View } from '../view';

const views: { id: View; label: string; icon: typeof Kanban }[] = [
  { id: 'board', label: 'Board', icon: Kanban },
  { id: 'list', label: 'List', icon: List },
  { id: 'table', label: 'Table', icon: Table },
];

export function ViewSwitcher() {
  const currentView = parseView(useSearchParams().get('view'));

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
        </Button>
      ))}
    </div>
  );
}
