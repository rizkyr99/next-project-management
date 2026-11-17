'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useMemo, useState, type ReactNode } from 'react';
import { PersonAvatar, type Person } from '../task-meta';

export function AssigneePicker({
  trigger,
  options,
  selectedIds,
  onToggle,
}: {
  trigger: ReactNode;
  options: Person[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (a) => a.name?.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q),
    );
  }, [options, search]);

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align='start' className='w-72 p-2'>
        <div className='space-y-2'>
          <Input
            placeholder='Search members…'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className='max-h-52 overflow-y-auto space-y-0.5'>
            {filtered.length === 0 ? (
              <p className='px-2 py-1.5 text-sm text-muted-foreground'>No members found.</p>
            ) : (
              filtered.map((a) => (
                <label
                  key={a.id}
                  className='flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent cursor-pointer'>
                  <Checkbox
                    checked={selectedIds.includes(a.id)}
                    onCheckedChange={() => onToggle(a.id)}
                  />
                  <PersonAvatar person={a} className='size-6' />
                  <div className='flex flex-col'>
                    <span className='font-medium'>{a.name}</span>
                    {a.email && <span className='text-xs text-muted-foreground'>{a.email}</span>}
                  </div>
                </label>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
