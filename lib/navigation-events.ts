/**
 * A page navigation has started. Dispatched from `onRouterTransitionStart`
 * (instrumentation-client.ts), which Next calls for every App Router
 * navigation: links, router.push/replace, Back and Forward. URL changes made
 * with history.pushState/replaceState (view switch, task sheet) don't fire it:
 * they're instant and need no indicator.
 */
export const NAVIGATION_START = 'tide:navigation-start';

export type NavigationStartDetail = { url: string };

export function announceNavigationStart(url: string) {
  window.dispatchEvent(new CustomEvent<NavigationStartDetail>(NAVIGATION_START, { detail: { url } }));
}
