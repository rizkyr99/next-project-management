'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { deleteTemplate } from '../actions';

export interface SavedTemplate {
  id: string;
  name: string;
  description: string | null;
  taskCount: number;
  createdByName: string | null;
  createdAt: Date;
  canDelete: boolean;
}

/** The workspace's saved templates, in Settings → Templates. */
export function TemplateList({ templates }: Readonly<{ templates: SavedTemplate[] }>) {
  if (templates.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>
        No saved templates yet. Open a project&apos;s <span className='font-medium text-foreground'>⋯</span> menu and
        choose <span className='font-medium text-foreground'>Save as template</span>. The built-in templates are always
        available when you create a project.
      </p>
    );
  }
  return (
    <ul className='divide-y' aria-label='Saved templates'>
      {templates.map((t) => (
        <TemplateRow key={t.id} template={t} />
      ))}
    </ul>
  );
}

function TemplateRow({ template }: Readonly<{ template: SavedTemplate }>) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const queryClient = useQueryClient();
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const saved = template.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <li className='flex items-start gap-3 py-3'>
      <div className='min-w-0 flex-1'>
        <p className='truncate text-sm font-medium'>{template.name}</p>
        {template.description && <p className='text-sm text-muted-foreground line-clamp-2'>{template.description}</p>}
        <p className='mt-0.5 text-xs text-muted-foreground'>
          {template.taskCount} {template.taskCount === 1 ? 'task' : 'tasks'}. Saved {saved}
          {template.createdByName ? ` by ${template.createdByName}` : ''}.
        </p>
      </div>
      {template.canDelete && (
        <>
          <Button
            variant='ghost'
            size='icon'
            className='size-8 shrink-0 text-muted-foreground hover:text-destructive'
            aria-label={`Delete ${template.name}`}
            disabled={pending}
            onClick={() => setConfirming(true)}>
            <Trash2 className='size-4' />
          </Button>
          <AlertDialog open={confirming} onOpenChange={setConfirming}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{template.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  Projects already started from it stay as they are. Nobody can start a new one from it.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className='bg-destructive text-white hover:bg-destructive/90'
                  onClick={() =>
                    start(async () => {
                      const result = await deleteTemplate(template.id);
                      if (result.error !== undefined) {
                        toast.error(result.error, { position: 'top-center' });
                        return;
                      }
                      void queryClient.invalidateQueries({ queryKey: ['templates', workspaceSlug] });
                      toast.success(`Deleted “${template.name}”`, { position: 'top-center' });
                    })
                  }>
                  Delete template
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </li>
  );
}
