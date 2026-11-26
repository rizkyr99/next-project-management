import { describe, expect, it } from 'vitest';
import { projectToTemplate, stripUploadedImages, templateToRows, type ProjectRows } from '@/features/templates/convert';
import { BUILTIN_TEMPLATES } from '@/features/templates/builtin';
import { templateDataSchema } from '@/features/templates/shape';
import { dayInZone, timeInZone } from '@/features/templates/dates';

const TZ = 'Asia/Jakarta';

const rows: ProjectRows = {
  statuses: [
    { id: 's1', name: 'To Do', color: null, isDefault: true },
    { id: 's2', name: 'Review', color: 'yellow', isDefault: false },
    { id: 's3', name: 'Done', color: 'not-a-colour', isDefault: false },
  ],
  tasks: [
    {
      id: 't1',
      title: 'Kickoff',
      description: 'Agenda\n\n![shot](/api/files/abc-123)\n\nNotes',
      priority: 'high',
      // Day-only: local midnight Nov 12 in Jakarta.
      dueDate: new Date('2026-11-11T17:00:00Z'),
      dueHasTime: false,
      statusId: 's1',
    },
    {
      id: 't2',
      title: 'Present',
      description: null,
      priority: 'medium',
      // Nov 20, 14:30 in Jakarta.
      dueDate: new Date('2026-11-20T07:30:00Z'),
      dueHasTime: true,
      statusId: 's2',
    },
    { id: 't3', title: 'Wrap up', description: '![x](/api/files/only)', priority: 'low', dueDate: null, dueHasTime: false, statusId: 's3' },
  ],
  labels: [
    { taskId: 't1', name: 'Design', color: 'purple' },
    { taskId: 't2', name: 'design', color: 'blue' },
    { taskId: 't2', name: 'Client', color: null },
  ],
  checklist: [
    { taskId: 't1', title: 'Send agenda' },
    { taskId: 't1', title: 'Book room' },
  ],
};

describe('stripUploadedImages', () => {
  it('drops pasted images but keeps outside links and text', () => {
    expect(stripUploadedImages('A\n\n![s](/api/files/1)\n\nB')).toBe('A\n\nB');
    expect(stripUploadedImages('![logo](https://example.com/x.png)')).toBe('![logo](https://example.com/x.png)');
    expect(stripUploadedImages('![s](/api/files/1)')).toBeNull();
    expect(stripUploadedImages(null)).toBeNull();
  });
});

describe('projectToTemplate', () => {
  const data = projectToTemplate(rows, TZ);

  it('keeps columns, flags one default and drops unknown colours', () => {
    expect(data.columns).toEqual([
      { name: 'To Do', color: null, isDefault: true },
      { name: 'Review', color: 'yellow', isDefault: false },
      { name: 'Done', color: null, isDefault: false },
    ]);
  });

  it('counts due dates from the earliest one, keeping times of day', () => {
    expect(data.tasks.map((t) => t.due)).toEqual([{ days: 0, time: null }, { days: 8, time: '14:30' }, null]);
  });

  it('keeps labels once (by name, any case), checklists and descriptions without images', () => {
    expect(data.labels).toEqual([
      { name: 'Design', color: 'purple' },
      { name: 'Client', color: null },
    ]);
    expect(data.tasks[1].labels).toEqual(['design', 'Client']);
    expect(data.tasks[0].checklist).toEqual(['Send agenda', 'Book room']);
    expect(data.tasks[0].description).toBe('Agenda\n\nNotes');
    expect(data.tasks[2].description).toBeNull();
    expect(templateDataSchema.safeParse(data).success).toBe(true);
  });
});

