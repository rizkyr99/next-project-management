export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className='min-h-dvh bg-background flex items-center justify-center p-4'>
      <div className='w-full max-w-md space-y-6'>
        <div className='text-4xl font-extrabold text-primary text-center'>tide</div>
        {children}
      </div>
    </main>
  );
}
