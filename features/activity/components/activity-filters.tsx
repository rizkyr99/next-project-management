'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const ALL = 'all';

/** Project and person filters for the activity feed, kept in the URL so a filtered view can be shared. */
export function ActivityFilters({
  projects,
  people,
}: Readonly<{
  projects: { id: string; name: string }[];
  people: { id: string; name: string }[];
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = (key: 'project' | 'person', value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === ALL) next.delete(key);
    else next.set(key, value);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  return (
    <div role='group' aria-label='Filter activity' className='flex flex-wrap gap-2'>
      <Select value={params.get('project') ?? ALL} onValueChange={(v) => set('project', v)}>
        <SelectTrigger aria-label='Project' className='h-8 w-48 text-xs'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL} className='text-xs'>All projects</SelectItem>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id} className='text-xs'>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={params.get('person') ?? ALL} onValueChange={(v) => set('person', v)}>
        <SelectTrigger aria-label='Person' className='h-8 w-44 text-xs'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL} className='text-xs'>Everyone</SelectItem>
          {people.map((p) => (
            <SelectItem key={p.id} value={p.id} className='text-xs'>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
