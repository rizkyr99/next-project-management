import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { mentionPattern } from '@/features/tasks/mentions';
import { cn } from '@/lib/utils';

/**
 * Rendering for user-written text (task descriptions, comments).
 *
 * Safe by construction: no raw HTML (rehype-sanitize, GitHub's allow-list),
 * no `javascript:` links, and only images uploaded to Tide (/api/files/…),
 * which check access. Images from other sites aren't loaded: they could
 * track who opens a task.
 */
const markdownClassName = [
  'text-sm leading-relaxed break-words space-y-2',
  '[&_h1]:text-base [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-medium',
  '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5',
  '[&_ul:has(>li>input)]:list-none [&_ul:has(>li>input)]:pl-1 [&_li>input]:mr-1.5 [&_li>input]:align-middle',
  '[&_a]:underline [&_a]:underline-offset-2 [&_a]:text-primary',
  '[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]',
  '[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground',
  '[&_table]:w-full [&_table]:text-left [&_th]:border-b [&_th]:py-1 [&_td]:border-b [&_td]:py-1',
].join(' ');

const MENTION_HREF = '#mention';
const UPLOAD_PREFIX = '/api/files/';

/** @Name of a real member becomes a link the renderer shows as a highlight. */
function markMentions(text: string, names: string[]) {
  const pattern = mentionPattern(names);
  if (!pattern) return text;
  return text.replace(pattern, (match) => `[${match.replace(/[[\]\\]/g, '\\$&')}](${MENTION_HREF})`);
}

export function Markdown({
  text,
  mentionNames = [],
  className,
}: {
  text: string;
  /** Workspace members whose @mentions are highlighted (same rule the server notifies by). */
  mentionNames?: string[];
  className?: string;
}) {
  return (
    <div className={cn(markdownClassName, className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ href, children }) =>
            href === MENTION_HREF ? (
              <mark className='bg-primary/15 text-primary rounded px-0.5 font-medium not-italic'>{children}</mark>
            ) : (
              <a href={href} target='_blank' rel='noopener noreferrer nofollow'>
                {children}
              </a>
            ),
          img: ({ src, alt }) =>
            typeof src === 'string' && src.startsWith(UPLOAD_PREFIX) ? (
              // eslint-disable-next-line @next/next/no-img-element -- access-checked file, not optimisable by next/image
              <img src={src} alt={alt ?? ''} loading='lazy' className='max-h-96 max-w-full rounded-md border' />
            ) : (
              <span className='text-xs text-muted-foreground'>[image from another site not shown]</span>
            ),
        }}>
        {markMentions(text, mentionNames)}
      </ReactMarkdown>
    </div>
  );
}
