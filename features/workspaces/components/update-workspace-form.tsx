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
import { Textarea } from '@/components/ui/textarea';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import z from 'zod';
import { updateWorkspace } from '../actions';
import { toast } from 'sonner';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
});

interface UpdateWorkspaceFormProps {
  workspaceSlug: string;
  defaultValues: {
    name: string;
    description?: string | null;
  };
  canEdit: boolean;
}

export function UpdateWorkspaceForm({
  workspaceSlug,
  defaultValues,
  canEdit,
}: UpdateWorkspaceFormProps) {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues.name,
      description: defaultValues.description ?? '',
    },
  });

  const onSubmit = async (values: z.infer<typeof schema>) => {
    const result = await updateWorkspace(workspaceSlug, values);
    if (result?.error) {
      toast.error(result.error, { position: 'top-center' });
      return;
    }
    toast.success('Workspace updated', { position: 'top-center' });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
        <FormField
          control={form.control}
          name='name'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Workspace name</FormLabel>
              <FormControl>
                <Input placeholder='My workspace' disabled={!canEdit} {...field} />
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
                <Textarea
                  placeholder='Describe what this workspace is for…'
                  disabled={!canEdit}
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {canEdit && (
          <Button type='submit' disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Saving…' : 'Save changes'}
          </Button>
        )}
        {!canEdit && (
          <p className='text-sm text-muted-foreground'>
            Only admins and owners can edit workspace details.
          </p>
        )}
      </form>
    </Form>
  );
}
