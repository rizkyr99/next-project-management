'use client';

import { Button } from '@/components/ui/button';
import { CreateProjectDialog } from '@/features/projects/components/create-project-dialog';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { checklistCookie, type ChecklistState } from '../checklist';


/**
 * First-run checklist on the workspace home. Completion comes from real data
 * (passed in by the page), never stored; only "hide" is remembered, in a
 * cookie, so the server can leave it out and it never flashes.
 */
export function OnboardingChecklist({
  workspaceId,
  workspaceSlug,
  taskHref,
  state,
}: {
  workspaceId: string;
  workspaceSlug: string;
  /** Where "Add a task" leads: the first project. */
  taskHref: string | null;
  state: ChecklistState;
}) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  const steps = [
    {
      done: state.createdProject,
      title: 'Create a project',
      body: 'One project per piece of work: a launch, a client, a sprint.',
      action: <CreateProjectDialog variant='button' label='Create a project' />,
    },
    {
      done: state.addedTask,
      title: 'Add a task',
      body: 'Use “Add task” at the bottom of any column.',
      action: taskHref ? (
        <Button asChild size='sm' variant='outline'>
          <Link href={taskHref}>Open a project</Link>
        </Button>
      ) : null,
    },
    {
      done: state.invitedTeammate,
      title: 'Invite a teammate',
      body: 'Tide is better with your team in it.',
      action: (
        <Button asChild size='sm' variant='outline'>
          <Link href={`/workspaces/${workspaceSlug}/settings?tab=members`}>Invite people</Link>
        </Button>
      ),
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  const hide = () => {
    document.cookie = `${checklistCookie(workspaceId)}=1; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    setHidden(true);
  };

  return (
    <section aria-labelledby='checklist-title' className='rounded-xl border p-5 sm:p-6'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h2 id='checklist-title' className='text-base font-semibold'>
            Set up your workspace
          </h2>
          <p className='text-sm text-muted-foreground'>
            {doneCount} of {steps.length} done
          </p>
        </div>
        <Button variant='ghost' size='sm' onClick={hide}>
          Hide
        </Button>
      </div>
      <div
        className='mt-4 h-1.5 overflow-hidden rounded-full bg-muted'
        role='progressbar'
        aria-label='Setup progress'
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={doneCount}>
        <div className='h-full rounded-full bg-primary transition-[width]' style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className='mt-5 space-y-4'>
        {steps.map((step) => (
          <li key={step.title} className='flex flex-wrap items-center gap-x-4 gap-y-2'>
            <span
              aria-hidden
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border',
                step.done ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40',
              )}>
              {step.done && <Check className='size-3.5' />}
            </span>
            <div className='min-w-0 flex-1'>
              <p className={cn('text-sm font-medium', step.done && 'text-muted-foreground line-through')}>
                {step.title}
                <span className='sr-only'>{step.done ? ' (done)' : ' (to do)'}</span>
              </p>
              {!step.done && <p className='text-sm text-muted-foreground'>{step.body}</p>}
            </div>
            {!step.done && step.action}
          </li>
        ))}
      </ol>
    </section>
  );
}
