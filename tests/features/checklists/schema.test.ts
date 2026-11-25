import { describe, it, expect } from 'vitest';
import { checklistProgress, splitSteps } from '@/features/checklists/schema';

describe('checklistProgress', () => {
  it('is null without steps', () => {
    expect(checklistProgress([])).toBeNull();
    expect(checklistProgress(undefined)).toBeNull();
  });
  it('counts done steps', () => {
    expect(checklistProgress([{ done: true }, { done: false }])).toEqual({ done: 1, total: 2, complete: false });
    expect(checklistProgress([{ done: true }])).toEqual({ done: 1, total: 1, complete: true });
  });
});

describe('splitSteps', () => {
  it('turns pasted lines into steps, dropping bullets, numbers and boxes', () => {
    expect(splitSteps('- Wireframes\n* Copy\r\n\n1. Build\n2) Test\n[ ] Launch\n[x] Party\n• Done')).toEqual([
      'Wireframes',
      'Copy',
      'Build',
      'Test',
      'Launch',
      'Party',
      'Done',
    ]);
  });
  it('keeps text that only looks like a bullet', () => {
    expect(splitSteps('-5 degrees\n2024 plan')).toEqual(['-5 degrees', '2024 plan']);
  });
});
