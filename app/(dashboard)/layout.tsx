import { KeyboardShortcuts } from '@/components/keyboard-shortcuts';
import { SentryUser } from '@/components/sentry-user';
import { SidebarProvider } from '@/components/ui/sidebar';
import { getSession } from '@/lib/auth-session';
import { redirect } from 'next/navigation';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect('/login');
  }

  return (
    <SidebarProvider>
      <SentryUser id={session.user.id} />
      <KeyboardShortcuts />
      {children}
    </SidebarProvider>
  );
}
