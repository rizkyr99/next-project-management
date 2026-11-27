'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Markdown } from '@/components/markdown';
import { imageFiles, uploadTaskImage } from '../upload-image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { markFollowing } from './task-detail/follow-task-button';
import { formatDistanceToNow } from 'date-fns';
import { Eye, EyeOff, Lock, Pencil, Send, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  addComment,
  deleteComment,
  getComments,
  setCommentVisibility,
  toggleReaction,
  updateComment,
} from '../actions';
import { CommentReactions } from './comment-reactions';
import type { Reaction, ReactionSummary } from '../reaction-kinds';

type CommentAuthor = { id: string; name: string; image: string | null };

type Comment = {
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date | null;
  clientVisible: boolean;
  author: CommentAuthor;
  reactions?: ReactionSummary[];
  /** Client-only: posted, still saving. */
  pending?: boolean;
};

interface TaskCommentsProps {
  taskId: string;
  currentUserId: string;
  /** Everyone who can see the project; guests (clients) have role 'guest'. */
  workspaceMembers: { id: string; name: string; image?: string | null; role?: string }[];
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

/**
 * Older comments got updated_at on insert (Drizzle's $onUpdate also fires
 * then), a few milliseconds from created_at; only a later change is an edit.
 */
function wasEdited(c: { createdAt: Date; updatedAt: Date | null }) {
  return c.updatedAt !== null && new Date(c.updatedAt).getTime() - new Date(c.createdAt).getTime() > 1000;
}

export function TaskComments({ taskId, currentUserId, workspaceMembers }: TaskCommentsProps) {
  const queryClient = useQueryClient();
  const queryKey = ['comments', taskId];
  const memberNames = workspaceMembers.map((m) => m.name);
  const guestIds = new Set(workspaceMembers.filter((m) => m.role === 'guest').map((m) => m.id));
  const viewerIsGuest = guestIds.has(currentUserId);
  const viewerRole = workspaceMembers.find((m) => m.id === currentUserId)?.role;
  // Internal vs client-visible only matters once a project has guests.
  const showVisibility = !viewerIsGuest && guestIds.size > 0;

  const { data: comments = [] } = useQuery({
    queryKey,
    queryFn: async () => {
      const res = await getComments(taskId);
      return ('comments' in res ? res.comments : []) as Comment[];
    },
  });

  const [body, setBody] = useState('');
  // A team comment is internal unless the author chooses to post it to the client.
  const [toClient, setToClient] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Every change shows at once; if the server refuses it, the list is put
  // back as it was (and a post's text returns to the box), with the reason.
  const me = workspaceMembers.find((m) => m.id === currentUserId);
  const snapshot = async () => {
    await queryClient.cancelQueries({ queryKey });
    return queryClient.getQueryData<Comment[]>(queryKey) ?? [];
  };
  const setComments = (update: (prev: Comment[]) => Comment[]) =>
    queryClient.setQueryData<Comment[]>(queryKey, (prev) => update(prev ?? []));
  const failed = (error: string, previous: Comment[]) => {
    queryClient.setQueryData(queryKey, previous);
    toast.error(error, { position: 'top-center' });
  };
  const NETWORK_ERROR = 'Could not reach the server. Check your connection and try again.';

  const addMutation = useMutation({
    mutationFn: ({ text, clientVisible }: { text: string; pendingId: string; clientVisible: boolean }) =>
      addComment(taskId, text, { clientVisible }),
    onMutate: async ({ text, pendingId, clientVisible }) => {
      const previous = await snapshot();
      setComments((prev) => [
        ...prev,
        {
          id: pendingId,
          body: text,
          createdAt: new Date(),
          updatedAt: null,
          clientVisible,
          author: { id: currentUserId, name: me?.name ?? 'You', image: me?.image ?? null },
          pending: true,
        },
      ]);
      setBody('');
      setMentionSearch(null);
      return { previous };
    },
    onSuccess: (res, { text, pendingId }, ctx) => {
      if ('error' in res) {
        failed(res.error ?? 'Something went wrong. Please try again.', ctx.previous);
        setBody(text);
        return;
      }
      setComments((prev) => prev.map((c) => (c.id === pendingId ? res.comment : c)));
      // The team follows what it comments on (I4).
      if (!viewerIsGuest) markFollowing(queryClient, taskId, { id: currentUserId, name: me?.name ?? 'You' });
    },
    onError: (_err, { text }, ctx) => {
      if (ctx) failed(NETWORK_ERROR, ctx.previous);
      setBody(text);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ commentId, text }: { commentId: string; text: string }) =>
      updateComment(commentId, text),
    onMutate: async ({ commentId, text }) => {
      const previous = await snapshot();
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, body: text, updatedAt: new Date() } : c)),
      );
      setEditingId(null);
      setEditBody('');
      return { previous };
    },
    onSuccess: (res, { commentId, text }, ctx) => {
      if ('error' in res) {
        failed(res.error ?? 'Something went wrong. Please try again.', ctx.previous);
        // Reopen the edit with what was typed.
        setEditingId(commentId);
        setEditBody(text);
      }
    },
    onError: (_err, { commentId, text }, ctx) => {
      if (ctx) failed(NETWORK_ERROR, ctx.previous);
      setEditingId(commentId);
      setEditBody(text);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (commentId: string) => deleteComment(commentId),
    onMutate: async (commentId) => {
      const previous = await snapshot();
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      return { previous };
    },
    onSuccess: (res, _id, ctx) => {
      if ('error' in res) failed(res.error ?? 'Something went wrong. Please try again.', ctx.previous);
    },
    onError: (_err, _id, ctx) => {
      if (ctx) failed(NETWORK_ERROR, ctx.previous);
    },
  });

  const visibilityMutation = useMutation({
    mutationFn: ({ commentId, clientVisible }: { commentId: string; clientVisible: boolean }) =>
      setCommentVisibility(commentId, clientVisible),
    onMutate: async ({ commentId, clientVisible }) => {
      const previous = await snapshot();
      setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, clientVisible } : c)));
      return { previous };
    },
    onSuccess: (res, { clientVisible }, ctx) => {
      if ('error' in res) {
        failed(res.error ?? 'Something went wrong. Please try again.', ctx.previous);
        return;
      }
      toast.success(clientVisible ? 'Shared with the client' : 'Made internal', { position: 'top-center' });
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) failed(NETWORK_ERROR, ctx.previous);
    },
  });

  // Reactions toggle at once and roll back if the server refuses.
  const reactMutation = useMutation({
    mutationFn: ({ commentId, reaction }: { commentId: string; reaction: Reaction }) =>
      toggleReaction(commentId, reaction),
    onMutate: async ({ commentId, reaction }) => {
      const previous = await snapshot();
      const myName = me?.name ?? 'You';
      setComments((prev) =>
        prev.map((c) => {
          if (c.id !== commentId) return c;
          const list = c.reactions ?? [];
          const existing = list.find((r) => r.reaction === reaction);
          let next: ReactionSummary[];
          if (existing?.mine) {
            next = list
              .map((r) =>
                r.reaction === reaction
                  ? { ...r, count: r.count - 1, mine: false, names: r.names.filter((n) => n !== myName) }
                  : r,
              )
              .filter((r) => r.count > 0);
          } else if (existing) {
            next = list.map((r) =>
              r.reaction === reaction ? { ...r, count: r.count + 1, mine: true, names: [...r.names, myName] } : r,
            );
          } else {
            next = [...list, { reaction, count: 1, mine: true, names: [myName] }];
          }
          return { ...c, reactions: next };
        }),
      );
      return { previous };
    },
    onSuccess: (res, _vars, ctx) => {
      if ('error' in res) failed(res.error ?? 'Could not update the reaction.', ctx.previous);
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) failed(NETWORK_ERROR, ctx.previous);
    },
  });

  /** Pasted images are uploaded and inserted as Markdown where the cursor is. */
  const pasteImages = async (
    event: React.ClipboardEvent<HTMLTextAreaElement>,
    current: string,
    setText: (next: string) => void,
  ) => {
    const files = imageFiles(event.clipboardData.files);
    if (files.length === 0) return;
    event.preventDefault();
    const box = event.currentTarget;
    const at = box.selectionStart ?? current.length;
    const id = toast.loading('Uploading image…', { position: 'top-center' });
    const inserted: string[] = [];
    for (const file of files) {
      try {
        const { url, name } = await uploadTaskImage(taskId, file);
        inserted.push(`![${name.replace(/[[\]]/g, '')}](${url})`);
      } catch (error) {
        toast.error((error as Error).message, { id, position: 'top-center' });
        return;
      }
    }
    toast.dismiss(id);
    const snippet = inserted.join('\n');
    setText(`${current.slice(0, at)}${at > 0 && current[at - 1] !== '\n' ? '\n' : ''}${snippet}\n${current.slice(at)}`);
  };

  const post = () => {
    const text = body.trim();
    if (!text) return;
    // Guests' comments are always visible to the client side (the server enforces it).
    const clientVisible = viewerIsGuest || (showVisibility && toClient);
    addMutation.mutate({ text, clientVisible, pendingId: `pending-${crypto.randomUUID()}` });
  };

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
      ? workspaceMembers.filter(
          (m) =>
            m.name.toLowerCase().includes(mentionSearch.toLowerCase()) &&
            // Clients can't be mentioned in a note they won't see.
            (viewerIsGuest || toClient || !guestIds.has(m.id)),
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

  return (
    <div className='space-y-4'>
      <p className='text-sm font-medium text-muted-foreground'>
        Comments {comments.length > 0 && `(${comments.length})`}
      </p>

      {comments.length > 0 && (
        <ul aria-label='Comments' className='space-y-3'>
          {comments.map((c) => (
            <li
              key={c.id}
              className={c.pending ? 'flex gap-2.5 opacity-60' : 'flex gap-2.5'}
              aria-busy={c.pending || undefined}>
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
                  {wasEdited(c) && (
                    <span className='text-xs text-muted-foreground italic'>(edited)</span>
                  )}
                  {showVisibility &&
                    (c.clientVisible ? (
                      <span className='inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-1.5 text-[11px] font-medium text-sky-700 dark:text-sky-300'>
                        <Eye className='size-3' aria-hidden />
                        Client can see
                      </span>
                    ) : (
                      <span className='inline-flex items-center gap-1 rounded-full bg-muted px-1.5 text-[11px] font-medium text-muted-foreground'>
                        <Lock className='size-3' aria-hidden />
                        Internal
                      </span>
                    ))}
                </div>

                {editingId === c.id ? (
                  <div className='mt-1 space-y-1.5'>
                    <Textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      onPaste={(e) => void pasteImages(e, editBody, setEditBody)}
                      className='min-h-[60px] text-sm resize-none'
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          updateMutation.mutate({ commentId: c.id, text: editBody });
                        }
                        if (e.key === 'Escape') {
                          setEditingId(null);
                          setEditBody('');
                        }
                      }}
                    />
                    <div className='flex gap-1.5'>
                      <Button
                        size='sm'
                        className='h-6 text-xs'
                        disabled={!editBody.trim()}
                        onClick={() => updateMutation.mutate({ commentId: c.id, text: editBody })}>
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
                  <>
                    <Markdown text={c.body} mentionNames={memberNames} className='mt-0.5' />
                    {!c.pending && (
                      <CommentReactions
                        reactions={c.reactions ?? []}
                        onToggle={(reaction) => reactMutation.mutate({ commentId: c.id, reaction })}
                      />
                    )}
                  </>
                )}
              </div>

              {editingId !== c.id && !c.pending && (
                <div className='flex items-start gap-0.5 shrink-0'>
                  {showVisibility &&
                    !guestIds.has(c.author.id) &&
                    (c.author.id === currentUserId || viewerRole === 'owner' || viewerRole === 'admin') && (
                      <Button
                        variant='ghost'
                        size='icon'
                        className='size-6'
                        aria-label={c.clientVisible ? 'Make comment internal' : 'Share comment with client'}
                        title={c.clientVisible ? 'Make internal' : 'Share with client'}
                        onClick={() => visibilityMutation.mutate({ commentId: c.id, clientVisible: !c.clientVisible })}>
                        {c.clientVisible ? <EyeOff className='size-3' /> : <Eye className='size-3' />}
                      </Button>
                    )}
                  {c.author.id === currentUserId && (
                    <>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='size-6'
                        aria-label='Edit comment'
                        onClick={() => { setEditingId(c.id); setEditBody(c.body); }}>
                        <Pencil className='size-3' />
                      </Button>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='size-6 text-destructive hover:text-destructive'
                        aria-label='Delete comment'
                        onClick={() => deleteMutation.mutate(c.id)}>
                        <Trash2 className='size-3' />
                      </Button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {showVisibility && (
        <div role='radiogroup' aria-label='Who sees this comment' className='flex gap-1'>
          {[
            { value: false, label: 'Internal', icon: <Lock className='size-3' aria-hidden /> },
            { value: true, label: 'Client can see', icon: <Eye className='size-3' aria-hidden /> },
          ].map((option) => (
            <button
              key={option.label}
              type='button'
              role='radio'
              aria-checked={toClient === option.value}
              onClick={() => setToClient(option.value)}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                toClient === option.value
                  ? option.value
                    ? 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300'
                    : 'border-foreground/20 bg-muted text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              {option.icon}
              {option.label}
            </button>
          ))}
        </div>
      )}

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
          placeholder={
            !showVisibility
              ? 'Add a comment… type @ to mention someone, paste a screenshot'
              : toClient
                ? 'Add a comment for the client… type @ to mention someone'
                : 'Add an internal comment… only your team sees it'
          }
          className={`min-h-[72px] resize-none text-sm pr-10${showVisibility && toClient ? ' border-sky-500/50' : ''}`}
          value={body}
          onChange={(e) => handleBodyChange(e.target.value)}
          onPaste={(e) => void pasteImages(e, body, setBody)}
          onKeyDown={(e) => {
            if (mentionSearch !== null && filteredMembers.length > 0) return;
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              post();
            }
          }}
        />
        <Button
          size='icon'
          className='absolute bottom-2 right-2 size-6'
          aria-label='Send comment'
          disabled={!body.trim()}
          onClick={() => { post(); }}>
          <Send className='size-3' />
        </Button>
      </div>
    </div>
  );
}
