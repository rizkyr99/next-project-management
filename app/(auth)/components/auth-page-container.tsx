import React from 'react';

export default function AuthPageContainer({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className='w-full max-w-lg p-4 space-y-4'>{children}</div>;
}
