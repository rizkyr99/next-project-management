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
import { useForm } from 'react-hook-form';
import { createProjectSchema } from '../schema';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import z from 'zod';
import { useParams, useRouter } from 'next/navigation';

import { createProject } from '../actions';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';

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
    },
  });

  const onSubmit = async (values: z.infer<typeof createProjectSchema>) => {
    const result = await createProject(values);
    if ('error' in result && result.error !== undefined) {
      toast.error(result.error, { position: 'top-center' });
      return;
    }
    if (!('project' in result) || !result.project) {
      toast.error('Failed to create project.', { position: 'top-center' });
      return;
    }

    toast.success('Project created successfully', { position: 'top-center' });
    setOpen(false);
    router.push(`/workspaces/${workspaceSlug}/projects/${result.project.id}`);
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            <div className='flex items-center justify-end gap-4'>
              <Button type='button' variant='ghost'>
                Cancel
              </Button>
              <Button type='submit'>Create project</Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
