'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { TaskCardDueDate } from './task-card-due-date';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createTaskSchema } from '../schema';

// The inline form only asks for a title; descriptions are added in the task sheet.
const inlineTaskSchema = createTaskSchema.omit({ description: true });
import z from 'zod';
import { Form, FormControl, FormField, FormItem } from '@/components/ui/form';
import { useParams } from 'next/navigation';
import { createTask } from '../actions';
import { toast } from 'sonner';
import type { TaskData } from './task-meta';
import { SHORTCUT_EVENTS, takeAddTaskRequest } from '@/lib/shortcuts';

/**
 * A new task is shown at once, marked as saving, before the server replies
 * (`onAdding`); then it's swapped for the saved task (`onCreated`) or taken
 * away again if saving failed (`onFailed`), with the form reopened so
 * nothing typed is lost.
 */
export interface AddTaskCallbacks {
  onAdding?: (pendingId: string, task: TaskData) => void;
  onCreated?: (pendingId: string, task: TaskData) => void;
  onFailed?: (pendingId: string) => void;
}

interface AddTaskInlineProps extends AddTaskCallbacks {
  statusId: string;
  /** The default column answers the "C" shortcut (lib/shortcuts.ts). */
  answersShortcut?: boolean;
}

export function AddTaskInline({ statusId, onAdding, onCreated, onFailed, answersShortcut = false }: AddTaskInlineProps) {
  const [showInput, setShowInput] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // "C": open this form. The request may come before the board mounted
  // (switching from the list), so a pending one is taken on mount too.
  useEffect(() => {
    if (!answersShortcut) return;
    const open = () => {
      if (!takeAddTaskRequest()) return;
      setShowInput(true);
      containerRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    open();
    window.addEventListener(SHORTCUT_EVENTS.addTask, open);
    return () => window.removeEventListener(SHORTCUT_EVENTS.addTask, open);
  }, [answersShortcut]);
  const params = useParams<{ projectId: string }>();
  const { projectId } = params;

  const form = useForm<z.infer<typeof inlineTaskSchema>>({
    resolver: zodResolver(inlineTaskSchema),
    defaultValues: {
      title: '',
      dueDate: undefined,
      order: 1,
      projectId,
      statusId,
    },
  });

  const onSubmit = async (values: z.infer<typeof inlineTaskSchema>) => {
    const pendingId = `pending-${crypto.randomUUID()}`;
    onAdding?.(pendingId, {
      id: pendingId,
      title: values.title,
      priority: 'medium',
      dueDate: values.dueDate ?? null,
      assignees: [],
      pending: true,
    });
    setShowInput(false);
    form.reset();

    let result: Awaited<ReturnType<typeof createTask>>;
    try {
      result = await createTask(values);
    } catch {
      result = { error: 'Could not add the task. Check your connection and try again.' };
    }

    if (result?.error || !result.task) {
      onFailed?.(pendingId);
      toast.error(result?.error ?? 'Could not add the task. Try again.', { position: 'top-center' });
      // Bring the form back with what was typed.
      form.reset({ ...values });
      setShowInput(true);
      return;
    }

    onCreated?.(pendingId, {
      id: result.task.id,
      title: result.task.title,
      priority: result.task.priority,
      dueDate: result.task.dueDate ?? null,
      assignees: [],
    });
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      if (target.closest('[data-ignore-outside-click]')) {
        return;
      }

      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowInput(false);
        form.reset();
      }
    };

    if (showInput) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showInput, form]);

  return (
    <div ref={containerRef}>
      {showInput ? (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className='rounded-lg bg-white ring ring-primary'>
              <FormField
                control={form.control}
                name='title'
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        {...field}
                        autoFocus
                        placeholder='Task Name'
                        className='border-none outline-none focus-visible:ring-0 shadow-none'
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <div className='flex items-center gap-2 p-2'>
                <FormField
                  control={form.control}
                  name='dueDate'
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <TaskCardDueDate
                          date={field.value}
                          setDate={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </form>
        </Form>
      ) : (
        <Button
          onClick={() => setShowInput(true)}
          variant='ghost'
          size='sm'
          className='hover:bg-background/50 w-full justify-start cursor-pointer'>
          <Plus />
          Add task
        </Button>
      )}
    </div>
  );
}
