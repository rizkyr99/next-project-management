'use client';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from 'cmdk';
import {
  Activity,
  Bell,
  CheckSquare,
  CreditCard,
  FileText,
  FolderOpen,
  FolderPlus,
  Home,
  Keyboard,
  MessageSquare,
  Moon,
  Search,
  Settings,
  Sun,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { SHORTCUT_EVENTS, emit, goToTarget } from '@/lib/shortcuts';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { searchWorkspace, SearchResult } from '../actions';
import { projectHref, taskHref } from '@/features/tasks/task-link';

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

type Action = { id: string; label: string; keywords: string; icon: React.ReactNode; keys?: string[]; run: () => void };

const iconClass = 'w-4 h-4 shrink-0 text-muted-foreground';

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const params = useParams();
  const workspaceSlug = params.workspaceSlug as string;

  const { resolvedTheme, setTheme } = useTheme();

  // cmd+K shortcut, and "/" outside a project (components/keyboard-shortcuts.tsx)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    const openFromShortcut = () => setOpen(true);
    document.addEventListener('keydown', handler);
    window.addEventListener(SHORTCUT_EVENTS.openCommand, openFromShortcut);
    return () => {
      document.removeEventListener('keydown', handler);
      window.removeEventListener(SHORTCUT_EVENTS.openCommand, openFromShortcut);
    };
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
      router.push(
        result.taskId
          ? taskHref(result.workspaceSlug, result.projectId, result.taskId)
          : projectHref(result.workspaceSlug, result.projectId),
      );
    },
    [router, handleClose],
  );

  // Things to do, listed before typing and matched by name while typing.
  const go = (key: string) => () => {
    const target = goToTarget(key, workspaceSlug);
    if (target) router.push(target);
  };
  const actions: Action[] = [
    { id: 'new-project', label: 'New project', keywords: 'create add project', icon: <FolderPlus className={iconClass} />, run: () => emit(SHORTCUT_EVENTS.newProject) },
    { id: 'go-home', label: 'Go to Home', keywords: 'home overview workspace', icon: <Home className={iconClass} />, keys: ['G', 'H'], run: go('h') },
    { id: 'go-my-tasks', label: 'Go to My tasks', keywords: 'my tasks assigned', icon: <CheckSquare className={iconClass} />, keys: ['G', 'M'], run: go('m') },
    { id: 'go-activity', label: 'Go to Activity', keywords: 'activity log history', icon: <Activity className={iconClass} />, keys: ['G', 'A'], run: go('a') },
    { id: 'go-settings', label: 'Go to Workspace settings', keywords: 'settings members invite workspace', icon: <Settings className={iconClass} />, keys: ['G', 'S'], run: go('s') },
    { id: 'go-notifications', label: 'Go to Notifications', keywords: 'notifications inbox', icon: <Bell className={iconClass} />, keys: ['G', 'N'], run: go('n') },
    { id: 'go-billing', label: 'Go to Billing', keywords: 'billing plan upgrade subscription', icon: <CreditCard className={iconClass} />, keys: ['G', 'B'], run: go('b') },
    resolvedTheme === 'dark'
      ? { id: 'theme', label: 'Switch to light theme', keywords: 'theme light mode appearance', icon: <Sun className={iconClass} />, run: () => setTheme('light') }
      : { id: 'theme', label: 'Switch to dark theme', keywords: 'theme dark mode appearance', icon: <Moon className={iconClass} />, run: () => setTheme('dark') },
    { id: 'shortcuts', label: 'Keyboard shortcuts', keywords: 'keyboard shortcuts keys help', icon: <Keyboard className={iconClass} />, keys: ['?'], run: () => emit(SHORTCUT_EVENTS.openShortcuts) },
  ];
  const q = query.trim().toLowerCase();
  const shownActions = q ? actions.filter((a) => `${a.label} ${a.keywords}`.toLowerCase().includes(q)) : actions;
  const runAction = (action: Action) => {
    handleClose();
    action.run();
  };

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
                placeholder='Search, or type a command…'
                className='flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground'
                autoFocus
              />
              {isPending && <span className='text-xs text-muted-foreground'>Searching…</span>}
            </div>

            <CommandList className='max-h-80 overflow-y-auto p-1'>
              {shownActions.length > 0 && (
                <CommandGroup
                  heading='Actions'
                  className='[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground'>
                  {shownActions.map((action) => (
                    <CommandItem
                      key={action.id}
                      value={`action-${action.id}`}
                      onSelect={() => runAction(action)}
                      className='flex items-center gap-3 px-2 py-2 rounded-md cursor-pointer aria-selected:bg-accent'>
                      {action.icon}
                      <span className='flex-1 text-sm'>{action.label}</span>
                      {action.keys && (
                        <span className='flex gap-1' aria-hidden>
                          {action.keys.map((k) => (
                            <kbd key={k} className='rounded border bg-muted px-1.5 text-[10px] text-muted-foreground'>
                              {k}
                            </kbd>
                          ))}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {query.length >= 2 && !isPending && results.length === 0 && shownActions.length === 0 && (
                <CommandEmpty className='px-4 py-8 text-center text-sm text-muted-foreground'>
                  <p className='font-medium text-foreground'>No results for &ldquo;{query}&rdquo;</p>
                  <p className='mt-1'>Search looks in task titles and descriptions, project names and comments. Try fewer or different words.</p>
                </CommandEmpty>
              )}

              {query.length < 2 && (
                <p className='px-2 pt-2 pb-1 text-xs text-muted-foreground'>
                  Type 2 or more characters to search tasks, projects and comments.
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
