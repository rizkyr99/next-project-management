'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatBytes } from '@/lib/plans';
import { fileExtension, fileUrl, IMAGE_TYPES } from '@/lib/uploads';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import {
  Eye,
  EyeOff,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Paperclip,
  Plus,
  Trash2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { deleteTaskFile, setFileVisibility } from '../actions';
import type { TaskFile } from '../types';
import { uploadTaskFile } from '../upload';

const KINDS: [string[], 'image' | 'text' | 'archive' | 'video' | 'audio'][] = [
  [['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'heic', 'svg', 'tif', 'tiff', 'bmp'], 'image'],
  [['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'odt', 'pages', 'key', 'ppt', 'pptx', 'odp', 'xls', 'xlsx', 'csv', 'ods', 'numbers'], 'text'],
  [['zip'], 'archive'],
  [['mp4', 'mov', 'm4v', 'webm'], 'video'],
  [['mp3', 'wav', 'm4a', 'aac'], 'audio'],
];

function FileIcon({ name }: Readonly<{ name: string }>) {
  const kind = KINDS.find(([exts]) => exts.includes(fileExtension(name)))?.[1];
  const className = 'mt-0.5 size-4 shrink-0 text-muted-foreground';
  switch (kind) {
    case 'image':
      return <FileImage className={className} aria-hidden />;
    case 'text':
      return <FileText className={className} aria-hidden />;
    case 'archive':
      return <FileArchive className={className} aria-hidden />;
    case 'video':
      return <FileVideo className={className} aria-hidden />;
    case 'audio':
      return <FileAudio className={className} aria-hidden />;
    default:
      return <File className={className} aria-hidden />;
  }
}

const fail = (message?: string) =>
  toast.error(message ?? 'Something went wrong. Please try again.', { position: 'top-center' });

interface Uploading {
  key: string;
  name: string;
  percent: number | null;
}

/**
 * The task's Files list (B3): add files by button or drop, download them,
 * share them with the project's client (like comments, the team's files
 * start internal), and remove them. The server decides who may do what.
 */
export function TaskFiles({
  taskId,
  files,
  currentUserId,
  viewerRole,
  projectHasGuests,
}: Readonly<{
  taskId: string;
  files: TaskFile[];
  currentUserId: string;
  viewerRole: string | undefined;
  projectHasGuests: boolean;
}>) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<Uploading[]>([]);
  const [dragging, setDragging] = useState(false);
  const isGuest = viewerRole === 'guest';
  const isManager = viewerRole === 'owner' || viewerRole === 'admin';

  const add = async (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    if (picked.length === 0) return;
    let added = 0;
    // One at a time: storage and the server see a steady stream, and a
    // failure names the file it was about.
    for (const file of picked) {
      const key = crypto.randomUUID();
      setUploading((u) => [...u, { key, name: file.name, percent: null }]);
      try {
        await uploadTaskFile(taskId, file, (percent) =>
          setUploading((u) => u.map((x) => (x.key === key ? { ...x, percent } : x))),
        );
        added++;
      } catch (err) {
        fail(err instanceof Error ? err.message : undefined);
      } finally {
        setUploading((u) => u.filter((x) => x.key !== key));
      }
    }
    if (added > 0) {
      toast.success(added === 1 ? 'File added' : `${added} files added`, { position: 'top-center' });
      router.refresh();
    }
  };

  const count = files.length;
  return (
    <section
      className={cn('space-y-2 rounded-md', dragging && 'outline-2 outline-dashed outline-primary outline-offset-4')}
      aria-labelledby={`files-${taskId}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        void add(e.dataTransfer.files);
      }}>
      <div className='flex items-center justify-between gap-2'>
        <h3 id={`files-${taskId}`} className='flex items-center gap-2 text-sm font-medium text-muted-foreground'>
          <Paperclip className='size-4' aria-hidden />
          Files
          {count > 0 && <span className='tabular-nums'>{count}</span>}
        </h3>
        <Button
          variant='ghost'
          size='sm'
          className='h-7 text-muted-foreground'
          disabled={uploading.length > 0}
          onClick={() => input.current?.click()}>
          <Plus className='size-4' />
          Add files
        </Button>
        <input
          ref={input}
          type='file'
          multiple
          hidden
          aria-label='Choose files to attach'
          onChange={(e) => {
            const list = e.currentTarget.files;
            void add(list).finally(() => {
              if (input.current) input.current.value = '';
            });
          }}
        />
      </div>

      {count === 0 && uploading.length === 0 && (
        <p className='text-sm text-muted-foreground'>
          {isGuest ? 'Drop files here to send them to the team.' : 'Drop briefs, assets and deliverables here.'}
        </p>
      )}

      {(count > 0 || uploading.length > 0) && (
        <ul aria-label='Files' className='-mx-2'>
          {files.map((f) => (
            <FileRow
              key={f.id}
              file={f}
              canManage={!isGuest && (isManager || f.uploadedById === currentUserId)}
              canDelete={isManager || f.uploadedById === currentUserId}
              showVisibility={!isGuest && projectHasGuests}
            />
          ))}
          {uploading.map((u) => (
            <li key={u.key} aria-busy='true' className='flex items-center gap-2 rounded-md px-2 py-1.5 text-sm'>
              <Paperclip className='size-4 shrink-0 text-muted-foreground animate-pulse' aria-hidden />
              <span className='min-w-0 flex-1 truncate'>{u.name}</span>
              <span className='text-xs text-muted-foreground tabular-nums'>
                {u.percent === null ? 'Uploading…' : `${u.percent}%`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FileRow({
  file,
  canManage,
  canDelete,
  showVisibility,
}: Readonly<{ file: TaskFile; canManage: boolean; canDelete: boolean; showVisibility: boolean }>) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const isImage = (IMAGE_TYPES as readonly string[]).includes(file.contentType);
  const href = isImage ? fileUrl(file.id) : `${fileUrl(file.id)}?download`;
  const shared = file.fromClient || file.clientVisible;

  return (
    <li aria-busy={pending || undefined} className='group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50'>
      <FileIcon name={file.name} />
      <div className='min-w-0 flex-1'>
        <a
          href={href}
          {...(isImage ? { target: '_blank', rel: 'noopener' } : { download: file.name })}
          className='block truncate text-sm font-medium hover:underline'>
          {file.name}
        </a>
        <p className='text-xs text-muted-foreground'>
          {formatBytes(file.size)}, {file.uploadedByName ?? 'someone'}{' '}
          {formatDistanceToNow(new Date(file.createdAt), { addSuffix: true })}
        </p>
      </div>
      {showVisibility && (
        <Badge variant={shared ? 'secondary' : 'outline'} className='mt-0.5 shrink-0'>
          {file.fromClient ? 'From client' : shared ? 'Client can see' : 'Internal'}
        </Badge>
      )}
      {showVisibility && canManage && !file.fromClient && (
        <Button
          variant='ghost'
          size='icon'
          className='size-7 shrink-0 text-muted-foreground'
          aria-label={file.clientVisible ? `Make ${file.name} internal` : `Share ${file.name} with client`}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await setFileVisibility({ fileId: file.id, clientVisible: !file.clientVisible });
              if (result.error !== undefined) fail(result.error);
              else
                toast.success(file.clientVisible ? 'File is internal again' : 'File shared with the client', {
                  position: 'top-center',
                });
            })
          }>
          {file.clientVisible ? <EyeOff className='size-4' /> : <Eye className='size-4' />}
        </Button>
      )}
      {canDelete && (
        <>
          <Button
            variant='ghost'
            size='icon'
            className='size-7 shrink-0 text-muted-foreground hover:text-destructive'
            aria-label={`Remove ${file.name}`}
            disabled={pending}
            onClick={() => setConfirming(true)}>
            <Trash2 className='size-4' />
          </Button>
          <AlertDialog open={confirming} onOpenChange={setConfirming}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove “{file.name}”?</AlertDialogTitle>
                <AlertDialogDescription>It’s deleted for everyone and can’t be brought back.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className='bg-destructive text-white hover:bg-destructive/90'
                  onClick={() =>
                    start(async () => {
                      const result = await deleteTaskFile(file.id);
                      if (result.error !== undefined) fail(result.error);
                      else toast.success(`Removed “${file.name}”`, { position: 'top-center' });
                    })
                  }>
                  Remove file
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </li>
  );
}
