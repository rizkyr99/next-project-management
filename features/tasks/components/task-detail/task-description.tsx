'use client';

import { Markdown } from '@/components/markdown';
import { Button } from '@/components/ui/button';
import type { Editor } from '@tiptap/react';
import { AlignLeft } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { MAX_DESCRIPTION_LENGTH } from '../../schema';
import { uploadTaskImage } from '../../upload-image';
import { useReadOnly } from '@/features/projects/read-only';

// The editor is the heaviest part of the sheet; load it only to edit.
const RichTextEditor = dynamic(() => import('@/components/rich-text-editor'), {
  ssr: false,
  loading: () => <div className='min-h-36 rounded-md border bg-muted/30 animate-pulse' />,
});

/**
 * The description is stored as Markdown and rendered safely (components/
 * markdown.tsx). Editing is visual: headings, lists, checklists, links,
 * code and pasted screenshots.
 */
export function TaskDescription({
  taskId,
  value,
  onSave,
}: {
  taskId: string;
  value: string | null;
  onSave: (description: string) => void;
}) {
  const readOnly = useReadOnly();
  const [editing, setEditing] = useState(false);
  const editor = useRef<Editor | null>(null);

  const startEditing = () => {
    editor.current = null;
    setEditing(true);
  };

  const save = () => {
    const markdown = editor.current?.getMarkdown().trim() ?? (value ?? '').trim();
    if (markdown.length > MAX_DESCRIPTION_LENGTH) {
      toast.error(`Descriptions can be up to ${MAX_DESCRIPTION_LENGTH.toLocaleString()} characters.`, {
        position: 'top-center',
      });
      return;
    }
    setEditing(false);
    if (markdown !== (value ?? '').trim()) onSave(markdown);
  };

  const upload = async (file: File) => {
    const id = toast.loading('Uploading image…', { position: 'top-center' });
    try {
      const uploaded = await uploadTaskImage(taskId, file);
      toast.dismiss(id);
      return uploaded;
    } catch (error) {
      toast.error((error as Error).message, { id, position: 'top-center' });
      return null;
    }
  };

  return (
    <section className='space-y-2'>
      <h3 className='flex items-center gap-2 text-sm font-medium text-muted-foreground'>
        <AlignLeft className='size-4' />
        Description
      </h3>
      {readOnly ? (
        value ? (
          <div data-testid='task-description'>
            <Markdown text={value} />
          </div>
        ) : (
          <p className='text-sm text-muted-foreground'>No description.</p>
        )
      ) : editing ? (
        <div
          className='space-y-2'
          onKeyDownCapture={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              save();
            } else if (e.key === 'Escape' && !(e.target as HTMLElement).closest('[data-radix-popper-content-wrapper]')) {
              // Cancel the edit, and keep Escape from also closing the sheet.
              e.preventDefault();
              e.stopPropagation();
              setEditing(false);
            }
          }}>
          <RichTextEditor
            initialMarkdown={value ?? ''}
            placeholder='Add more detail: the brief, links, a checklist, screenshots…'
            ariaLabel='Description'
            onUploadImage={upload}
            onEditor={(e) => (editor.current = e)}
          />
          <div className='flex items-center gap-2'>
            <Button size='sm' onClick={save}>
              Save
            </Button>
            <Button size='sm' variant='ghost' onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <p className='ml-auto text-xs text-muted-foreground'>⌘/Ctrl + Enter to save · Esc to cancel</p>
          </div>
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
          <div data-testid='task-description'>
            <Markdown text={value} />
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
