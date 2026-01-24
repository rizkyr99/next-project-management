import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';

interface TaskCardDueDateProps {
  date: Date | undefined;
  setDate: (date: Date | undefined) => void;
}

export function TaskCardDueDate({ date, setDate }: TaskCardDueDateProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant='ghost' size='sm' className='p-1! h-fit text-sm'>
          <CalendarIcon className='size-4' />
          {date && format(date, 'MMM d')}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        side='right'
        className='w-auto p-0'
        data-ignore-outside-click>
        <Calendar mode='single' selected={date} onSelect={setDate} />
      </PopoverContent>
    </Popover>
  );
}
