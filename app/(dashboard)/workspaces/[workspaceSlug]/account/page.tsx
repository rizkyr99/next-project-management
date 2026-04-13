import { db } from '@/db/drizzle';
import { account as accountTable, user } from '@/db/schema';
import { auth } from '@/lib/auth';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { UpdateProfileForm } from '@/features/account/components/update-profile-form';
import { ChangePasswordForm } from '@/features/account/components/change-password-form';

export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const [currentUser] = await db
    .select()
    .from(user)
    .where(eq(user.id, session.user.id));

  const accounts = await db
    .select({ providerId: accountTable.providerId })
    .from(accountTable)
    .where(eq(accountTable.userId, session.user.id));

  const hasPassword = accounts.some((a) => a.providerId === 'credential');
  const providers = accounts.map((a) => a.providerId);

  const initials = (currentUser.name || currentUser.email || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <div className='flex-1 p-6 md:p-8 max-w-2xl space-y-6'>
      <div>
        <h1 className='text-2xl font-semibold'>Account</h1>
        <p className='text-sm text-muted-foreground mt-1'>
          Manage your personal account settings.
        </p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Update your display name.</CardDescription>
        </CardHeader>
        <CardContent className='space-y-6'>
          <div className='flex items-center gap-4'>
            <Avatar className='size-16'>
              <AvatarImage
                src={currentUser.image ?? undefined}
                referrerPolicy='no-referrer'
              />
              <AvatarFallback className='text-lg'>{initials}</AvatarFallback>
            </Avatar>
            <div>
              <p className='font-medium'>{currentUser.name}</p>
              <p className='text-sm text-muted-foreground'>{currentUser.email}</p>
            </div>
          </div>
          <Separator />
          <UpdateProfileForm defaultName={currentUser.name} />
        </CardContent>
      </Card>

      {/* Connected accounts */}
      <Card>
        <CardHeader>
          <CardTitle>Connected accounts</CardTitle>
          <CardDescription>
            Sign-in methods linked to your account.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-3'>
          {providers.map((providerId) => {
            const label =
              providerId === 'credential'
                ? 'Email & Password'
                : providerId.charAt(0).toUpperCase() + providerId.slice(1);
            return (
              <div
                key={providerId}
                className='flex items-center justify-between rounded-md border px-4 py-3'>
                <span className='text-sm font-medium'>{label}</span>
                <Badge variant='secondary'>Connected</Badge>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Change password — only shown if they have email/password */}
      {hasPassword && (
        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>
              Update your password to keep your account secure.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      )}

      {/* Account info */}
      <Card>
        <CardHeader>
          <CardTitle>Account info</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3 text-sm'>
          <div className='flex justify-between'>
            <span className='text-muted-foreground'>Email</span>
            <span>{currentUser.email}</span>
          </div>
          <Separator />
          <div className='flex justify-between'>
            <span className='text-muted-foreground'>Email verified</span>
            <span>{currentUser.emailVerified ? 'Yes' : 'No'}</span>
          </div>
          <Separator />
          <div className='flex justify-between'>
            <span className='text-muted-foreground'>Member since</span>
            <span>
              {currentUser.createdAt.toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
