'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatDistanceToNow } from 'date-fns';
import { Pencil, Send, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { addComment, deleteComment, getComments, updateComment } from '../actions';

type CommentAuthor = { id: string; name: string; image: string | null };

type Comment = {
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date | null;
  author: CommentAuthor;
};

interface TaskCommentsProps {
  taskId: string;
  currentUserId: string;
  workspaceMembers: { id: string; name: string; image?: string | null }[];
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

function renderBody(body: string) {
  const parts = body.split(/(@\w[\w\s]*)/g);
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <mark key={i} className='bg-primary/15 text-primary rounded px-0.5 font-medium not-italic'>
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function TaskComments({ taskId, currentUserId, workspaceMembers }: TaskCommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getComments(taskId).then((res) => {
      if ('comments' in res) setComments(res.comments as Comment[]);
    });
  }, [taskId]);

  // Detect @mention as user types
  const handleBodyChange = (value: string) => {
    setBody(value);
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursor);
    const match = textBeforeCursor.match(/@(\w[\w ]*)$/);
    setMentionSearch(match ? match[1] : null);
  };

  const filteredMembers =
    mentionSearch !== null
      ? workspaceMembers.filter((m) =>
          m.name.toLowerCase().includes(mentionSearch.toLowerCase()),
        )
      : [];

  const insertMention = (name: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart ?? body.length;
    const textBeforeCursor = body.slice(0, cursor);
    const replaced = textBeforeCursor.replace(/@(\w[\w ]*)$/, `@${name} `);
    const newBody = replaced + body.slice(cursor);
    setBody(newBody);
    setMentionSearch(null);
    setTimeout(() => {
      textarea.focus();
      const pos = replaced.length;
      textarea.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleSubmit = async () => {
    if (!body.trim()) return;
    setSubmitting(true);
    const res = await addComment(taskId, body, workspaceMembers);
    setSubmitting(false);
    if ('error' in res) {
      toast.error(res.error, { position: 'top-center' });
      return;
    }
    setComments((prev) => [...prev, res.comment as Comment]);
    setBody('');
    setMentionSearch(null);
  };

  const handleEditSave = async (commentId: string) => {
    if (!editBody.trim()) return;
    const res = await updateComment(commentId, editBody);
    if ('error' in res) {
      toast.error(res.error, { position: 'top-center' });
      return;
    }
    setComments((prev) =>
      prev.map((c) => (c.id === commentId ? { ...c, body: editBody } : c)),
    );
    setEditingId(null);
    setEditBody('');
  };

  const handleDelete = async (commentId: string) => {
    const res = await deleteComment(commentId);
    if ('error' in res) {
      toast.error(res.error, { position: 'top-center' });
      return;
    }
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  };

  return (
    <div className='space-y-4'>
      <p className='text-sm font-medium text-muted-foreground'>
        Comments {comments.length > 0 && `(${comments.length})`}
      </p>

      {/* Comment list */}
      {comments.length > 0 && (
        <div className='space-y-3'>
          {comments.map((c) => (
            <div key={c.id} className='flex gap-2.5'>
              <Avatar className='size-7 shrink-0 mt-0.5'>
                {c.author.image && (
                  <AvatarImage src={c.author.image} alt={c.author.name} />
                )}
                <AvatarFallback className='text-[10px]'>
                  {getInitials(c.author.name)}
                </AvatarFallback>
              </Avatar>

              <div className='flex-1 min-w-0'>
                <div className='flex items-baseline gap-1.5'>
                  <span className='text-sm font-medium'>{c.author.name}</span>
                  <span className='text-xs text-muted-foreground'>
                    {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                  </span>
                  {c.updatedAt && (
                    <span className='text-xs text-muted-foreground italic'>(edited)</span>
                  )}
                </div>

                {editingId === c.id ? (
                  <div className='mt-1 space-y-1.5'>
                    <Textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      className='min-h-[60px] text-sm resize-none'
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleEditSave(c.id);
                        }
                        if (e.key === 'Escape') {
                          setEditingId(null);
                          setEditBody('');
                        }
                      }}
                    />
                    <div className='flex gap-1.5'>
                      <Button size='sm' className='h-6 text-xs' onClick={() => handleEditSave(c.id)}>
                        Save
                      </Button>
                      <Button
                        size='sm'
                        variant='ghost'
                        className='h-6 text-xs'
                        onClick={() => { setEditingId(null); setEditBody(''); }}>
                        <X className='size-3' />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className='text-sm mt-0.5 break-words'>{renderBody(c.body)}</p>
                )}
              </div>

              {c.author.id === currentUserId && editingId !== c.id && (
                <div className='flex items-start gap-0.5 shrink-0'>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='size-6'
                    onClick={() => { setEditingId(c.id); setEditBody(c.body); }}>
                    <Pencil className='size-3' />
                  </Button>
                  <Button
                    variant='ghost'
                    size='icon'
                    className='size-6 text-destructive hover:text-destructive'
                    onClick={() => handleDelete(c.id)}>
                    <Trash2 className='size-3' />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New comment input */}
      <div className='relative'>
        {mentionSearch !== null && filteredMembers.length > 0 && (
          <div className='absolute bottom-full mb-1 left-0 z-50 w-56 rounded-md border bg-popover shadow-md overflow-hidden'>
            {filteredMembers.slice(0, 6).map((m) => (
              <button
                key={m.id}
                type='button'
                className='flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent text-left'
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(m.name);
                }}>
                <Avatar className='size-5'>
                  {m.image && <AvatarImage src={m.image} alt={m.name} />}
                  <AvatarFallback className='text-[9px]'>{getInitials(m.name)}</AvatarFallback>
                </Avatar>
                {m.name}
              </button>
            ))}
          </div>
        )}

        <Textarea
          ref={textareaRef}
          placeholder='Add a comment… type @ to mention someone'
          value={body}
          onChange={(e) => handleBodyChange(e.target.value)}
          onKeyDown={(e) => {
            if (mentionSearch !== null && filteredMembers.length > 0) return;
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          className='min-h-[72px] resize-none text-sm pr-10'
        />
        <Button
          size='icon'
          className='absolute bottom-2 right-2 size-6'
          disabled={!body.trim() || submitting}
          onClick={handleSubmit}>
          <Send className='size-3' />
        </Button>
      </div>
    </div>
  );
}
