'use client';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AlignLeft } from 'lucide-react';
import { useRef, useState } from 'react';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { MAX_DESCRIPTION_LENGTH } from '../../schema';

/**
 * Markdown is rendered with rehype-sanitize (GitHub's allow-list), so raw
 * HTML, scripts and `javascript:` links in a description never execute.
 */
const markdownClassName = [
  'text-sm leading-relaxed break-words space-y-2',
  '[&_h1]:text-base [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-medium',
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5',
  '[&_a]:underline [&_a]:underline-offset-2 [&_a]:text-primary',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]',
  '[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
].join(' ');

export function TaskDescription({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (description: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const cancelled = useRef(false);

  const startEditing = () => {
    setDraft(value ?? '');
    cancelled.current = false;
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    if (cancelled.current) return;
    if (draft.trim() !== (value ?? '').trim()) onSave(draft);
  };

  return (
    <section className='space-y-2'>
      <h3 className='flex items-center gap-2 text-sm font-medium text-muted-foreground'>
        <AlignLeft className='size-4' />
        Description
      </h3>
      {editing ? (
        <div className='space-y-1'>
          <Textarea
            autoFocus
            value={draft}
            maxLength={MAX_DESCRIPTION_LENGTH}
            aria-label='Description'
            placeholder='Add more detail. Markdown is supported.'
            className='min-h-28 max-h-[50vh] text-sm'
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                e.currentTarget.blur();
              }
              if (e.key === 'Escape') {
                // Keep Escape from also closing the sheet.
                e.stopPropagation();
                cancelled.current = true;
                e.currentTarget.blur();
              }
            }}
          />
          <p className='text-xs text-muted-foreground'>⌘/Ctrl + Enter to save · Esc to cancel</p>
        </div>
      ) : value ? (
        <div
          role='button'
          tabIndex={0}
          aria-label='Edit description'
          className='rounded-md px-2 py-1.5 -mx-2 hover:bg-muted/60 cursor-text'
          onClick={(e) => {
            // Let links in the description open instead of entering edit mode.
            if ((e.target as HTMLElement).closest('a')) return;
            startEditing();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target === e.currentTarget) {
              e.preventDefault();
              startEditing();
            }
          }}>
          <div className={markdownClassName} data-testid='task-description'>
            <Markdown
              rehypePlugins={[rehypeSanitize]}
              components={{
                a: ({ href, children }) => (
                  <a href={href} target='_blank' rel='noopener noreferrer nofollow'>
                    {children}
                  </a>
                ),
              }}>
              {value}
            </Markdown>
          </div>
        </div>
      ) : (
        <Button
          variant='ghost'
          className='w-full justify-start text-muted-foreground font-normal'
          onClick={startEditing}>
          Add a description…
        </Button>
      )}
    </section>
  );
}
