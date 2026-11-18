'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { setView, parseView } from '@/features/projects/view';
import {
  SHORTCUT_EVENTS,
  SHORTCUT_GROUPS,
  emit,
  goToTarget,
  requestAddTask,
  shouldIgnoreKey,
} from '@/lib/shortcuts';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/** How long after G the second key still counts. */
const SEQUENCE_MS = 1200;

/**
 * App-wide single-key shortcuts (the list is in lib/shortcuts.ts), and the
 * "?" help dialog. Keys are ignored while typing or with a dialog open.
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  const pathname = usePathname();
  const { workspaceSlug } = useParams<{ workspaceSlug?: string }>();
  const [helpOpen, setHelpOpen] = useState(false);
  const awaitingGo = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const openHelp = () => setHelpOpen(true);
    window.addEventListener(SHORTCUT_EVENTS.openShortcuts, openHelp);
    return () => window.removeEventListener(SHORTCUT_EVENTS.openShortcuts, openHelp);
  }, []);

  useEffect(() => {
    const onProject = /\/projects\/[^/]+$/.test(pathname);

    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreKey(event)) return;
      const key = event.key;

      // Second key of a G sequence.
      if (awaitingGo.current) {
        clearTimeout(awaitingGo.current);
        awaitingGo.current = null;
        const target = goToTarget(key, workspaceSlug ?? '');
        if (target && (workspaceSlug || target.startsWith('/settings') || target === '/notifications')) {
          event.preventDefault();
          router.push(target);
        }
        return;
      }

      if (key === '?') {
        event.preventDefault();
        setHelpOpen(true);
      } else if (key === 'g' || key === 'G') {
        awaitingGo.current = setTimeout(() => (awaitingGo.current = null), SEQUENCE_MS);
      } else if ((key === 'c' || key === 'C') && onProject) {
        event.preventDefault();
        // Tasks are added on the board.
        if (parseView(new URLSearchParams(window.location.search).get('view')) !== 'board') setView('board');
        requestAddTask();
      } else if (key === '/') {
        event.preventDefault();
        const filter = document.querySelector<HTMLInputElement>('input[aria-label="Filter by text"]');
        if (filter && filter.offsetParent !== null) filter.focus();
        else emit(SHORTCUT_EVENTS.openCommand);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (awaitingGo.current) clearTimeout(awaitingGo.current);
    };
  }, [pathname, router, workspaceSlug]);

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>They work anywhere in the app, except while you&apos;re typing.</DialogDescription>
        </DialogHeader>
        <div className='space-y-4'>
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} aria-labelledby={`shortcuts-${group.title}`}>
              <h3 id={`shortcuts-${group.title}`} className='mb-1.5 text-xs font-medium text-muted-foreground'>
                {group.title}
              </h3>
              <dl className='space-y-1'>
                {group.shortcuts.map((s) => (
                  <div key={s.label} className='flex items-center justify-between gap-4 text-sm'>
                    <dt>{s.label}</dt>
                    <dd className='flex gap-1'>
                      {s.keys.map((k, i) => (
                        <kbd
                          key={i}
                          className='min-w-6 rounded border bg-muted px-1.5 py-0.5 text-center font-sans text-xs text-muted-foreground'>
                          {k}
                        </kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
