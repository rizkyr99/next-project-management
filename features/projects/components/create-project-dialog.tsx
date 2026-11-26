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

const BLANK = 'blank';

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
  const usingTemplate = !!templateId && templateId !== BLANK;

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
              <Button type='submit' disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Creating…' : 'Create project'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
