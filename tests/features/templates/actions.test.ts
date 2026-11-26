import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chain } from '../../helpers/db-mock';

const db = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  batch: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock('@/db/drizzle', () => ({ db }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/activity', () => ({ insertActivity: vi.fn() }));
vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return { ...actual, enforceRateLimit: vi.fn() };
});
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/authz', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/authz')>();
  return { ...actual, requireProjectAccess: vi.fn() };
});

import { auth } from '@/lib/auth';
import { insertActivity } from '@/lib/activity';
import { enforceRateLimit } from '@/lib/rate-limit';
import { AuthzError, requireProjectAccess } from '@/lib/authz';
import { createProject } from '@/features/projects/actions';
import { deleteTemplate, saveProjectAsTemplate } from '@/features/templates/actions';
import { BUILTIN_TEMPLATES } from '@/features/templates/builtin';
import { MAX_TEMPLATES_PER_WORKSPACE, templateDataSchema, type TemplateData } from '@/features/templates/shape';

const session = { user: { id: 'user-1', name: 'Alice' } };
const PROJECT = '11111111-1111-4111-8111-111111111111';
const TEMPLATE = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(auth.api.getSession).mockResolvedValue(session as never);
});

function captureInserts() {
  const inserted: unknown[] = [];
  db.insert.mockImplementation(() => ({
    values: (v: unknown) => {
      inserted.push(v);
      const q = { returning: () => q };
      return q;
    },
  }));
  return inserted;
}

describe('createProject from a template (B5)', () => {
  it('writes the project, columns, new labels, tasks, task labels and checklists in one batch', async () => {
    db.select
      .mockReturnValueOnce(chain([{ workspaceId: 'ws-1' }]))
      // The workspace already has "design" (any case): it's reused, not duplicated.
      .mockReturnValueOnce(chain([{ id: 'label-design', name: 'design' }]));
    const inserted = captureInserts();
    db.batch.mockImplementation(async () => [[{ id: 'p-1', name: 'Site' }]]);

    const website = BUILTIN_TEMPLATES.find((t) => t.id === 'builtin:website')!;
    const result = await createProject({
      workspaceSlug: 'acme',
      name: 'Site',
      templateId: website.id,
      startDate: '2027-01-04',
      timeZone: 'UTC',
    });

    expect(result).toEqual({ project: { id: 'p-1', name: 'Site' } });
    expect(enforceRateLimit).toHaveBeenCalledWith('templates', 'user-1');
    expect(db.batch).toHaveBeenCalledOnce();
    const [, statuses, labels, tasks, taskLabels, checklist] = inserted as [
      unknown,
      { name: string }[],
      { name: string }[],
      { title: string; dueDate: Date | null }[],
      { labelId: string }[],
      unknown[],
    ];
    expect(statuses.map((s) => s.name)).toEqual(website.data.columns.map((c) => c.name));
    expect(labels.map((l) => l.name)).toEqual(['Copy', 'Development', 'Client feedback']);
    expect(tasks).toHaveLength(website.data.tasks.length);
    expect(tasks[0]).toMatchObject({ title: 'Kickoff call', dueDate: new Date('2027-01-04T00:00:00Z') });
    expect(taskLabels.some((l) => l.labelId === 'label-design')).toBe(true);
    expect(checklist.length).toBe(website.data.tasks.reduce((n, t) => n + t.checklist.length, 0));
    expect(insertActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'project.created', metadata: { projectName: 'Site', templateName: 'Website build' } }),
    );
  });

  it('refuses a template that does not exist, without writing', async () => {
    db.select.mockReturnValueOnce(chain([{ workspaceId: 'ws-1' }])).mockReturnValueOnce(chain([]));
    expect(await createProject({ workspaceSlug: 'acme', name: 'Site', templateId: TEMPLATE })).toEqual({
      error: 'That template no longer exists. Pick another one.',
    });
    db.select.mockReturnValueOnce(chain([{ workspaceId: 'ws-1' }]));
    expect(await createProject({ workspaceSlug: 'acme', name: 'Site', templateId: 'builtin:nope' })).toEqual({
      error: 'That template no longer exists. Pick another one.',
    });
    expect(db.batch).not.toHaveBeenCalled();
  });

  it('refuses a saved template whose stored data is broken', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.select
      .mockReturnValueOnce(chain([{ workspaceId: 'ws-1' }]))
      .mockReturnValueOnce(chain([{ name: 'Old', data: { columns: [], labels: [], tasks: [] } }]));
    expect(await createProject({ workspaceSlug: 'acme', name: 'Site', templateId: TEMPLATE })).toEqual({
      error: 'That template no longer exists. Pick another one.',
    });
    expect(db.batch).not.toHaveBeenCalled();
  });
});

