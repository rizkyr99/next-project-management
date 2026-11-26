import { describe, expect, it } from 'vitest';
import { currentView, filterQuery, PRESET_VIEWS, viewQuery, viewUpdates } from '@/features/views/query';

describe('viewQuery', () => {
  it('keeps only layout, filters and sort, in a fixed order', () => {
    expect(viewQuery('task=abc&q=logo&view=list&month=2026-12&assignee=me&dir=desc&sort=due')).toBe(
      'view=list&assignee=me&q=logo&sort=due&dir=desc',
    );
  });

  it('treats the board as the default layout', () => {
    expect(viewQuery('view=board&due=week')).toBe('due=week');
    expect(viewQuery('view=board')).toBe('');
  });

  it('filterQuery leaves out layout and sort', () => {
    expect(filterQuery('view=table&sort=title&approval=pending')).toBe('approval=pending');
  });
});

describe('viewUpdates', () => {
  it('a saved view sets every view param, clearing the ones it lacks', () => {
    const u = viewUpdates('view=table&priority=high', 'saved');
    expect(u.view).toBe('table');
    expect(u.priority).toBe('high');
    expect(u.assignee).toBeNull();
    expect(u.sort).toBeNull();
  });

  it('a built-in view sets the filters and keeps the layout and sort', () => {
    const u = viewUpdates('assignee=me&due=overdue', 'preset');
    expect(u).not.toHaveProperty('view');
    expect(u).not.toHaveProperty('sort');
    expect(u.assignee).toBe('me');
    expect(u.q).toBeNull();
  });
});

describe('currentView', () => {
  const saved = [{ id: 's1', name: 'Design review', query: 'view=table&label=l1&sort=due' }];

  it('finds a saved view by its whole query', () => {
    expect(currentView(saved, PRESET_VIEWS, new URLSearchParams('sort=due&label=l1&view=table&task=x'))?.id).toBe('s1');
    expect(currentView(saved, PRESET_VIEWS, new URLSearchParams('label=l1&sort=due'))).toBeNull();
  });

  it('finds a built-in view by its filters, whatever the layout', () => {
    expect(currentView(saved, PRESET_VIEWS, 'view=list&due=overdue&assignee=me')?.name).toBe('My overdue');
    expect(currentView(saved, PRESET_VIEWS, 'view=list')).toBeNull();
  });
});
