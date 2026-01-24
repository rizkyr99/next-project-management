'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { TaskCardDueDate } from './task-card-due-date';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createTaskSchema } from '../schema';
import z from 'zod';
import { Form, FormControl, FormField, FormItem } from '@/components/ui/form';
import { useParams } from 'next/navigation';
import { createTask } from '../actions';
import { toast } from 'sonner';

interface AddTaskInlineProps {
  statusId: string;
}

export function AddTaskInline({ statusId }: AddTaskInlineProps) {
  const [showInput, setShowInput] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const params = useParams<{ projectId: string }>();
  const { projectId } = params;

  const form = useForm<z.infer<typeof createTaskSchema>>({
    resolver: zodResolver(createTaskSchema),
    defaultValues: {
      title: '',
      dueDate: undefined,
      order: 1,
      projectId,
      statusId,
    },
  });

  const onSubmit = async (values: z.infer<typeof createTaskSchema>) => {
    setShowInput(false);

    const result = await createTask(values);
    if (result?.error) {
      toast.error(result.error, { position: 'top-center' });
    }

    toast.success('Project created successfully', { position: 'top-center' });
    form.reset();
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
