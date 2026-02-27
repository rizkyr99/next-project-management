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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import z from 'zod';
import { inviteWorkspaceMember } from '../actions';
import { inviteMemberSchema } from '../schema';
import { toast } from 'sonner';

interface InviteMemberFormProps {
  workspaceSlug: string;
  canInvite: boolean;
}

export function InviteMemberForm({
  workspaceSlug,
  canInvite,
}: InviteMemberFormProps) {
  const form = useForm<z.infer<typeof inviteMemberSchema>>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: {
      workspaceSlug,
      email: '',
      role: 'member',
    },
  });

  const onSubmit = async (values: z.infer<typeof inviteMemberSchema>) => {
    const result = await inviteWorkspaceMember(values);
    if (result?.error) {
      toast.error(result.error, { position: 'top-center' });
      return;
    }

    if (result?.status === 'added') {
      toast.success('Member added to workspace', { position: 'top-center' });
    } else {
      toast.success('Invite sent', { position: 'top-center' });
    }

    form.reset({
      workspaceSlug,
      email: '',
      role: values.role,
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
        <div className='grid gap-4 md:grid-cols-[1fr_180px_120px] items-start'>
          <FormField
            control={form.control}
            name='email'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    placeholder='teammate@company.com'
                    autoComplete='email'
                    disabled={!canInvite}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='role'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Role</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={!canInvite}>
                  <FormControl>
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder='Select role' />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value='member'>Member</SelectItem>
                    <SelectItem value='admin'>Admin</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className='flex items-end pt-5.5'>
            <Button type='submit' className='w-full' disabled={!canInvite}>
              Send invite
            </Button>
          </div>
        </div>
        {!canInvite ? (
          <p className='text-sm text-muted-foreground'>
            Only workspace admins or owners can invite members.
          </p>
        ) : null}
      </form>
    </Form>
  );
}
