/**
 * D4: writing a project as CSV, in the columns the importer reads back
 * (features/import/parse.ts), so an exported project can be imported again.
 */

export const EXPORT_HEADER = [
  'Title',
  'Column',
  'Priority',
  'Start date',
  'Due date',
  'Due time',
  'Assignees',
  'Labels',
  'Checklist',
  'Description',
] as const;

/**
 * One CSV field. Quoted when it holds a comma, quote or line break. A leading
 * = + - @ (or tab, CR) gets an apostrophe, so a spreadsheet shows it as text
 * instead of running it as a formula; the importer takes the apostrophe off.
 */
export function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(rows: string[][]): string {
  // CRLF per RFC 4180; the BOM tells Excel the file is UTF-8.
  return '﻿' + rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}

export interface ExportTask {
  title: string;
  column: string;
  priority: string;
  startDay: string | null;
  dueDay: string | null;
  dueTime: string | null;
  assignees: string[];
  labels: string[];
  checklist: { title: string; done: boolean }[];
  description: string | null;
}

export function exportRows(tasks: ExportTask[]): string[][] {
  return [
    [...EXPORT_HEADER],
    ...tasks.map((t) => [
      t.title,
      t.column,
      t.priority,
      t.startDay ?? '',
      t.dueDay ?? '',
      t.dueTime ?? '',
      t.assignees.join(', '),
      t.labels.join(', '),
      t.checklist.map((i) => `${i.done ? '[x]' : '[ ]'} ${i.title}`).join('\n'),
      t.description ?? '',
    ]),
  ];
}

/** "Website redesign" → "website-redesign.csv". */
export function exportFileName(projectName: string): string {
  const slug = projectName
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .slice(0, 60);
  return `${slug || 'project'}.csv`;
}
