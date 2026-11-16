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
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import z from 'zod';
import { inviteUserToWorkspace } from '../invite-actions';
import { inviteMemberSchema } from '../schema';
import { toast } from 'sonner';
import { InviteLinkNotice, type SentInvite } from './invite-link-notice';
import { useState } from 'react';

interface InviteMemberFormProps {
  workspaceSlug: string;
  canInvite: boolean;
  /** Stack the fields vertically (for narrow containers such as a dialog). */
  compact?: boolean;
}

export function InviteMemberForm({
  workspaceSlug,
  canInvite,
  compact = false,
}: InviteMemberFormProps) {
  const [sent, setSent] = useState<SentInvite | null>(null);
  const form = useForm<z.infer<typeof inviteMemberSchema>>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: {
      workspaceSlug,
      email: '',
      role: 'member',
    },
  });

  const onSubmit = async (values: z.infer<typeof inviteMemberSchema>) => {
    const result = await inviteUserToWorkspace(workspaceSlug, {
      email: values.email,
      role: values.role,
    });
    if (result.error !== undefined) {
      toast.error(result.error, { position: 'top-center' });
      return;
    }

    setSent({ email: result.email, inviteUrl: result.inviteUrl, emailSent: result.emailSent });
    if (result.emailSent) {
      toast.success(`Invite sent to ${result.email}`, { position: 'top-center' });
    } else {
      toast.warning("Invite created, but the email couldn't be sent. Share the link instead.", {
        position: 'top-center',
      });
    }

    form.reset({ workspaceSlug, email: '', role: values.role });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className='space-y-4'>
        <div
          className={cn(
            'grid gap-4 items-start',
            !compact && 'md:grid-cols-[1fr_180px_120px]',
          )}>
          <FormField
            control={form.control}
            name='email'
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type='email'
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
                    <SelectTrigger className='w-full' aria-label='Role'>
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
          <div className={cn('flex items-end', !compact && 'md:pt-5.5')}>
            <Button
              type='submit'
              className='w-full'
              disabled={!canInvite || form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Sending…' : 'Send invite'}
            </Button>
          </div>
        </div>
        {!canInvite && (
          <p className='text-sm text-muted-foreground'>
            Only workspace admins or owners can invite members.
          </p>
        )}
        {sent && <InviteLinkNotice invite={sent} />}
      </form>
    </Form>
  );
}
