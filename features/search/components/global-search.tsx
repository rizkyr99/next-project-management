'use client';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from 'cmdk';
import { FileText, FolderOpen, MessageSquare, Search } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { searchWorkspace, SearchResult } from '../actions';

const icons: Record<SearchResult['type'], React.ReactNode> = {
  task: <FileText className='w-4 h-4 shrink-0 text-muted-foreground' />,
  project: <FolderOpen className='w-4 h-4 shrink-0 text-muted-foreground' />,
  comment: <MessageSquare className='w-4 h-4 shrink-0 text-muted-foreground' />,
};

const groupLabels: Record<SearchResult['type'], string> = {
  task: 'Tasks',
  project: 'Projects',
  comment: 'Comments',
};

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const params = useParams();
  const workspaceSlug = params.workspaceSlug as string;

  // cmd+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setQuery('');
    setResults([]);
  }, []);

  const handleQuery = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!value.trim() || value.length < 2) {
        setResults([]);
        return;
      }
      debounceRef.current = setTimeout(() => {
        startTransition(async () => {
          const res = await searchWorkspace(value, workspaceSlug);
          setResults(res);
        });
      }, 300);
    },
    [workspaceSlug],
  );

  const handleSelect = useCallback(
    (result: SearchResult) => {
      handleClose();
      router.push(`/workspaces/${result.workspaceSlug}/projects/${result.projectId}`);
    },
    [router, handleClose],
  );

  const grouped = results.reduce<Record<SearchResult['type'], SearchResult[]>>(
    (acc, r) => {
      acc[r.type] = [...(acc[r.type] ?? []), r];
      return acc;
    },
    { task: [], project: [], comment: [] },
  );

  return (
    <>
      {/* Mobile: icon-only button */}
      <Button
        variant='outline'
        size='icon'
        className='sm:hidden'
        onClick={() => setOpen(true)}
        aria-label='Search'>
        <Search className='w-4 h-4' />
      </Button>

      {/* Desktop: full search button */}
      <Button
        variant='outline'
        size='sm'
        className='hidden sm:flex gap-2 text-muted-foreground w-40 justify-between'
        onClick={() => setOpen(true)}>
        <span className='flex items-center gap-2'>
          <Search className='w-3.5 h-3.5' />
          Search...
        </span>
        <kbd className='pointer-events-none text-xs bg-muted px-1.5 py-0.5 rounded'>⌘K</kbd>
      </Button>

      {open && (
        <div className='fixed inset-0 z-50 flex items-start justify-center pt-[15vh]'>
          {/* Backdrop */}
          <button
            className='absolute inset-0 bg-black/40 cursor-default'
            aria-label='Close search'
            onClick={handleClose}
          />

          <Command
            className='relative z-10 w-full max-w-lg mx-4 bg-background border rounded-xl shadow-2xl overflow-hidden'
            shouldFilter={false}>
            <div className='flex items-center border-b px-3'>
              <Search className='w-4 h-4 mr-2 shrink-0 text-muted-foreground' />
              <CommandInput
                value={query}
                onValueChange={handleQuery}
                placeholder='Search tasks, projects, comments…'
                className='flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground'
                autoFocus
              />
              {isPending && <span className='text-xs text-muted-foreground'>Searching…</span>}
            </div>

            <CommandList className='max-h-80 overflow-y-auto p-1'>
              {query.length >= 2 && !isPending && results.length === 0 && (
                <CommandEmpty className='py-6 text-center text-sm text-muted-foreground'>
                  No results for &ldquo;{query}&rdquo;
                </CommandEmpty>
              )}

              {query.length < 2 && (
                <p className='py-6 text-center text-sm text-muted-foreground'>
                  Type at least 2 characters to search
                </p>
              )}

              {(['task', 'project', 'comment'] as SearchResult['type'][]).map((type) => {
                const group = grouped[type];
                if (!group || group.length === 0) return null;
                return (
                  <CommandGroup
                    key={type}
                    heading={groupLabels[type]}
                    className='[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground'>
                    {group.map((result) => (
                      <CommandItem
                        key={result.id}
                        value={result.id}
                        onSelect={() => handleSelect(result)}
                        className='flex items-center gap-3 px-2 py-2 rounded-md cursor-pointer aria-selected:bg-accent'>
                        {icons[result.type]}
                        <div className='flex flex-col min-w-0'>
                          <span className='text-sm truncate'>{result.title}</span>
                          <span className='text-xs text-muted-foreground truncate'>{result.subtitle}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
            </CommandList>
          </Command>
        </div>
      )}
    </>
  );
}
