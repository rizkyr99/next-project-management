'use client';

import { Progress } from '@/components/ui/progress';
import { CreateWorkspaceForm } from '@/features/workspaces/components/create-workspace-form';
import { Rocket } from 'lucide-react';
import { useState } from 'react';

export default function CreateWorkspace() {
  const [step, setStep] = useState(1);
  const totalSteps = 2;

  const onSuccess = () => {
    setStep(step + 1);
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

        <CreateWorkspaceForm onSuccess={onSuccess} />
      </div>
    </div>
  );
}
