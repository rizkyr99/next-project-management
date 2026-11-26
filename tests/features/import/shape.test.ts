import { describe, expect, it } from 'vitest';
import { importSchema, importToRows, type ImportInput } from '@/features/import/shape';
import { csvField, exportFileName, exportRows, toCsv } from '@/features/import/csv';
import { parseCsv } from '@/features/import/parse';

const base = {
  workspaceSlug: 'studio',
  name: 'Imported',
  source: 'csv' as const,
  columns: [
    { name: 'To Do', color: null },
    { name: 'Done', color: 'green' as const },
  ],
  labels: [
    { name: 'Design', color: 'pink' as const },
    { name: 'Copy', color: null },
  ],
};

const task = (over: Partial<ImportInput['tasks'][number]> = {}): ImportInput['tasks'][number] => ({
  title: 'Task',
  description: null,
  priority: 'medium',
  column: 0,
  startDay: null,
  due: null,
  labels: [],
  checklist: [],
  ...over,
});

let n = 0;
const opts = (over: Partial<Parameters<typeof importToRows>[1]> = {}) => ({
  projectId: 'p1',
  workspaceId: 'w1',
  timeZone: 'Asia/Jakarta',
  existingLabels: [],
  labelSlots: 50,
  newId: () => `id${++n}`,
  ...over,
});

describe('importSchema', () => {
  it('rejects a task pointing at a missing column', () => {
    const r = importSchema.safeParse({ ...base, tasks: [task({ column: 5 })] });
    expect(r.success).toBe(false);
  });

  it('rejects a bad due time', () => {
    const r = importSchema.safeParse({ ...base, tasks: [task({ due: { day: '2026-12-01', time: '25:00' } })] });
    expect(r.success).toBe(false);
  });

  it('accepts a well-formed import', () => {
    const r = importSchema.safeParse({ ...base, tasks: [task({ due: { day: '2026-12-01', time: '09:30' } })] });
    expect(r.success).toBe(true);
  });
});

describe('importToRows', () => {
  it('makes the first column the default and orders tasks per column', () => {
    const rows = importToRows({ ...base, tasks: [task(), task({ column: 1 }), task()] }, opts());
    expect(rows.statuses.map((s) => [s.name, s.order, s.isDefault])).toEqual([
      ['To Do', 1, true],
      ['Done', 2, false],
    ]);
    expect(rows.tasks.map((t) => t.order)).toEqual([1, 1, 2]);
    expect(rows.tasks[1].statusId).toBe(rows.statuses[1].id);
  });

  it('places due dates in the given time zone', () => {
    const rows = importToRows(
      { ...base, tasks: [task({ due: { day: '2026-12-01', time: '09:30' } }), task({ due: { day: '2026-12-02', time: null } })] },
      opts(),
    );
    // Jakarta is UTC+7.
    expect(rows.tasks[0].dueDate?.toISOString()).toBe('2026-12-01T02:30:00.000Z');
    expect(rows.tasks[0].dueHasTime).toBe(true);
    expect(rows.tasks[1].dueDate?.toISOString()).toBe('2026-12-01T17:00:00.000Z');
    expect(rows.tasks[1].dueHasTime).toBe(false);
  });

  it('drops a start after the due day', () => {
    const rows = importToRows(
      { ...base, tasks: [task({ startDay: '2026-12-05', due: { day: '2026-12-01', time: null } }), task({ startDay: '2026-11-28', due: { day: '2026-12-01', time: null } })] },
      opts(),
    );
    expect(rows.tasks.map((t) => t.startDate)).toEqual([null, '2026-11-28']);
  });

  it('reuses workspace labels by name, creates the rest while there is room', () => {
    const rows = importToRows(
      { ...base, labels: [...base.labels, { name: 'Dev', color: null }], tasks: [task({ labels: ['design', 'Copy', 'Dev'] })] },
      opts({ existingLabels: [{ id: 'existing-design', name: 'Design' }], labelSlots: 1 }),
    );
    expect(rows.labels.map((l) => l.name)).toEqual(['Copy']);
    expect(rows.taskLabels.map((l) => l.labelId)).toEqual(['existing-design', rows.labels[0].id]);
    expect(rows.labelsLeftOff).toEqual(['Dev']);
  });

  it('keeps checklist order and done state', () => {
    const rows = importToRows(
      { ...base, tasks: [task({ checklist: [{ title: 'A', done: true }, { title: 'B', done: false }] })] },
      opts(),
    );
    expect(rows.checklist.map((c) => [c.title, c.done, c.position])).toEqual([
      ['A', true, 0],
      ['B', false, 1],
    ]);
  });
});

describe('CSV export', () => {
  it('quotes fields with commas, quotes and line breaks', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a, b')).toBe('"a, b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('one\ntwo')).toBe('"one\ntwo"');
  });

  it('defuses spreadsheet formulas', () => {
    expect(csvField('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvField('@cmd')).toBe("'@cmd");
  });

  it('names the file after the project', () => {
    expect(exportFileName('Website Redesign!')).toBe('website-redesign.csv');
    expect(exportFileName('???')).toBe('project.csv');
  });

  it('round-trips through the importer', () => {
    const csv = toCsv(
      exportRows([
        {
          title: '=Launch, "v2"',
          column: 'In Progress',
          priority: 'high',
          startDay: '2026-12-01',
          dueDay: '2026-12-03',
          dueTime: '14:00',
          assignees: ['Ana'],
          labels: ['Design', 'Copy'],
          checklist: [
            { title: 'Draft', done: true },
            { title: 'Review', done: false },
          ],
          description: 'Line one\nLine two',
        },
      ]),
    );
    const back = parseCsv(csv);
    expect(back.columns).toEqual([{ name: 'In Progress', color: null }]);
    expect(back.tasks[0]).toEqual({
      title: '=Launch, "v2"',
      description: 'Line one\nLine two',
      priority: 'high',
      column: 0,
      startDay: '2026-12-01',
      due: { day: '2026-12-03', time: '14:00' },
      labels: ['Design', 'Copy'],
      checklist: [
        { title: 'Draft', done: true },
        { title: 'Review', done: false },
      ],
    });
  });
});
