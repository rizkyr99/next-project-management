'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { toast } from 'sonner';
import { updateEmailPreferences } from '../preferences';

export interface EmailPreferences {
  emailOnAssign: boolean;
  emailOnMention: boolean;
  emailDigest: boolean;
}

type Key = keyof EmailPreferences;

const OPTIONS: { key: Key; label: string; hint: string }[] = [
  { key: 'emailOnAssign', label: 'When someone assigns me a task', hint: 'Sent right away.' },
  { key: 'emailOnMention', label: 'When someone @mentions me in a comment', hint: 'Sent right away.' },
  {
    key: 'emailDigest',
    label: 'Daily summary of unread notifications',
    hint: 'One email around 08:00 UTC, only on days with something unread.',
  },
];

/**
 * Each checkbox saves on change, optimistically. While its save is in flight
 * that checkbox is disabled, so a failed save can only roll back to the last
 * confirmed value, never over a newer click.
 */
export function EmailPreferencesForm({ initial }: { initial: EmailPreferences }) {
  const [prefs, setPrefs] = useState(initial);
  const [saving, setSaving] = useState<Partial<Record<Key, boolean>>>({});

  const toggle = async (key: Key, value: boolean) => {
    const confirmed = prefs[key];
    setPrefs((p) => ({ ...p, [key]: value }));
    setSaving((s) => ({ ...s, [key]: true }));
    let error: string | undefined;
    try {
      const result = await updateEmailPreferences({ [key]: value });
      error = result.error;
    } catch {
      // e.g. the session expired since the page loaded.
      error = 'Could not save. Please sign in again and retry.';
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
    if (error !== undefined) {
      setPrefs((p) => ({ ...p, [key]: confirmed }));
      toast.error(error, { position: 'top-center' });
      return;
    }
    toast.success('Preferences saved', { position: 'top-center' });
  };

  return (
    <fieldset className='space-y-4'>
      <legend className='sr-only'>Email notifications</legend>
      {OPTIONS.map(({ key, label, hint }) => (
        <div key={key} className='flex items-start gap-3'>
          <Checkbox
            id={`pref-${key}`}
            checked={prefs[key]}
            disabled={saving[key]}
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
