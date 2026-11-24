'use client';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, Tag, Target, Users, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { PersonAvatar, type Person } from '../task-meta';
import { PRIORITIES, priorityConfig, type Priority } from '../../priority';
import { AssigneePicker } from './assignee-picker';
import { DatePicker } from './date-picker';

function Row({ icon, label, children, top }: { icon: ReactNode; label: string; children: ReactNode; top?: boolean }) {
  return (
    <div className={`grid grid-cols-[110px_1fr] gap-2 ${top ? 'items-start' : 'items-center'}`}>
      <div className={`flex items-center gap-2 text-sm text-muted-foreground ${top ? 'pt-1' : ''}`}>
        {icon}
        {label}
      </div>
      {children}
    </div>
  );
}

export function TaskProperties({
  statusId,
  statuses,
  priority,
  due,
  assignees,
  assigneeOptions,
  onStatusChange,
  onPriorityChange,
  onDueChange,
  onToggleAssignee,
  labelsField,
}: {
  statusId: string;
  statuses: { id: string; name: string }[];
  priority: Priority;
  due: { date: Date | null; hasTime: boolean };
  assignees: Person[];
  assigneeOptions: Person[];
  onStatusChange: (statusId: string) => void;
  onPriorityChange: (priority: Priority) => void;
  onDueChange: (due: { date: Date | null; hasTime: boolean }) => void;
  onToggleAssignee: (userId: string) => void;
  /** The label picker, built by the sheet. */
  labelsField?: ReactNode;
}) {
  return (
    <div className='space-y-3'>
      <Row icon={<Target className='size-4' />} label='Status'>
        <Select value={statusId} onValueChange={onStatusChange}>
          <SelectTrigger className='h-8 text-sm' aria-label='Status'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      <Row icon={priorityConfig[priority].icon} label='Priority'>
        <Select value={priority} onValueChange={(v) => onPriorityChange(v as Priority)}>
          <SelectTrigger className='h-8 text-sm' aria-label='Priority'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRIORITIES.map((p) => (
              <SelectItem key={p} value={p}>
                <span className='flex items-center gap-2'>
                  {priorityConfig[p].icon}
                  {priorityConfig[p].label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      {labelsField && (
        <Row icon={<Tag className='size-4' />} label='Labels' top>
          {labelsField}
        </Row>
      )}

      <Row icon={<CalendarIcon className='size-4' />} label='Due date'>
        <DatePicker value={due} onChange={onDueChange} />
      </Row>

      <Row icon={<Users className='size-4' />} label='Assignees' top>
        <div className='space-y-2'>
          {assignees.length > 0 && (
            <div className='flex flex-wrap gap-1.5'>
              {assignees.map((a) => (
                <div
                  key={a.id}
                  className='flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-xs'>
                  <PersonAvatar person={a} className='size-4' fallbackClassName='text-[8px]' />
                  {a.name || a.email}
                  <button
                    type='button'
                    aria-label={`Unassign ${a.name || a.email}`}
                    onClick={() => onToggleAssignee(a.id)}
                    className='ml-0.5 text-muted-foreground hover:text-foreground'>
                    <X className='size-3' />
                  </button>
                </div>
              ))}
            </div>
          )}
          <AssigneePicker
            options={assigneeOptions}
            selectedIds={assignees.map((a) => a.id)}
            onToggle={onToggleAssignee}
            trigger={
              <Button variant='outline' size='sm' className='h-7 text-xs'>
                {assignees.length > 0 ? 'Edit assignees' : 'Assign members'}
              </Button>
            }
          />
        </div>
      </Row>
    </div>
  );
}
