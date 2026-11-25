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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
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
  /** Active projects, to share with a guest. */
  projects?: { id: string; name: string }[];
}

export function InviteMemberForm({
  workspaceSlug,
  canInvite,
  compact = false,
  projects = [],
}: InviteMemberFormProps) {
  const [sent, setSent] = useState<SentInvite | null>(null);
  const form = useForm<z.input<typeof inviteMemberSchema>, unknown, z.output<typeof inviteMemberSchema>>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: {
      workspaceSlug,
      email: '',
      role: 'member',
      projectIds: [],
    },
  });
  const role = useWatch({ control: form.control, name: 'role' });

  const onSubmit = async (values: z.output<typeof inviteMemberSchema>) => {
    const result = await inviteUserToWorkspace(workspaceSlug, {
      email: values.email,
      role: values.role,
      ...(values.role === 'guest' && { projectIds: values.projectIds }),
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

    form.reset({ workspaceSlug, email: '', role: values.role, projectIds: values.projectIds });
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
                    <SelectItem value='guest'>Guest (client)</SelectItem>
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
        {role === 'guest' && (
          <FormField
            control={form.control}
            name='projectIds'
            render={({ field }) => {
              const chosen = field.value ?? [];
              return (
                <FormItem>
                  <fieldset className='space-y-2'>
                    <legend className='text-sm font-medium'>Projects to share</legend>
                    <p className='text-xs text-muted-foreground'>
                      Guests see only these projects, and can comment on them. They can&apos;t edit tasks or see
                      anything else in the workspace.
                    </p>
                    {projects.length === 0 ? (
                      <p className='text-sm text-muted-foreground'>Create a project first, then share it.</p>
                    ) : (
                      <div className='max-h-48 space-y-1 overflow-y-auto rounded-md border p-2'>
                        {projects.map((p) => (
                          <label key={p.id} className='flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted'>
                            <Checkbox
                              checked={chosen.includes(p.id)}
                              disabled={!canInvite}
                              onCheckedChange={(on) =>
                                field.onChange(on ? [...chosen, p.id] : chosen.filter((id) => id !== p.id))
                              }
                            />
                            <span className='truncate'>{p.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </fieldset>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
        )}
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
