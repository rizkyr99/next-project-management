'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SidebarGroupAction } from '@/components/ui/sidebar';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { SHORTCUT_EVENTS } from '@/lib/shortcuts';
import { useForm, useWatch } from 'react-hook-form';
import { createProjectSchema } from '../schema';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import z from 'zod';
import { useParams, useRouter } from 'next/navigation';

import { createProject } from '../actions';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { listTemplates } from '@/features/templates/actions';
import { ImportError, parseImport, type ImportedProject } from '@/features/import/parse';
import { MAX_IMPORT_TASKS } from '@/features/import/shape';

const BLANK = 'blank';
const IMPORT = 'import';
/** A Trello export with its full history can run to tens of MB; only its cards are sent on. */
const MAX_IMPORT_FILE_BYTES = 50 * 1024 * 1024;

type ImportState = { fileName: string; data: ImportedProject } | { fileName: string; error: string } | null;

function importSummary(data: ImportedProject) {
  const checklist = data.tasks.reduce((n, t) => n + t.checklist.length, 0);
  const parts = [
    tasksLabel(data.tasks.length),
    `${data.columns.length} column${data.columns.length === 1 ? '' : 's'}`,
    data.labels.length > 0 && `${data.labels.length} label${data.labels.length === 1 ? '' : 's'}`,
    checklist > 0 && `${checklist} checklist item${checklist === 1 ? '' : 's'}`,
  ].filter(Boolean);
  const skipped = data.skipped > 0 ? ` ${data.skipped} archived or untitled item${data.skipped === 1 ? ' is' : 's are'} left out.` : '';
  return `${parts.join(', ')}.${skipped}`;
}

/** Today in the browser's time zone, as "YYYY-MM-DD". */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const tasksLabel = (n: number) => `${n} task${n === 1 ? '' : 's'}`;

/**
 * "New project" dialog. The sidebar shows it as its "+" action; empty states
 * and the first-run checklist use the regular button variant.
 */
