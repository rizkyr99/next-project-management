// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
import * as Sentry from '@sentry/nextjs';
import { RouteError } from '@/components/route-error';

describe('RouteError', () => {
  it('reports to Sentry, explains, retries and offers a way out', async () => {
    const error = Object.assign(new Error('boom'), { digest: 'abc123' });
    const reset = vi.fn();
    render(
      <RouteError error={error} reset={reset} title='Something went wrong loading this project' backHref='/workspaces/acme' backLabel='Back to workspace' />,
    );

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong loading this project');
    expect(screen.getByText('Error code: abc123')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to workspace' })).toHaveAttribute('href', '/workspaces/acme');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
