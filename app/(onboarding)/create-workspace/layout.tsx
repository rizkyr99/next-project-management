import type { Metadata } from 'next';

// The page is a client component, so its title lives here.
export const metadata: Metadata = { title: 'Create workspace' };

export default function CreateWorkspaceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
