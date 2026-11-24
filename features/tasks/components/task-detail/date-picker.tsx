'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Clock, X } from 'lucide-react';
import { useState } from 'react';
import { formatDue, timeInputValue, withTime } from '../../due';

type Due = { date: Date | null; hasTime: boolean };

/**
 * A due date, optionally at a time. Without a time the task is due that day;
 * with one, at that time (and overdue once it passes).
 */
export function DatePicker({ value, onChange }: Readonly<{ value: Due; onChange: (due: Due) => void }>) {
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
        <Calendar mode='single' selected={date ?? undefined} onSelect={pickDay} />
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
