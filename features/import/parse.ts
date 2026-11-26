import type { StatusColor } from '@/features/projects/status-colors';
import { PRIORITIES, type Priority } from '@/features/tasks/priority';
import { MAX_DESCRIPTION_LENGTH } from '@/features/tasks/schema';
import { MAX_STATUSES_PER_PROJECT } from '@/features/projects/schema';
import { dayKey } from '@/features/tasks/due';

/**
 * D4: reading a Trello board export (JSON) or a CSV file into a project, in
 * the browser, in the viewer's time zone. The server checks the result again
 * (features/import/shape.ts) before writing anything.
 */

export interface ImportedTask {
  title: string;
  description: string | null;
  priority: Priority;
  /** Index into `columns`. */
  column: number;
  /** "YYYY-MM-DD" */
  startDay: string | null;
  /** A day, and a time ("HH:MM") when the due date has one. */
  due: { day: string; time: string | null } | null;
  labels: string[];
  checklist: { title: string; done: boolean }[];
}

export interface ImportedProject {
  source: 'trello' | 'csv';
  /** The board's name, when the file has one. */
  name: string | null;
  columns: { name: string; color: StatusColor | null }[];
  labels: { name: string; color: StatusColor | null }[];
  tasks: ImportedTask[];
  /** Archived lists and cards left out, and rows without a title. */
  skipped: number;
}

export class ImportError extends Error {}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);
const title = (s: unknown) => clip(typeof s === 'string' ? s.trim() : '', 255);
const pad = (n: number) => String(n).padStart(2, '0');

/** A moment's local day and time; a Trello date picked without a time is stored as noon, so noon means "that day". */
function dueFromInstant(iso: string): ImportedTask['due'] {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return { day: dayKey(d), time: time === '12:00' ? null : time };
}

// Trello's label colours, on Tide's colour keys.
const TRELLO_COLORS: Record<string, StatusColor> = {
  green: 'green',
  lime: 'green',
  yellow: 'yellow',
  orange: 'orange',
  red: 'red',
  purple: 'purple',
  pink: 'pink',
  blue: 'blue',
  sky: 'blue',
  black: 'gray',
};
const trelloColor = (c: unknown): StatusColor | null =>
  typeof c === 'string' ? (TRELLO_COLORS[c.replace(/_(light|dark)$/, '')] ?? null) : null;

type TrelloList = { id: string; name: string; closed?: boolean; pos?: number };
type TrelloCard = {
  id: string;
  name: string;
  desc?: string;
  idList: string;
  closed?: boolean;
  pos?: number;
  due?: string | null;
  start?: string | null;
  labels?: { name?: string; color?: string | null }[];
};
type TrelloChecklist = { idCard: string; pos?: number; checkItems?: { name: string; state?: string; pos?: number }[] };

type LabelMap = Map<string, { name: string; color: StatusColor | null }>;
const byPos = <T extends { pos?: number }>(a: T, b: T) => (a.pos ?? 0) - (b.pos ?? 0);

/** A card's label names, adding new ones to the board's list. Trello labels can be colour-only; those are named by their colour. */
function trelloCardLabels(card: TrelloCard, labels: LabelMap): string[] {
  const names: string[] = [];
  for (const l of card.labels ?? []) {
    const name = clip((l.name?.trim() || l.color || '').trim(), 40);
    if (!name) continue;
    if (!labels.has(name.toLowerCase())) labels.set(name.toLowerCase(), { name, color: trelloColor(l.color) });
    if (!names.includes(name)) names.push(name);
  }
  return names.slice(0, 10);
}

/** A card's checklists, flattened in order. */
function trelloChecklist(lists: TrelloChecklist[]): ImportedTask['checklist'] {
  return [...lists]
    .sort(byPos)
    .flatMap((c) => [...(c.checkItems ?? [])].sort(byPos))
    .filter((i) => i.name?.trim())
    .map((i) => ({ title: title(i.name), done: i.state === 'complete' }));
}

/** A Trello board export (Board menu → Print, export and share → Export as JSON). */
export function parseTrello(json: unknown): ImportedProject {
  const board = json as { name?: string; lists?: TrelloList[]; cards?: TrelloCard[]; checklists?: TrelloChecklist[] };
  if (!board || !Array.isArray(board.lists) || !Array.isArray(board.cards)) {
    throw new ImportError('That isn’t a Trello board export. In Trello, open the board menu and choose Export as JSON.');
  }
  const lists = board.lists.filter((l) => !l.closed).sort(byPos);
  if (lists.length === 0) throw new ImportError('This board has no open lists to import.');
  if (lists.length > MAX_STATUSES_PER_PROJECT) {
    throw new ImportError(`This board has ${lists.length} lists; a project can have up to ${MAX_STATUSES_PER_PROJECT} columns.`);
  }
  const listIndex = new Map(lists.map((l, i) => [l.id, i]));

  const checklists = new Map<string, TrelloChecklist[]>();
  for (const c of board.checklists ?? []) checklists.set(c.idCard, [...(checklists.get(c.idCard) ?? []), c]);

  const labels: LabelMap = new Map();
  let skipped = board.lists.length - lists.length;
  const tasks: ImportedTask[] = [];
  for (const card of [...board.cards].sort(byPos)) {
    const column = listIndex.get(card.idList);
    if (card.closed || column === undefined || !title(card.name)) {
      skipped++;
      continue;
    }
    tasks.push({
      title: title(card.name),
      description: card.desc?.trim() ? clip(card.desc.trim(), MAX_DESCRIPTION_LENGTH) : null,
      priority: 'medium',
      column,
      startDay: card.start ? dayKey(new Date(card.start)) : null,
      due: card.due ? dueFromInstant(card.due) : null,
      labels: trelloCardLabels(card, labels),
      checklist: trelloChecklist(checklists.get(card.id) ?? []),
    });
  }
  return {
    source: 'trello',
    name: board.name?.trim() ? clip(board.name.trim(), 100) : null,
    columns: lists.map((l) => ({ name: clip(l.name.trim() || 'Untitled', 64), color: null })),
    labels: [...labels.values()],
    tasks,
    skipped,
  };
}

