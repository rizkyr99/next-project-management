import { Button } from '@/components/ui/button';
import { PLAN_DETAILS, TRIAL_DAYS } from '@/lib/plans';
import { CopyPlus, Link2, Mail, MessageSquareLock, Paperclip, Search } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import clientApproval from '@/public/marketing/client-approval.webp';
import clientBoard from '@/public/marketing/client-board.webp';
import overview from '@/public/marketing/overview.webp';
import { HeroShot } from './_components/hero-shot';
import { PricingTable } from './_components/pricing-table';

export const metadata: Metadata = {
  title: { absolute: 'Tide: project management for studios and agencies' },
  description:
    'Run client projects without the email chains. One board for your team, and a place for each client to follow progress, comment and approve work. Clients join free.',
  alternates: { canonical: '/' },
};

const PRO = PLAN_DETAILS.pro;

/** What a studio gets beyond the three moments above, in the order they ask about it. */
const FEATURES = [
  {
    icon: MessageSquareLock,
    title: 'Internal until you share it',
    body: 'Comments and files start internal. Share the ones meant for the client, one at a time, and keep the rest of the conversation in the team.',
  },
  {
    icon: CopyPlus,
    title: 'Every job from a template',
    body: 'Start a website build, a brand identity or a content calendar with its columns, tasks, checklists and dates in place, or save one of your own.',
  },
  {
    icon: Link2,
    title: 'A link for everyone else',
    body: 'Send a read-only link to the board for stakeholders who won’t sign in. Turn it off or replace it whenever you like.',
  },
  {
    icon: Paperclip,
    title: 'Files live with the work',
    body: 'Attach briefs, assets and deliverables to the task they belong to, up to 100 MB each, and share them with the client when they’re ready.',
  },
  {
    icon: Mail,
    title: 'Emails in your studio’s name',
    body: 'Invites, approval requests and updates reach clients from “your studio via Tide”, written for someone outside your team.',
  },
  {
    icon: Search,
    title: 'Everything a team expects',
    body: 'Board, list and table views, labels and checklists, @mentions, due-date reminders, search with ⌘K, an activity log, calls and dark mode.',
  },
];

const FAQ = [
  {
    q: 'What does my client see?',
    a: 'Only the projects you share with them. On those they see the board and the tasks, plus the comments and files you’ve shared and anything they’ve added themselves. They never see your other clients, your internal comments or the rest of your workspace.',
  },
  {
    q: 'Do I pay for my clients?',
    a: 'No. Clients join as guests on the projects you share with them, and guests are always free. You pay only for your own team.',
  },
  {
    q: 'How does the free trial work?',
    a: `A new workspace gets ${TRIAL_DAYS} days of Pro with no card. We email you before it ends. If you don’t upgrade, the workspace moves to Free: nothing is deleted, and clients you invited keep their access.`,
  },
  {
    q: 'Is there a free plan?',
    a: 'Yes. Free covers a team of up to three with unlimited projects and tasks, boards, labels, checklists and the built-in templates. Pro adds client guests, approvals, share links and your own templates.',
  },
  {
    q: 'What is a workspace?',
    a: 'A workspace is one team’s space: its members, projects and boards. Each workspace has its own plan, and you can have as many as you like.',
  },
  {
    q: 'Can I leave whenever I want?',
    a: 'Yes. Cancel Pro from your workspace’s Billing settings at any time, and delete your account from Account settings. Workspaces you share with others must be handed over first, so your team keeps its work.',
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero: the promise, then the real board rising across the fold. */}
      <section aria-labelledby='hero-title' className='relative overflow-hidden'>
        <div className='mx-auto max-w-6xl px-4 pt-12 sm:px-6 sm:pt-20'>
          <h1
            id='hero-title'
            className='font-display max-w-[14ch] text-[clamp(2.6rem,6.4vw,5rem)] font-bold leading-[1.02] tracking-[-0.035em] text-balance'>
            Client work, without the email chains.
          </h1>
          <p className='mt-6 max-w-[58ch] text-lg leading-relaxed text-muted-foreground'>
            Tide is where small studios and agencies run their projects: one board for your team, and a place
            for each client to follow progress, comment and approve work. Your clients join free.
          </p>
          <div className='mt-8 flex flex-wrap items-center gap-3'>
            <Button asChild size='lg'>
              <Link href='/register'>Start your free trial</Link>
            </Button>
            <Button asChild size='lg' variant='outline'>
              <Link href='/login'>Log in</Link>
            </Button>
          </div>
          <p className='mt-4 text-sm text-muted-foreground'>
            {TRIAL_DAYS} days of Pro, no card. Then ${PRO.priceMonthly} per team member a month, or stay on Free.
          </p>
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

      {/* Three moments in a client project, from the real product. */}
      <div className='bg-mist pb-20 pt-16 sm:pb-28 sm:pt-24'>
        <div className='mx-auto max-w-6xl space-y-20 px-4 sm:space-y-28 sm:px-6'>
          <Moment
            title='Bring the client in, only where they belong'
            body={[
              'Invite a client as a guest on the projects that are theirs. They see where the work stands, what’s waiting on them and what you’ve shared.',
              'They never see your other clients, your internal comments or the rest of your workspace.',
            ]}
            image={clientBoard}
            alt='What a client sees: only the Acme website project, with tasks in To Do, In Progress, Client review and Done, one awaiting their approval.'
          />
          <Moment
            reverse
            title='Sign-off in one click, not a reply-all'
            body={[
              'Ask for approval on a task with a short note. The client gets an email in your studio’s name and approves, or asks for changes and says what.',
              'The answer shows on the card, reaches whoever asked, and stays in the task’s history.',
            ]}
            image={clientApproval}
            alt='Maya Chen asked for approval on the Visual design task: “Homepage, About and Services are ready.” with Approve and Request changes buttons.'
            imageClass='max-w-[560px]'
          />
          <Moment
            title='Every project’s state before your first coffee'
            body={[
              'Your workspace home shows what’s late and due this week across every project, which jobs need a look and why, what’s waiting on clients and what they said.',
            ]}
            image={overview}
            alt='The studio overview: tasks due in the next 7 days, Globex rebrand marked at risk, one approval waiting on a client, and Sam Rivera’s latest feedback.'
          />
        </div>
      </div>

      {/* Everything else, as a plain list. */}
      <section aria-labelledby='features-title' className='mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28'>
        <h2 id='features-title' className='font-display max-w-[20ch] text-3xl font-bold tracking-[-0.03em] sm:text-4xl'>
          Built for the way studios work
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
      </section>

      <section aria-labelledby='pricing-title' className='border-t'>
        <div className='mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28'>
          <h2 id='pricing-title' className='font-display text-3xl font-bold tracking-[-0.03em] sm:text-4xl'>
            Pricing
          </h2>
          <p className='mt-3 max-w-[60ch] text-muted-foreground'>
            Start with {TRIAL_DAYS} days of Pro, no card. Then stay on Free for a team of three, or pay $
            {PRO.priceMonthly} per team member for Pro. Your clients are always free.
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
            Run your next client project in Tide.
          </h2>
          <Button asChild size='lg'>
            <Link href='/register'>Start your free trial</Link>
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
}: Readonly<{
  title: string;
  body: string[];
  image: typeof overview;
  alt: string;
  reverse?: boolean;
  imageClass?: string;
}>) {
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
