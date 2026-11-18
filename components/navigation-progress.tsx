'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { NAVIGATION_START, type NavigationStartDetail } from '@/lib/navigation-events';

type Phase = 'idle' | 'loading' | 'done';

/** Give up after this long, so a navigation that never lands can't leave the bar stuck. */
const GIVE_UP_MS = 15_000;

/**
 * A thin bar along the top of the window while a page navigation is in
 * progress, so every click shows a response at once. It starts on
 * NAVIGATION_START and finishes when the URL the page renders changes.
 *
 * The phase is set on the element directly, not through React state: Next
 * starts navigations inside a transition, and a state update made there is
 * held back until the navigation finishes, which is exactly when the bar is
 * no longer needed.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const bar = useRef<HTMLDivElement>(null);
  const giveUp = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hide = useRef<ReturnType<typeof setTimeout>>(undefined);

  const setPhase = (phase: Phase) => {
    if (bar.current) bar.current.dataset.phase = phase;
  };

  useEffect(() => {
    const onStart = (event: Event) => {
      const { url } = (event as CustomEvent<NavigationStartDetail>).detail;
      const target = new URL(url, window.location.href);
      // Same page (e.g. a link to where you already are): nothing to wait for.
      if (target.pathname === window.location.pathname && target.search === window.location.search) return;
      clearTimeout(hide.current);
      clearTimeout(giveUp.current);
      setPhase('loading');
      giveUp.current = setTimeout(() => setPhase('idle'), GIVE_UP_MS);
    };
    window.addEventListener(NAVIGATION_START, onStart);
    return () => window.removeEventListener(NAVIGATION_START, onStart);
  }, []);

  // The new page has rendered: complete the bar, then hide it.
  useEffect(() => {
    if (bar.current?.dataset.phase !== 'loading') return;
    clearTimeout(giveUp.current);
    setPhase('done');
    hide.current = setTimeout(() => setPhase('idle'), 250);
  }, [pathname, search]);

  return (
    <div
      ref={bar}
      data-phase='idle'
      role='progressbar'
      aria-label='Loading page'
      className='group pointer-events-none fixed inset-x-0 top-0 z-100 h-0.5 data-[phase=idle]:hidden'>
      <div
        className={
          'h-full origin-left bg-primary ' +
          'group-data-[phase=loading]:animate-nav-progress motion-reduce:group-data-[phase=loading]:animate-none motion-reduce:group-data-[phase=loading]:scale-x-50 ' +
          'group-data-[phase=done]:scale-x-100 group-data-[phase=done]:opacity-0 group-data-[phase=done]:transition-[transform,opacity] group-data-[phase=done]:duration-200'
        }
      />
    </div>
  );
}
