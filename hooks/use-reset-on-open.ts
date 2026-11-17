import { useState } from 'react';

/**
 * Runs `reset` (state setters) whenever `open` turns true, however it was
 * opened. A controlled Radix Dialog doesn't call its onOpenChange when the
 * parent opens it, so resetting there misses menu-driven opens and leaves
 * stale drafts behind. This uses React's "adjust state during render"
 * pattern, so the first open frame already shows fresh values.
 */
export function useResetOnOpen(open: boolean, reset: () => void) {
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) reset();
  }
}
