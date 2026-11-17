import { Button } from '@/components/ui/button';
import {
  CalendarClock,
  Columns3,
  Keyboard,
  Phone,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import boardDark from '@/public/marketing/board-dark.webp';
import notifications from '@/public/marketing/notifications.webp';
import taskSheet from '@/public/marketing/task-sheet.webp';
import { HeroShot } from './_components/hero-shot';
import { PricingTable } from './_components/pricing-table';

export const metadata: Metadata = {
  title: { absolute: 'Tide: project management for small teams' },
  description:
    'A shared kanban board for small teams, with task details, comments and @mentions, due-date reminders and live updates. Free for one workspace.',
  alternates: { canonical: '/' },
};

const FEATURES = [
  {
    icon: Columns3,
    title: 'Board, list or table',
    body: 'Switch views on the same project. Add, rename, colour and reorder columns to match how your team works.',
  },
  {
    icon: Keyboard,
    title: 'Works from the keyboard',
    body: 'Drag cards and columns with the mouse or the arrow keys. Press ⌘K to jump to any task, project or comment.',
  },
  {
    icon: Users,
    title: 'Workspaces and roles',
    body: 'Invite people by email as members or admins. Hand a workspace to someone else when you move on.',
  },
  {
    icon: CalendarClock,
    title: 'Due-date reminders',
    body: 'Everyone assigned to a task is reminded before it’s due, in the app and, if they want, by email.',
  },
  {
    icon: Phone,
    title: 'Calls inside a project',
    body: 'Start a voice call from any project when a thread of comments isn’t enough.',
  },
  {
    icon: ShieldCheck,
    title: 'Your data stays yours',
    body: 'Each workspace is private to its members. Delete your account and everything only you own goes with it.',
  },
];

const FAQ = [
  {
    q: 'Is Tide really free?',
    a: 'Yes. The Free plan gives you one workspace with unlimited projects, tasks and members, and every feature. Pay only if you need more workspaces.',
  },
  {
    q: 'What is a workspace?',
    a: 'A workspace is one team’s space: its members, projects and boards. Most teams need one. Freelancers and agencies often keep one per client, which is what Pro and Business are for.',
  },
  {
    q: 'Who can see my projects?',
    a: 'Only people you invite to your workspace. Invites go to a specific email address and expire after seven days.',
  },
  {
    q: 'Will Tide flood my inbox?',
    a: 'No. You choose which emails you get: when you’re assigned a task, when someone mentions you, and an optional daily summary. The in-app bell always has everything.',
  },
  {
    q: 'Can I leave whenever I want?',
    a: 'Yes. Cancel a paid plan from Billing at any time, and delete your account from Account settings. Workspaces you share with others must be handed over first, so your team keeps its work.',
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero: the headline, then the real board rising across the fold. */}
      <section aria-labelledby='hero-title' className='relative overflow-hidden'>
        <div className='mx-auto max-w-6xl px-4 pt-12 sm:px-6 sm:pt-20'>
          <h1
            id='hero-title'
            className='font-display max-w-[15ch] text-[clamp(2.6rem,6.4vw,5rem)] font-bold leading-[1.02] tracking-[-0.035em] text-balance'>
            Everything your team is working on, in one board.
          </h1>
          <p className='mt-6 max-w-[58ch] text-lg leading-relaxed text-muted-foreground'>
            Tide gives small teams a shared kanban board, tasks with comments and @mentions, and
            reminders before things are due. Changes show up for everyone as they happen.
          </p>
          <div className='mt-8 flex flex-wrap items-center gap-3'>
            <Button asChild size='lg'>
              <Link href='/register'>Sign up free</Link>
            </Button>
            <Button asChild size='lg' variant='outline'>
              <Link href='/login'>Log in</Link>
            </Button>
          </div>
          <p className='mt-4 text-sm text-muted-foreground'>Free for one workspace. No card needed.</p>
        </div>

        {/* The tide line: the mist starts halfway down the screenshot. */}
        <div className='relative mt-14 sm:mt-20'>
          <div aria-hidden className='absolute inset-x-0 bottom-0 top-1/2 bg-mist' />
          <div className='relative mx-auto max-w-6xl px-4 sm:px-6'>
            <div className='animate-rise motion-reduce:animate-none overflow-hidden rounded-xl border bg-card shadow-[0_24px_60px_-24px_rgb(30_40_110/0.35)]'>
              <HeroShot />
            </div>
          </div>
        </div>
      </section>

      {/* Three moments from the real product. */}
      <div className='bg-mist pb-20 pt-16 sm:pb-28 sm:pt-24'>
        <div className='mx-auto max-w-6xl space-y-20 px-4 sm:space-y-28 sm:px-6'>
          <Moment
            title='Open a task without losing your place'
            body={[
              'Every card opens beside the board with its description, assignees, due date and the whole conversation.',
              'Write descriptions in Markdown, @mention a teammate to pull them in, and copy the link to share exactly this task.',
            ]}
            image={taskSheet}
            alt='A task opened in a side panel with a checklist in its description and three comments, one mentioning Maya Chen.'
            imageClass='max-w-[440px]'
          />
          <Moment
            reverse
            title='See what needs you, and nothing else'
            body={[
              'Tide tells you when you’re assigned a task, mentioned in a comment, or have something due in the next two days.',
              'Click a notification to land on that task. Choose which ones also come by email, or get one summary a day.',
            ]}
            image={notifications}
            alt='The notifications menu showing a mention from Priya Raman and a task assigned by Jonas Weber.'
            imageClass='max-w-[440px]'
          />
          <Moment
            title='Easy on the eyes after dark'
            body={[
              'Dark mode follows your system setting, or switch it from the header. Every screen is designed for both.',
            ]}
            image={boardDark}
            alt='The Tide board in dark mode.'
          />
        </div>
      </div>

      {/* Everything else, as a plain list. */}
      <section aria-labelledby='features-title' className='mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28'>
        <h2 id='features-title' className='font-display max-w-[20ch] text-3xl font-bold tracking-[-0.03em] sm:text-4xl'>
          The rest of what a small team needs
        </h2>
        <ul className='mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3'>
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className='space-y-2'>
              <Icon className='size-5 text-primary' aria-hidden />
              <h3 className='font-semibold'>{title}</h3>
              <p className='text-sm leading-relaxed text-muted-foreground'>{body}</p>
            </li>
          ))}
        </ul>
        <p className='mt-12 flex items-center gap-2 text-sm text-muted-foreground'>
          <Search className='size-4' aria-hidden />
          Plus search across tasks and comments, an activity log for every workspace, and a My tasks list
          across all your projects.
        </p>
      </section>

      <section aria-labelledby='pricing-title' className='border-t'>
        <div className='mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28'>
          <h2 id='pricing-title' className='font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl'>
            Pricing
          </h2>
          <p className='mt-3 max-w-[60ch] text-muted-foreground'>
            Every plan has every feature. You pay for the number of workspaces you own.
          </p>
          <div className='mt-10'>
            <PricingTable />
          </div>
        </div>
      </section>

      <section aria-labelledby='faq-title' className='border-t'>
        <div className='mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1fr_2fr]'>
          <h2 id='faq-title' className='font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl'>
            Questions
          </h2>
          <div className='divide-y border-y'>
            {FAQ.map(({ q, a }) => (
              <details key={q} className='group py-5'>
                <summary className='flex cursor-pointer list-none items-center justify-between gap-6 font-medium [&::-webkit-details-marker]:hidden'>
                  {q}
                  <span
                    aria-hidden
                    className='text-xl leading-none text-muted-foreground transition-transform group-open:rotate-45'>
                    +
                  </span>
                </summary>
                <p className='mt-3 max-w-[65ch] text-muted-foreground leading-relaxed'>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className='border-t bg-mist'>
        <div className='mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between'>
          <h2 className='font-display max-w-[22ch] text-3xl font-bold tracking-[-0.03em]'>
            Set up your team’s board in a couple of minutes.
          </h2>
          <Button asChild size='lg'>
            <Link href='/register'>Sign up free</Link>
          </Button>
        </div>
      </section>
    </>
  );
}

function Moment({
  title,
  body,
  image,
  alt,
  reverse,
  imageClass,
}: {
  title: string;
  body: string[];
  image: typeof boardDark;
  alt: string;
  reverse?: boolean;
  imageClass?: string;
}) {
  return (
    <section className='grid items-center gap-10 md:grid-cols-[2fr_3fr] md:gap-16'>
      <div className={reverse ? 'md:order-2' : ''}>
        <h2 className='font-display text-2xl font-bold tracking-[-0.025em] sm:text-3xl'>{title}</h2>
        {body.map((p) => (
          <p key={p} className='mt-4 max-w-[48ch] leading-relaxed text-mist-foreground'>
            {p}
          </p>
        ))}
      </div>
      <div className={`flex ${reverse ? 'md:order-1 md:justify-start' : 'md:justify-end'}`}>
        <Image
          src={image}
          alt={alt}
          sizes='(min-width: 768px) 60vw, 100vw'
          className={`h-auto w-full rounded-xl border bg-card shadow-[0_18px_44px_-22px_rgb(30_40_110/0.35)] ${imageClass ?? ''}`}
        />
      </div>
    </section>
  );
}