/** RFC 4180 CSV: quoted fields, doubled quotes, commas and line breaks inside quotes. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

const HEADERS: Record<string, string[]> = {
  title: ['title', 'name', 'task', 'card name', 'task name'],
  column: ['column', 'status', 'list', 'stage'],
  description: ['description', 'notes', 'desc'],
  priority: ['priority'],
  start: ['start date', 'start'],
  due: ['due date', 'due', 'deadline'],
  time: ['due time', 'time'],
  labels: ['labels', 'tags', 'label'],
  checklist: ['checklist', 'subtasks', 'checklist items'],
};

/** "2026-12-01", or a full date-time, as a local day; null when it isn't a date. */
function csvDay(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : dayKey(d);
}

/** One CSV row's task (all but its column), adding its labels to the file's list. */
function csvTask(name: string, field: (key: string) => string, labels: LabelMap): Omit<ImportedTask, 'column'> {
  const priority = field('priority').toLowerCase();
  const dueDay = csvDay(field('due'));
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(field('time')) ? field('time') : null;
  const taskLabels = [...new Set(field('labels').split(/[;,]/).map((l) => clip(l.trim(), 40)).filter(Boolean))];
  for (const l of taskLabels) if (!labels.has(l.toLowerCase())) labels.set(l.toLowerCase(), { name: l, color: null });
  return {
    title: name,
    description: field('description') ? clip(field('description'), MAX_DESCRIPTION_LENGTH) : null,
    priority: (PRIORITIES as readonly string[]).includes(priority) ? (priority as Priority) : 'medium',
    startDay: csvDay(field('start')),
    due: dueDay ? { day: dueDay, time } : null,
    labels: taskLabels.slice(0, 10),
    checklist: field('checklist')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({ title: title(line.replace(/^\[[ x]\]\s*/i, '')), done: /^\[x\]/i.test(line) }))
      .filter((i) => i.title),
  };
}

/**
 * A CSV with a header row. Only Title is required; Column, Description,
 * Priority, Start date, Due date, Due time, Labels and Checklist are read when
 * present (the same columns Tide's export writes, so a project round-trips).
 * Checklist items go one per line, "[x] " marking done ones.
 */
export function parseCsv(text: string): ImportedProject {
  const rows = parseCsvRows(text);
  if (rows.length < 2) throw new ImportError('The file needs a header row and at least one task.');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (key: string) => header.findIndex((h) => HEADERS[key].includes(h));
  const at = Object.fromEntries(Object.keys(HEADERS).map((k) => [k, col(k)])) as Record<string, number>;
  if (at.title === -1) throw new ImportError('The file needs a Title column (or Name, or Task).');
  // Tide's export puts an apostrophe before a leading = + - @ (features/import/csv.ts).
  const get = (row: string[], key: string) =>
    at[key] >= 0 ? (row[at[key]] ?? '').trim().replace(/^'(?=[=+\-@])/, '') : '';

  const columnIndex = new Map<string, number>();
  const columns: ImportedProject['columns'] = [];
  const columnFor = (name: string) => {
    const key = (name || 'To Do').toLowerCase();
    let i = columnIndex.get(key);
    if (i === undefined) {
      i = columns.length;
      columns.push({ name: clip(name || 'To Do', 64), color: null });
      columnIndex.set(key, i);
    }
    return i;
  };
  const labels: LabelMap = new Map();
  let skipped = 0;
  const tasks: ImportedTask[] = [];
  for (const row of rows.slice(1)) {
    const name = title(get(row, 'title'));
    if (!name) {
      skipped++;
      continue;
    }
    const field = (key: string) => get(row, key);
    tasks.push({ ...csvTask(name, field, labels), column: columnFor(field('column')) });
  }
  if (columns.length > MAX_STATUSES_PER_PROJECT) {
    throw new ImportError(`The file has ${columns.length} columns; a project can have up to ${MAX_STATUSES_PER_PROJECT}.`);
  }
  return { source: 'csv', name: null, columns, labels: [...labels.values()], tasks, skipped };
}

/** Picks the parser by file type: .json is Trello, anything else is CSV. */
export function parseImport(fileName: string, text: string): ImportedProject {
  if (/\.json$/i.test(fileName)) {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new ImportError('That JSON file couldn’t be read. Export the board from Trello again.');
    }
    return parseTrello(json);
  }
  return parseCsv(text);
}
