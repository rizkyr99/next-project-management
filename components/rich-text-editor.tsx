'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import Image from '@tiptap/extension-image';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Code, Heading2, ImagePlus, Italic, Link2, List, ListChecks, ListOrdered } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A formatting editor that reads and writes Markdown, so stored text stays
 * plain (searchable, safe to render) while people edit visually. Images are
 * uploaded through `onUploadImage` and embedded by their app URL.
 */
export default function RichTextEditor({
  initialMarkdown,
  placeholder,
  ariaLabel,
  onUploadImage,
  onEditor,
  className,
}: {
  initialMarkdown: string;
  placeholder: string;
  ariaLabel: string;
  /** Upload a pasted, dropped or picked image; resolves to the URL to embed. */
  onUploadImage?: (file: File) => Promise<{ url: string; name: string } | null>;
  /** Gives the parent the editor, to read its Markdown on save. */
  onEditor?: (editor: Editor) => void;
  className?: string;
}) {
  const editorRef = useRef<Editor | null>(null);
  const uploadImages = async (editor: Editor, files: File[], at?: number) => {
    if (!onUploadImage) return;
    for (const file of files) {
      const uploaded = await onUploadImage(file);
      if (!uploaded) continue;
      const image = { type: 'image', attrs: { src: uploaded.url, alt: uploaded.name } };
      if (at === undefined) editor.chain().focus().insertContent(image).run();
      else editor.chain().focus().insertContentAt(at, image).run();
    }
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: false }),
      Placeholder.configure({ placeholder }),
      Markdown,
    ],
    content: initialMarkdown,
    contentType: 'markdown',
    autofocus: 'end',
    editorProps: {
      attributes: {
        'aria-label': ariaLabel,
        'aria-multiline': 'true',
        role: 'textbox',
        class: 'min-h-28 max-h-[50vh] overflow-y-auto px-3 py-2 text-sm outline-none',
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'));
        if (files.length === 0 || !onUploadImage || !editorRef.current) return false;
        void uploadImages(editorRef.current, files);
        return true;
      },
      handleDrop: (view, event) => {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'));
        if (files.length === 0 || !onUploadImage || !editorRef.current) return false;
        event.preventDefault();
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        void uploadImages(editorRef.current, files, at);
        return true;
      },
    },
    onCreate: ({ editor }) => onEditor?.(editor),
  });
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  if (!editor) return <div className={cn('min-h-28 rounded-md border', className)} />;
  return (
    <div className={cn('rounded-md border focus-within:ring-2 focus-within:ring-ring/50', className)}>
      <Toolbar editor={editor} onPickImage={onUploadImage ? (files) => uploadImages(editor, files) : undefined} />
      <EditorContent editor={editor} className={proseClassName} />
    </div>
  );
}

/** The editor's content uses the same look as rendered Markdown. */
const proseClassName = [
  '[&_.tiptap]:space-y-2 [&_.tiptap_h1]:text-base [&_.tiptap_h1]:font-semibold [&_.tiptap_h2]:font-semibold [&_.tiptap_h3]:font-medium',
  '[&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-5 [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-5',
  '[&_.tiptap_ul[data-type=taskList]]:list-none [&_.tiptap_ul[data-type=taskList]]:pl-1',
  '[&_li[data-type=taskItem]]:flex [&_li[data-type=taskItem]]:gap-2 [&_li[data-type=taskItem]>label]:mt-0.5',
  '[&_.tiptap_a]:underline [&_.tiptap_a]:text-primary',
  '[&_.tiptap_code]:rounded [&_.tiptap_code]:bg-muted [&_.tiptap_code]:px-1 [&_.tiptap_code]:text-[0.85em]',
  '[&_.tiptap_pre]:rounded-md [&_.tiptap_pre]:bg-muted [&_.tiptap_pre]:p-3',
  '[&_.tiptap_blockquote]:border-l-2 [&_.tiptap_blockquote]:pl-3 [&_.tiptap_blockquote]:text-muted-foreground',
  '[&_.tiptap_img]:max-h-96 [&_.tiptap_img]:rounded-md [&_.tiptap_img]:border',
  '[&_.tiptap_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)] [&_.tiptap_p.is-editor-empty:first-child]:before:text-muted-foreground [&_.tiptap_p.is-editor-empty:first-child]:before:float-left [&_.tiptap_p.is-editor-empty:first-child]:before:h-0 [&_.tiptap_p.is-editor-empty:first-child]:before:pointer-events-none',
].join(' ');

function Toolbar({ editor, onPickImage }: { editor: Editor; onPickImage?: (files: File[]) => void }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      heading: e.isActive('heading', { level: 2 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      task: e.isActive('taskList'),
      code: e.isActive('code'),
      link: e.isActive('link'),
    }),
  });
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div role='toolbar' aria-label='Formatting' className='flex flex-wrap items-center gap-0.5 border-b px-1 py-1'>
      <ToolButton label='Bold' pressed={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold />
      </ToolButton>
      <ToolButton label='Italic' pressed={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic />
      </ToolButton>
      <ToolButton label='Heading' pressed={state.heading} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        <Heading2 />
      </ToolButton>
      <ToolButton label='Bulleted list' pressed={state.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <List />
      </ToolButton>
      <ToolButton label='Numbered list' pressed={state.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <ListOrdered />
      </ToolButton>
      <ToolButton label='Checklist' pressed={state.task} onClick={() => editor.chain().focus().toggleTaskList().run()}>
        <ListChecks />
      </ToolButton>
      <ToolButton label='Code' pressed={state.code} onClick={() => editor.chain().focus().toggleCode().run()}>
        <Code />
      </ToolButton>
      <LinkButton editor={editor} active={state.link} />
      {onPickImage && (
        <>
          <ToolButton label='Add image' onClick={() => fileInput.current?.click()}>
            <ImagePlus />
          </ToolButton>
          <input
            ref={fileInput}
            type='file'
            accept='image/png,image/jpeg,image/gif,image/webp'
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (files.length) onPickImage(files);
            }}
          />
        </>
      )}
    </div>
  );
}

function ToolButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type='button'
      variant='ghost'
      size='icon'
      className={cn('size-7 [&_svg]:size-3.5', pressed && 'bg-muted text-foreground')}
      aria-label={label}
      aria-pressed={pressed}
      // Keep focus (and the selection) in the editor.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}>
      {children}
    </Button>
  );
}

function LinkButton({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState('');

  const apply = () => {
    const url = href.trim();
    const chain = editor.chain().focus().extendMarkRange('link');
    if (!url) chain.unsetLink().run();
    else chain.setLink({ href: /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}` }).run();
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setHref((editor.getAttributes('link').href as string | undefined) ?? '');
        setOpen(next);
      }}>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          className={cn('size-7 [&_svg]:size-3.5', active && 'bg-muted text-foreground')}
          aria-label='Link'
          aria-pressed={active}
          onMouseDown={(e) => e.preventDefault()}>
          <Link2 />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-72 p-2' onOpenAutoFocus={(e) => e.preventDefault()}>
        <form
          className='flex gap-2'
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}>
          <Input
            autoFocus
            value={href}
            onChange={(e) => setHref(e.target.value)}
            placeholder='https://…'
            aria-label='Link address'
            className='h-8'
          />
          <Button type='submit' size='sm' className='h-8'>
            {href.trim() ? 'Apply' : 'Remove'}
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
