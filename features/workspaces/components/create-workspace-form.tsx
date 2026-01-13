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
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import z from 'zod';
import { createWorkspace } from '../actions';
import { toast } from 'sonner';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useRouter } from 'next/navigation';
import { workspaceFormSchema } from '../schema';

interface CreateWorkspaceFormProps {
  onSuccess?: () => void;
}

export function CreateWorkspaceForm({ onSuccess }: CreateWorkspaceFormProps) {
  const router = useRouter();
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
      toast.error(result.error, { position: 'top-center' });
      return;
    }
    router.push(`${result.slug}`);
    onSuccess?.();
  };

  return (
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
                <Textarea placeholder='Describe your workspace' {...field} />
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
  );
}
