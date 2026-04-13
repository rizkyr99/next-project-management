'use client';

import { Button } from '@/components/ui/button';
import { Kanban, List, Table } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';

type View = 'board' | 'list' | 'table';

const views: { id: View; label: string; icon: typeof Kanban }[] = [
  { id: 'board', label: 'Board', icon: Kanban },
  { id: 'list', label: 'List', icon: List },
  { id: 'table', label: 'Table', icon: Table },
];

export function ViewSwitcher({ currentView }: { currentView: View }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const switchView = (view: View) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', view);
    router.push(`?${params.toString()}`);
  };

  return (
    <div className='flex items-center gap-1 bg-secondary w-fit rounded-lg p-1'>
      {views.map(({ id, label, icon: Icon }) => (
        <Button
          key={id}
          variant={currentView === id ? 'outline' : 'ghost'}
          size='sm'
          onClick={() => switchView(id)}>
          <Icon />
          <span>{label}</span>
        </Button>
      ))}
    </div>
  );
}
