'use client';

import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, X } from 'lucide-react';
import { useState } from 'react';

export function DatePicker({
  value,
  onChange,
}: {
  value: Date | null;
  onChange: (date: Date | null) => void;
}) {
  const [open, setOpen] = useState(false);

  const pick = (date: Date | null) => {
    onChange(date);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant='outline' size='sm' className='justify-start gap-2 font-normal'>
          <CalendarIcon className='size-3.5' />
          {value
            ? value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Pick a date'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-auto p-0' align='start'>
        <Calendar mode='single' selected={value ?? undefined} onSelect={(day) => pick(day ?? null)} />
        {value && (
          <div className='border-t p-2'>
            <Button
              variant='ghost'
              size='sm'
              className='w-full text-muted-foreground'
              onClick={() => pick(null)}>
              <X className='size-3.5 mr-1' />
              Clear date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
