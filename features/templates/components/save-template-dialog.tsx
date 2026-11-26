'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useResetOnOpen } from '@/hooks/use-reset-on-open';
import { useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { saveProjectAsTemplate } from '../actions';

/** "Save as template…" from a project's menu (B5). */
export function SaveTemplateDialog({
  projectId,
  projectName,
  open,
  onOpenChange,
}: {
  projectId: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(projectName);
  const [description, setDescription] = useState('');
  const [isPending, startTransition] = useTransition();
  const queryClient = useQueryClient();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();

  useResetOnOpen(open, () => {
    setName(projectName);
    setDescription('');
  });

  const save = () =>
    startTransition(async () => {
      const result = await saveProjectAsTemplate({
        projectId,
        name,
        description,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (result.error !== undefined) {
        toast.error(result.error, { position: 'top-center' });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['templates', workspaceSlug] });
      toast.success(`Saved “${name.trim()}” as a template`, {
        position: 'top-center',
        description: 'Pick it under “Start from” when you create a project.',
      });
      onOpenChange(false);
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as template</DialogTitle>
          <DialogDescription>
            Copies this project&apos;s columns, tasks, checklists and labels. Due dates keep their spacing, counted
            from the first one. Assignees, comments, approvals and files stay here.
          </DialogDescription>
        </DialogHeader>
        <form
          className='space-y-4'
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}>
          <div className='space-y-2'>
            <Label htmlFor='template-name'>Template name</Label>
            <Input
              id='template-name'
              value={name}
              maxLength={100}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='template-description'>Description (optional)</Label>
            <Textarea
              id='template-description'
              value={description}
              maxLength={500}
              placeholder='What kind of job is this for?'
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type='button' variant='ghost' onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type='submit' disabled={isPending || !name.trim()}>
              {isPending ? 'Saving…' : 'Save template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
