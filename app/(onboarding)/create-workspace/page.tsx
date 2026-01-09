'use client';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { createWorkspace } from '@/features/workspaces/actions';
import { zodResolver } from '@hookform/resolvers/zod';
import { Rocket } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import z from 'zod';

const workspaceFormSchema = z.object({
  name: z.string().min(1, 'Workspace name is required'),
  url: z
    .string()
    .min(1, 'Workspace URL is required')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'URL must contain only lowercase letters, numbers, and hyphens'
    ),
  description: z.string().optional(),
});

export default function CreateWorkspace() {
  const [step, setStep] = useState(1);
  const totalSteps = 2;

  const form = useForm<z.infer<typeof workspaceFormSchema>>({
    resolver: zodResolver(workspaceFormSchema),
    defaultValues: {
      name: '',
      url: '',
      description: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof workspaceFormSchema>) => {
    const result = await createWorkspace(values);
    if (result?.error) {
      alert(result.error);
      return;
    }
  };
  return (
    <div className='bg-background h-dvh flex items-center justify-center p-6'>
      <div className='w-full max-w-md space-y-12'>
        <div className='space-y-2'>
          <div className='flex items-center justify-between'>
            <span className='text-sm font-medium'>Step 1 of 2</span>
            <span className='text-sm font-medium'>Workspace Setup</span>
          </div>
          <Progress value={(step / totalSteps) * 100} />
        </div>
        <div className='space-y-4'>
          <div className='size-12 bg-primary/25 flex items-center justify-center rounded-full mx-auto'>
            <Rocket className='text-primary size-6' />
          </div>
          <div>
            <h1 className='text-3xl font-bold text-center'>
              Create your workspace
            </h1>
            <p className='text-sm text-center text-muted-foreground'>
              Set up your workspace to get started with your projects.
            </p>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Workspace Name</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g. Tide Corp Design' {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='url'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Workspace URL</FormLabel>
                  <FormControl>
                    <Input placeholder='e.g. tide-corp-design' {...field} />
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
                  <FormLabel>
                    Description{' '}
                    <span className='ml-auto text-xs font-normal text-muted-foreground'>
                      Optional
                    </span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder='Describe your workspace'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Separator className='mt-8' />
            <div className='flex justify-between'>
              <Button variant='ghost'>Back</Button>
              <Button type='submit'>Create Workspace</Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
