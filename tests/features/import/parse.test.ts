import { describe, it, expect } from 'vitest';
import { ImportError, parseCsv, parseCsvRows, parseImport, parseTrello } from '@/features/import/parse';

const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

const board = {
  name: 'Acme website',
  lists: [
    { id: 'l2', name: 'Doing', pos: 2 },
    { id: 'l1', name: 'To Do', pos: 1 },
    { id: 'l3', name: 'Old', pos: 3, closed: true },
  ],
  cards: [
    {
      id: 'c1',
      name: 'Homepage',
      desc: 'Hero and nav',
      idList: 'l1',
      pos: 1,
      due: local(2026, 12, 10, 12, 0),
      start: local(2026, 12, 1),
      labels: [{ name: 'Design', color: 'purple' }, { name: '', color: 'green_dark' }],
    },
    { id: 'c2', name: 'Copy', idList: 'l2', pos: 1, due: local(2026, 12, 12, 15, 30) },
    { id: 'c3', name: 'Archived card', idList: 'l1', closed: true },
    { id: 'c4', name: 'In an archived list', idList: 'l3' },
  ],
  checklists: [
    { idCard: 'c1', pos: 1, checkItems: [{ name: 'Draft', state: 'complete', pos: 1 }, { name: 'Review', state: 'incomplete', pos: 2 }] },
  ],
};

describe('parseTrello', () => {
  const p = parseTrello(board);

  it('keeps open lists in order and skips archived lists and cards', () => {
    expect(p.columns.map((c) => c.name)).toEqual(['To Do', 'Doing']);
    expect(p.tasks.map((t) => [t.title, t.column])).toEqual([
      ['Homepage', 0],
      ['Copy', 1],
    ]);
    expect(p.skipped).toBe(3);
    expect(p.name).toBe('Acme website');
  });

  it('reads dates (noon means that day), labels by name or colour, and checklists with what’s done', () => {
    const [home, copy] = p.tasks;
    expect(home.startDay).toBe('2026-12-01');
    expect(home.due).toEqual({ day: '2026-12-10', time: null });
    expect(copy.due).toEqual({ day: '2026-12-12', time: '15:30' });
    expect(home.labels).toEqual(['Design', 'green_dark']);
    expect(p.labels).toEqual([
      { name: 'Design', color: 'purple' },
      { name: 'green_dark', color: 'green' },
    ]);
    expect(home.checklist).toEqual([
      { title: 'Draft', done: true },
      { title: 'Review', done: false },
    ]);
    expect(home.description).toBe('Hero and nav');
  });

  it('explains a file that isn’t a board, or one with too many lists', () => {
    expect(() => parseTrello({ hello: 1 })).toThrow(ImportError);
    const many = { lists: Array.from({ length: 21 }, (_, i) => ({ id: `l${i}`, name: `L${i}` })), cards: [] };
    expect(() => parseTrello(many)).toThrow(/up to 20 columns/);
  });
});

describe('parseCsvRows', () => {
  it('handles quotes, doubled quotes, commas and line breaks inside fields, CRLF and a BOM', () => {
    expect(parseCsvRows('﻿a,b\r\n"x, ""y""","line1\nline2"\r\n')).toEqual([
      ['a', 'b'],
      ['x, "y"', 'line1\nline2'],
    ]);
  });
});

describe('parseCsv', () => {
  it('reads the columns Tide exports, and groups tasks into columns by name', () => {
    const p = parseCsv(
      [
        'Title,Column,Priority,Start date,Due date,Due time,Labels,Checklist,Description',
        'Homepage,In Progress,high,2026-12-01,2026-12-10,,"Design; Copy","[x] Draft\n[ ] Review",Hero',
        'Logo,To Do,urgent,,2026-12-12,09:30,Design,,',
        ',To Do,,,,,,,',
        'Invoice,,nonsense,,not a date,,,,',
      ].join('\n'),
    );
    expect(p.columns.map((c) => c.name)).toEqual(['In Progress', 'To Do']);
    expect(p.tasks.map((t) => [t.title, t.column, t.priority])).toEqual([
      ['Homepage', 0, 'high'],
      ['Logo', 1, 'urgent'],
      ['Invoice', 1, 'medium'],
    ]);
    expect(p.tasks[0]).toMatchObject({
      startDay: '2026-12-01',
      due: { day: '2026-12-10', time: null },
      labels: ['Design', 'Copy'],
      checklist: [
        { title: 'Draft', done: true },
        { title: 'Review', done: false },
      ],
      description: 'Hero',
    });
    expect(p.tasks[1].due).toEqual({ day: '2026-12-12', time: '09:30' });
    expect(p.tasks[2].due).toBeNull();
    expect(p.skipped).toBe(1);
  });

  it('accepts other common headers, and needs a title column', () => {
    const p = parseCsv('Name,Status,Deadline\nShip it,Done,2027-01-04');
    expect(p.tasks[0]).toMatchObject({ title: 'Ship it', due: { day: '2027-01-04', time: null } });
    expect(p.columns).toEqual([{ name: 'Done', color: null }]);
    expect(() => parseCsv('Column,Due\nTo Do,2026-12-01')).toThrow(/Title column/);
    expect(() => parseCsv('Title')).toThrow(/at least one task/);
  });
});

describe('parseImport', () => {
  it('reads .json as Trello and anything else as CSV, and explains broken JSON', () => {
    expect(parseImport('board.json', JSON.stringify(board)).source).toBe('trello');
    expect(parseImport('tasks.csv', 'Title\nA').source).toBe('csv');
    expect(() => parseImport('board.json', '{nope')).toThrow(/couldn’t be read/);
  });
});
