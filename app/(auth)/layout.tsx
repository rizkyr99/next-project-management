export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className='h-dvh bg-background flex items-center justify-center'>
      {children}
    </div>
  );
}