export function CreateProjectDialog({
  variant = 'sidebar',
  label = 'Create a project',
}: {
  variant?: 'sidebar' | 'button';
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const params = useParams<{ workspaceSlug: string }>();

  // "New project" from ⌘K. Only the sidebar's dialog answers, so other
  // "Create a project" buttons on the page don't open a second one.
  useEffect(() => {
    if (variant !== 'sidebar') return;
    const openDialog = () => setOpen(true);
    window.addEventListener(SHORTCUT_EVENTS.newProject, openDialog);
    return () => window.removeEventListener(SHORTCUT_EVENTS.newProject, openDialog);
  }, [variant]);
  const { workspaceSlug } = params;
  const router = useRouter();

  const form = useForm({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      workspaceSlug,
      name: '',
      description: '',
      templateId: BLANK,
      startDate: '',
    },
  });
  const templateId = useWatch({ control: form.control, name: 'templateId' });
  const importing = templateId === IMPORT;
  const usingTemplate = !!templateId && templateId !== BLANK && !importing;
  const [imported, setImported] = useState<ImportState>(null);

  const pickFile = async (file: File | undefined) => {
    if (!file) return setImported(null);
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      return setImported({ fileName: file.name, error: 'That file is over 50 MB. Export fewer cards, or split the CSV.' });
    }
    try {
      const data = parseImport(file.name, await file.text());
      if (data.tasks.length === 0) throw new ImportError('There are no tasks in that file to import.');
      if (data.tasks.length > MAX_IMPORT_TASKS) {
        throw new ImportError(`That file has ${data.tasks.length} tasks; up to ${MAX_IMPORT_TASKS} can be imported at once.`);
      }
      setImported({ fileName: file.name, data });
      if (data.name && !form.getValues('name').trim()) form.setValue('name', data.name, { shouldValidate: true });
    } catch (error) {
      const message = error instanceof ImportError ? error.message : 'That file couldn’t be read.';
      setImported({ fileName: file.name, error: message });
    }
  };

  const submitImport = async (values: z.infer<typeof createProjectSchema>) => {
    if (!imported || !('data' in imported)) {
      toast.error('Choose a Trello or CSV file to import.', { position: 'top-center' });
      return;
    }
    const { data } = imported;
    const res = await fetch('/api/projects/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspaceSlug,
        name: values.name,
        description: values.description,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        source: data.source,
        columns: data.columns,
        labels: data.labels,
        tasks: data.tasks,
      }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as
      | { projectId?: string; tasks?: number; labelsLeftOff?: number; error?: string }
      | null;
    if (!res?.ok || !body?.projectId) {
      toast.error(body?.error ?? 'The project couldn’t be imported. Try again.', { position: 'top-center' });
      return;
    }
    toast.success(`Imported ${tasksLabel(body.tasks ?? 0)}`, {
      position: 'top-center',
      description: body.labelsLeftOff
        ? `${body.labelsLeftOff} label${body.labelsLeftOff === 1 ? ' was' : 's were'} left off: the workspace has reached its label limit.`
        : undefined,
    });
    setOpen(false);
    setImported(null);
    router.push(`/workspaces/${workspaceSlug}/projects/${body.projectId}`);
    form.reset();
  };

  // Loaded only while the dialog is open: a server action at page load would
  // queue ahead of the page's other actions.
  const templates = useQuery({
    queryKey: ['templates', workspaceSlug],
    enabled: open,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await listTemplates(workspaceSlug);
      if (res.error !== undefined) throw new Error(res.error);
      return res;
    },
  });
  const selected = usingTemplate
    ? [...(templates.data?.builtin ?? []), ...(templates.data?.saved ?? [])].find((t) => t.id === templateId)
    : undefined;

  const onSubmit = async (values: z.infer<typeof createProjectSchema>) => {
    if (importing) return submitImport(values);
    const result = await createProject({
      ...values,
      templateId: usingTemplate ? values.templateId : undefined,
      startDate: usingTemplate ? values.startDate || localToday() : undefined,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if ('error' in result && result.error !== undefined) {
      toast.error(result.error, { position: 'top-center' });
      return;
    }
    if (!('project' in result) || !result.project) {
      toast.error('Failed to create project.', { position: 'top-center' });
      return;
    }

    toast.success(usingTemplate ? 'Project created from template' : 'Project created successfully', {
      position: 'top-center',
    });
    setOpen(false);
    router.push(`/workspaces/${workspaceSlug}/projects/${result.project.id}`);
    form.reset();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setImported(null);
        if (next && !form.getValues('startDate')) form.setValue('startDate', localToday());
      }}>
      <DialogTrigger asChild>
        {variant === 'sidebar' ? (
          <SidebarGroupAction>
            <Plus />
            <span className='sr-only'>Add project</span>
          </SidebarGroupAction>
        ) : (
          <Button size='sm'>
            <Plus />
            {label}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create new project</DialogTitle>
          <DialogDescription>
            Create a new project to organize your tasks and collaborate with
            your team.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='templateId'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start from</FormLabel>
                  <Select value={field.value ?? BLANK} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className='w-full'>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={BLANK}>Blank project</SelectItem>
                      <SelectItem value={IMPORT}>Import from Trello or CSV…</SelectItem>
                      {templates.data && (
                        <SelectGroup>
                          <SelectLabel>Built-in templates</SelectLabel>
                          {templates.data.builtin.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                      {!!templates.data?.saved.length && (
                        <SelectGroup>
                          <SelectLabel>Your templates</SelectLabel>
                          {templates.data.saved.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                  {templates.isError && (
                    <p className='text-xs text-muted-foreground'>Templates couldn&apos;t be loaded. You can still start a blank project.</p>
                  )}
                  {selected && (
                    <p className='text-xs text-muted-foreground'>
                      {selected.description ? `${selected.description} ` : ''}
                      {tasksLabel(selected.taskCount)}, with their checklists and labels. Assignees and comments aren’t copied.
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            {importing && (
              <div className='space-y-2'>
                <Label htmlFor='import-file'>File</Label>
                <Input
                  id='import-file'
                  type='file'
                  accept='.json,.csv,application/json,text/csv'
                  onChange={(e) => pickFile(e.target.files?.[0])}
                />
                <ImportHint state={imported} />
              </div>
            )}
            {usingTemplate && (
              <FormField
                control={form.control}
                name='startDate'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start date</FormLabel>
                    <FormControl>
                      <Input type='date' {...field} />
                    </FormControl>
                    <p className='text-xs text-muted-foreground'>
                      The first due date lands on this day; the rest keep their spacing.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <div className='flex items-center justify-end gap-4'>
              <Button type='button' variant='ghost' onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type='submit'
                disabled={form.formState.isSubmitting || (importing && !(imported && 'data' in imported))}>
                {(importing ? ['Import project', 'Importing…'] : ['Create project', 'Creating…'])[
                  form.formState.isSubmitting ? 1 : 0
                ]}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ImportHint({ state }: { state: ImportState }) {
  if (state && 'error' in state) {
    return (
      <p role='alert' className='text-xs text-destructive'>
        {state.error}
      </p>
    );
  }
  if (state) {
    return (
      <p className='text-xs text-muted-foreground' data-testid='import-summary'>
        {importSummary(state.data)}
      </p>
    );
  }
  return (
    <p className='text-xs text-muted-foreground'>
      A Trello board export (board menu, then Export as JSON), or a CSV with a Title column. Column, Priority, Start
      date, Due date, Labels, Checklist and Description are read too.
    </p>
  );
}