describe('templateToRows', () => {
  let n = 0;
  const newId = () => `id-${++n}`;
  const data = projectToTemplate(rows, TZ);
  const out = templateToRows(data, {
    projectId: 'p',
    workspaceId: 'w',
    startDay: '2027-01-04',
    timeZone: 'Europe/London',
    existingLabels: [{ id: 'existing-design', name: 'DESIGN' }],
    labelSlots: 10,
    newId,
  });

  it('dates tasks from the new start day in the new time zone', () => {
    const [kickoff, present, wrap] = out.tasks;
    expect(dayInZone(kickoff.dueDate!, 'Europe/London')).toBe('2027-01-04');
    expect(kickoff.dueHasTime).toBe(false);
    expect(dayInZone(present.dueDate!, 'Europe/London')).toBe('2027-01-12');
    expect(timeInZone(present.dueDate!, 'Europe/London')).toBe('14:30');
    expect(present.dueHasTime).toBe(true);
    expect(wrap.dueDate).toBeNull();
  });

  it('puts tasks in their columns, in order, and makes the default column', () => {
    expect(out.statuses.map((s) => [s.name, s.order, s.isDefault])).toEqual([
      ['To Do', 1, true],
      ['Review', 2, false],
      ['Done', 3, false],
    ]);
    expect(out.tasks.map((t) => [t.statusId, t.order])).toEqual([
      [out.statuses[0].id, 1],
      [out.statuses[1].id, 1],
      [out.statuses[2].id, 1],
    ]);
  });

  it('reuses workspace labels by name and creates the missing ones', () => {
    expect(out.labels).toEqual([{ id: expect.any(String), workspaceId: 'w', name: 'Client', color: null }]);
    const client = out.labels[0].id;
    expect(out.taskLabels).toEqual([
      { taskId: out.tasks[0].id, labelId: 'existing-design' },
      { taskId: out.tasks[1].id, labelId: 'existing-design' },
      { taskId: out.tasks[1].id, labelId: client },
    ]);
    expect(out.checklist).toEqual([
      { taskId: out.tasks[0].id, title: 'Send agenda', position: 0 },
      { taskId: out.tasks[0].id, title: 'Book room', position: 1 },
    ]);
  });

  it('skips new labels once the workspace is at its label limit', () => {
    const full = templateToRows(data, {
      projectId: 'p',
      workspaceId: 'w',
      startDay: '2027-01-04',
      timeZone: 'UTC',
      existingLabels: [],
      labelSlots: 0,
    });
    expect(full.labels).toEqual([]);
    expect(full.taskLabels).toEqual([]);
  });
});

describe('built-in templates', () => {
  it.each(BUILTIN_TEMPLATES.map((t) => [t.name, t] as const))('%s is a valid template', (_name, t) => {
    expect(templateDataSchema.safeParse(t.data).success).toBe(true);
    expect(t.taskCount).toBe(t.data.tasks.length);
    for (const task of t.data.tasks) {
      for (const l of task.labels) expect(t.data.labels.map((x) => x.name)).toContain(l);
    }
  });
});

describe('start dates (B4)', () => {
  it('keeps a task’s start as days after the earliest date, and puts it back from the new start day', () => {
    const data = projectToTemplate(
      {
        ...rows,
        tasks: [
          // Starts two days before anything is due: that start is day 0.
          { ...rows.tasks[0], startDate: '2026-11-10' },
          rows.tasks[1],
          rows.tasks[2],
        ],
      },
      TZ,
    );
    expect(data.tasks[0].start).toEqual({ days: 0 });
    expect(data.tasks[0].due).toEqual({ days: 2, time: null });
    expect(data.tasks[1].start).toBeNull();
    expect(templateDataSchema.safeParse(data).success).toBe(true);

    const out = templateToRows(data, {
      projectId: 'p',
      workspaceId: 'w',
      startDay: '2027-03-01',
      timeZone: 'UTC',
      existingLabels: [],
      labelSlots: 10,
    });
    expect(out.tasks[0].startDate).toBe('2027-03-01');
    expect(dayInZone(out.tasks[0].dueDate!, 'UTC')).toBe('2027-03-03');
    expect(out.tasks[1].startDate).toBeNull();
  });

  it('accepts templates saved before start dates existed', () => {
    const old = { columns: [{ name: 'To Do', color: null, isDefault: true }], labels: [], tasks: [] };
    const task = { title: 'T', description: null, priority: 'low', column: 0, due: null, labels: [], checklist: [] };
    expect(templateDataSchema.safeParse({ ...old, tasks: [task] }).success).toBe(true);
  });
});
