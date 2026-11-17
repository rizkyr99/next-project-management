'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { updateEmailPreferences } from '../preferences';

export interface EmailPreferences {
  emailOnAssign: boolean;
  emailOnMention: boolean;
  emailDigest: boolean;
}

const OPTIONS: { key: keyof EmailPreferences; label: string; hint: string }[] = [
  { key: 'emailOnAssign', label: 'When someone assigns me a task', hint: 'Sent right away.' },
  { key: 'emailOnMention', label: 'When someone @mentions me in a comment', hint: 'Sent right away.' },
  {
    key: 'emailDigest',
    label: 'Daily summary of unread notifications',
    hint: 'One email around 08:00 UTC, only on days with something unread.',
  },
];

/** Each checkbox saves on change, optimistically, and reverts if saving fails. */
export function EmailPreferencesForm({ initial, disabled }: { initial: EmailPreferences; disabled: boolean }) {
  const [prefs, setPrefs] = useState(initial);
  const [, startTransition] = useTransition();

  const toggle = (key: keyof EmailPreferences, value: boolean) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    startTransition(async () => {
      const result = await updateEmailPreferences({ [key]: value });
      if (result.error !== undefined) {
        setPrefs((p) => ({ ...p, [key]: !value }));
        toast.error(result.error, { position: 'top-center' });
        return;
      }
      toast.success('Preferences saved', { position: 'top-center' });
    });
  };

  return (
    <fieldset disabled={disabled} className='space-y-4 disabled:opacity-60'>
      <legend className='sr-only'>Email notifications</legend>
      {OPTIONS.map(({ key, label, hint }) => (
        <div key={key} className='flex items-start gap-3'>
          <Checkbox
            id={`pref-${key}`}
            checked={prefs[key]}
            onCheckedChange={(v) => toggle(key, v === true)}
            className='mt-0.5'
          />
          <div className='space-y-0.5'>
            <Label htmlFor={`pref-${key}`}>{label}</Label>
            <p className='text-xs text-muted-foreground'>{hint}</p>
          </div>
        </div>
      ))}
    </fieldset>
  );
}