const ctx = { session, role: 'member', project: { id: PROJECT, name: 'Site' }, workspace: { id: 'ws-1', slug: 'acme' } };

describe('saveProjectAsTemplate', () => {
  it('refuses people who cannot open the project (clients included)', async () => {
    vi.mocked(requireProjectAccess).mockRejectedValue(new AuthzError());
    expect(await saveProjectAsTemplate({ projectId: PROJECT, name: 'T' })).toEqual({ error: 'Not found.' });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('snapshots columns, tasks, labels and checklists', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(ctx as never);
    db.select.mockReturnValue(chain([]));
    db.batch
      .mockResolvedValueOnce([
        [{ templates: 0 }],
        [
          { id: 's1', name: 'To Do', color: null, isDefault: true },
          { id: 's2', name: 'Done', color: 'green', isDefault: false },
        ],
        [
          {
            id: 't1',
            title: 'Kickoff',
            description: null,
            priority: 'high',
            dueDate: new Date('2026-11-12T00:00:00Z'),
            dueHasTime: false,
            statusId: 's1',
          },
          {
            id: 't2',
            title: 'Launch',
            description: null,
            priority: 'urgent',
            dueDate: new Date('2026-11-20T00:00:00Z'),
            dueHasTime: false,
            statusId: 's2',
          },
        ],
      ])
      .mockResolvedValueOnce([[{ taskId: 't1', name: 'Design', color: 'purple' }], [{ taskId: 't1', title: 'Agenda' }]]);
    const inserted = captureInserts();
    db.insert.mockImplementationOnce(() => ({
      values: (v: unknown) => {
        inserted.push(v);
        return { returning: async () => [{ id: TEMPLATE }] };
      },
    }));

    expect(await saveProjectAsTemplate({ projectId: PROJECT, name: ' Website ', description: '', timeZone: 'UTC' })).toEqual({
      templateId: TEMPLATE,
    });
    const [row] = inserted as [{ name: string; description: null; taskCount: number; data: TemplateData; createdById: string }];
    expect(row).toMatchObject({ name: 'Website', description: null, taskCount: 2, createdById: 'user-1', workspaceId: 'ws-1' });
    expect(templateDataSchema.parse(row.data).tasks[0]).toEqual({
      title: 'Kickoff',
      description: null,
      priority: 'high',
      column: 0,
      due: { days: 0, time: null },
      labels: ['Design'],
      checklist: ['Agenda'],
    });
    expect(row.data.tasks[1].due).toEqual({ days: 8, time: null });
  });

  it(`stops at ${MAX_TEMPLATES_PER_WORKSPACE} templates per workspace`, async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(ctx as never);
    db.select.mockReturnValue(chain([]));
    db.batch.mockResolvedValueOnce([[{ templates: MAX_TEMPLATES_PER_WORKSPACE }], [], []]);
    const result = await saveProjectAsTemplate({ projectId: PROJECT, name: 'T' });
    expect(result.error).toMatch(/up to 50 templates/);
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe('deleteTemplate', () => {
  it('lets the person who saved it delete it', async () => {
    db.select.mockReturnValue(chain([{ createdById: 'user-1', role: 'member', slug: 'acme' }]));
    db.delete.mockReturnValue(chain(undefined));
    expect(await deleteTemplate(TEMPLATE)).toEqual({ success: true });
    expect(db.delete).toHaveBeenCalled();
  });

  it('lets an admin delete anyone’s', async () => {
    db.select.mockReturnValue(chain([{ createdById: 'user-2', role: 'admin', slug: 'acme' }]));
    db.delete.mockReturnValue(chain(undefined));
    expect(await deleteTemplate(TEMPLATE)).toEqual({ success: true });
  });

  it('stops other members', async () => {
    db.select.mockReturnValue(chain([{ createdById: 'user-2', role: 'member', slug: 'acme' }]));
    expect((await deleteTemplate(TEMPLATE)).error).toMatch(/Only the person who saved this template/);
    expect(db.delete).not.toHaveBeenCalled();
  });

  it('treats guests and other workspaces as not found', async () => {
    db.select.mockReturnValueOnce(chain([{ createdById: 'user-1', role: 'guest', slug: 'acme' }]));
    expect(await deleteTemplate(TEMPLATE)).toEqual({ error: 'Not found.' });
    db.select.mockReturnValueOnce(chain([]));
    expect(await deleteTemplate(TEMPLATE)).toEqual({ error: 'Not found.' });
    expect(db.delete).not.toHaveBeenCalled();
  });
});
