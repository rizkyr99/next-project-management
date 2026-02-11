import { Button } from '@/components/ui/button';
import { Target, UserCircle, Users } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';

interface AssigneeOption {
  id: string;
  name: string;
  email?: string;
  image?: string | null;
}

interface TaskCardProps {
  id: string;
  title: string;
  assignees?: {
    user: AssigneeOption;
  }[];
  availableAssignees?: AssigneeOption[];
}

function getInitials(source: string) {
  return source
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function AssigneePicker({
  trigger,
  options,
  selectedIds,
  onToggle,
  invitedEmails,
  onInvite,
}: {
  trigger: ReactNode;
  options: AssigneeOption[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  invitedEmails: string[];
  onInvite: (email: string) => void;
}) {
  const [searchValue, setSearchValue] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');

  const filteredOptions = useMemo(() => {
    const query = searchValue.trim().toLowerCase();
    if (!query) return options;
    return options.filter((assignee) => {
      const nameMatch = assignee.name?.toLowerCase().includes(query);
      const emailMatch = assignee.email?.toLowerCase().includes(query);
      return nameMatch || emailMatch;
    });
  }, [options, searchValue]);

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align='end'
        side='bottom'
        className='w-72 p-2'
        data-ignore-outside-click>
        <div className='space-y-2'>
          <Input
            placeholder='Search assignees...'
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            onPointerDown={(event) => event.stopPropagation()}
          />
          <div className='max-h-48 overflow-y-auto space-y-1'>
            {filteredOptions.length === 0 ? (
              <div className='text-sm text-muted-foreground px-2 py-1'>
                No matches found.
              </div>
            ) : (
              filteredOptions.map((assignee) => {
                const isChecked = selectedIds.includes(assignee.id);
                const label = assignee.name || assignee.email || 'Unnamed';
                return (
                  <button
                    key={assignee.id}
                    type='button'
                    className='w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent'
                    onClick={() => onToggle(assignee.id)}>
                    <Checkbox checked={isChecked} />
                    <div className='flex items-center gap-2'>
                      <Avatar className='size-6'>
                        {assignee.image ? (
                          <AvatarImage src={assignee.image} alt={label} />
                        ) : null}
                        <AvatarFallback className='text-[10px] font-medium'>
                          {getInitials(label) || 'U'}
                        </AvatarFallback>
                      </Avatar>
                      <div className='flex flex-col'>
                        <span className='text-sm font-medium'>
                          {assignee.name || assignee.email}
                        </span>
                        {assignee.email ? (
                          <span className='text-xs text-muted-foreground'>
                            {assignee.email}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <div className='border-t pt-2 space-y-2'>
            <div className='text-xs font-medium text-muted-foreground'>
              Invite via email
            </div>
            <div className='flex items-center gap-2'>
              <Input
                placeholder='name@email.com'
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
              />
              <Button
                type='button'
                size='sm'
                onClick={() => {
                  const trimmed = inviteEmail.trim();
                  if (!trimmed || !trimmed.includes('@')) return;
                  onInvite(trimmed);
                  setInviteEmail('');
                }}>
                Invite
              </Button>
            </div>
            {invitedEmails.length > 0 ? (
              <div className='text-xs text-muted-foreground'>
                Invited: {invitedEmails.join(', ')}
              </div>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TaskCard({
  id,
  title,
  assignees = [],
  availableAssignees = [],
}: TaskCardProps) {
  const [currentTitle, setCurrentTitle] = useState(title);
  const [draftTitle, setDraftTitle] = useState(title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>(
    assignees.map((assignee) => assignee.user.id),
  );
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);

  useEffect(() => {
    setCurrentTitle(title);
    setDraftTitle(title);
  }, [title]);

  useEffect(() => {
    setSelectedAssigneeIds(assignees.map((assignee) => assignee.user.id));
  }, [assignees]);

  const assigneeOptions = useMemo(() => {
    const map = new Map<string, AssigneeOption>();
    for (const assignee of availableAssignees) {
      map.set(assignee.id, assignee);
    }
    for (const assignee of assignees) {
      if (!map.has(assignee.user.id)) {
        map.set(assignee.user.id, assignee.user);
      }
    }
    return Array.from(map.values());
  }, [availableAssignees, assignees]);

  const selectedAssignees = useMemo(
    () =>
      selectedAssigneeIds
        .map((id) => assigneeOptions.find((assignee) => assignee.id === id))
        .filter(Boolean) as AssigneeOption[],
    [assigneeOptions, selectedAssigneeIds],
  );

  const handleToggleAssignee = (id: string) => {
    setSelectedAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          {...attributes}
          {...listeners}
          className='bg-white shadow p-2 rounded-md space-y-2 hover:shadow-md cursor-pointer transition'>
          <div className='text-sm font-medium'>{currentTitle}</div>
          <div className='flex items-center gap-1'>
            <AssigneePicker
              options={assigneeOptions}
              selectedIds={selectedAssigneeIds}
              onToggle={handleToggleAssignee}
              invitedEmails={invitedEmails}
              onInvite={(email) =>
                setInvitedEmails((prev) =>
                  prev.includes(email) ? prev : [...prev, email],
                )
              }
              trigger={
                <button
                  type='button'
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => event.stopPropagation()}
                  className='flex items-center'>
                  {selectedAssignees.length > 0 || invitedEmails.length > 0 ? (
                    <div className='flex items-center -space-x-2'>
                      {selectedAssignees.map((assignee) => {
                        const label = assignee.name || assignee.email || 'U';
                        return (
                          <Avatar
                            key={assignee.id}
                            className='size-7 border-2 border-background'>
                            {assignee.image ? (
                              <AvatarImage src={assignee.image} alt={label} />
                            ) : null}
                            <AvatarFallback className='text-[11px] font-medium'>
                              {getInitials(label) || 'U'}
                            </AvatarFallback>
                          </Avatar>
                        );
                      })}
                      {invitedEmails.map((email) => (
                        <Avatar
                          key={email}
                          className='size-7 border-2 border-background'>
                          <AvatarFallback className='text-[11px] font-medium'>
                            {getInitials(email) || 'U'}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                    </div>
                  ) : (
                    <Button variant='outline' size='icon-sm'>
                      <UserCircle />
                    </Button>
                  )}
                </button>
              }
            />
          </div>
        </div>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEditingTitle ? (
              <input
                autoFocus
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                onBlur={() => {
                  setCurrentTitle(draftTitle.trim() || currentTitle);
                  setDraftTitle(draftTitle.trim() || currentTitle);
                  setIsEditingTitle(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    setCurrentTitle(draftTitle.trim() || currentTitle);
                    setDraftTitle(draftTitle.trim() || currentTitle);
                    setIsEditingTitle(false);
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setDraftTitle(currentTitle);
                    setIsEditingTitle(false);
                  }
                }}
                className='w-full rounded-md border border-input bg-background px-2 py-1 text-lg font-semibold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
              />
            ) : (
              <button
                type='button'
                onClick={() => {
                  setDraftTitle(currentTitle);
                  setIsEditingTitle(true);
                }}
                className='w-full text-left text-lg font-semibold cursor-pointer hover:bg-muted px-2 py-1.5 rounded-lg'>
                {currentTitle}
              </button>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className='grid grid-cols-2 gap-4'>
          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
            <Target className='size-4' />
            Status
          </div>
          <Select>
            <SelectTrigger className='w-full'>
              <SelectValue placeholder='Select status' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='TODO'>TODO</SelectItem>
              <SelectItem value='IN PROGRESS'>IN PROGRESS</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className='grid grid-cols-2 gap-4'>
          <div className='flex items-center gap-2 text-sm text-muted-foreground'>
            <Users className='size-4' />
            Assignees
          </div>
          <AssigneePicker
            options={assigneeOptions}
            selectedIds={selectedAssigneeIds}
            onToggle={handleToggleAssignee}
            invitedEmails={invitedEmails}
            onInvite={(email) =>
              setInvitedEmails((prev) =>
                prev.includes(email) ? prev : [...prev, email],
              )
            }
            trigger={
              <Button variant='outline' size='sm' className='justify-start'>
                {selectedAssignees.length > 0 || invitedEmails.length > 0
                  ? 'Edit assignees'
                  : 'Select assignees'}
              </Button>
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
