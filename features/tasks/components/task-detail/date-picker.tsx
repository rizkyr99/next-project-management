'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Clock, X } from 'lucide-react';
import { useState } from 'react';
import { dayKey, formatDay, formatDue, parseDay, timeInputValue, withTime } from '../../due';

type Due = { date: Date | null; hasTime: boolean };

/**
 * A due date, optionally at a time. Without a time the task is due that day;
 * with one, at that time (and overdue once it passes).
 */
export function DatePicker({
  value,
  onChange,
  notBefore,
}: Readonly<{
  value: Due;
  onChange: (due: Due) => void;
  /** B4: the task's start day; the due day can't come before it. */
  notBefore?: string | null;
}>) {
  const [open, setOpen] = useState(false);
  const { date, hasTime } = value;

  const pickDay = (day: Date | undefined) => {
    if (!day) return onChange({ date: null, hasTime: false });
    // Keep the time already chosen when moving to another day.
    onChange(hasTime && date ? { date: withTime(day, timeInputValue(date)), hasTime: true } : { date: day, hasTime: false });
    if (!hasTime) setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant='outline' size='sm' className='justify-start gap-2 font-normal'>
          <CalendarIcon className='size-3.5' />
          {date ? formatDue(date, hasTime) : 'Pick a date'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-auto p-0' align='start'>
        <Calendar
          mode='single'
          selected={date ?? undefined}
          onSelect={pickDay}
          defaultMonth={date ?? (notBefore ? parseDay(notBefore) : undefined)}
          disabled={notBefore ? { before: parseDay(notBefore) } : undefined}
        />
        {date && (
          <div className='space-y-2 border-t p-2'>
            <div className='flex items-center gap-2'>
              <Clock className='size-3.5 text-muted-foreground' aria-hidden />
              <Input
                type='time'
                aria-label='Due time'
                className='h-8'
                value={hasTime ? timeInputValue(date) : ''}
                onChange={(e) =>
                  onChange(
                    e.target.value
                      ? { date: withTime(date, e.target.value), hasTime: true }
                      : { date: withTime(date, '00:00'), hasTime: false },
                  )
                }
              />
              {hasTime && (
                <Button
                  variant='ghost'
                  size='sm'
                  className='h-8 text-muted-foreground'
                  onClick={() => onChange({ date: withTime(date, '00:00'), hasTime: false })}>
                  Remove time
                </Button>
              )}
            </div>
            <Button
              variant='ghost'
              size='sm'
              className='w-full text-muted-foreground'
              onClick={() => {
                onChange({ date: null, hasTime: false });
                setOpen(false);
              }}>
              <X className='size-3.5 mr-1' />
              Clear date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * B4: when work starts, as a calendar day. It can't come after the due day,
 * so a task's range always runs forwards.
 */
export function StartDatePicker({
  value,
  onChange,
  notAfter,
}: Readonly<{
  value: string | null;
  onChange: (day: string | null) => void;
  /** The task's due date, if any. */
  notAfter?: Date | null;
}>) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseDay(value) : undefined;
  const latest = notAfter ? new Date(notAfter.getFullYear(), notAfter.getMonth(), notAfter.getDate()) : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant='outline' size='sm' className='justify-start gap-2 font-normal' aria-label='Start date'>
          <CalendarIcon className='size-3.5' />
          {value ? formatDay(value) : 'No start date'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-auto p-0' align='start'>
        <Calendar
          mode='single'
          selected={selected}
          defaultMonth={selected ?? latest ?? undefined}
          disabled={latest ? { after: latest } : undefined}
          onSelect={(day) => {
            onChange(day ? dayKey(day) : null);
            setOpen(false);
          }}
        />
        {value && (
          <div className='border-t p-2'>
            <Button
              variant='ghost'
              size='sm'
              className='w-full text-muted-foreground'
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}>
              <X className='size-3.5 mr-1' />
              Clear start date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
