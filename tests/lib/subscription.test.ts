import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSelect, mockWhere, mockFrom } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockWhere: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/db/drizzle', () => ({
  db: { select: mockSelect },
}));

vi.mock('@/lib/stripe', () => ({
  PLANS: {
    free: { maxWorkspaces: 1, priceId: null },
    pro: { maxWorkspaces: 5, priceId: 'price_pro' },
    business: { maxWorkspaces: null, priceId: 'price_business' },
  },
  getPlanFromPriceId: vi.fn(),
}));

import { getUserPlan, checkWorkspaceLimit } from '@/lib/subscription';

function chainMock(resolvedValue: unknown[]) {
  mockWhere.mockResolvedValue(resolvedValue);
  mockFrom.mockReturnValue({ where: mockWhere });
  mockSelect.mockReturnValue({ from: mockFrom });
}

beforeEach(() => vi.clearAllMocks());

describe('getUserPlan', () => {
  it('returns free when no subscription exists', async () => {
    chainMock([]);
    expect(await getUserPlan('user-1')).toBe('free');
  });

  it('returns free when subscription is canceled', async () => {
    chainMock([{ status: 'canceled', plan: 'pro' }]);
    expect(await getUserPlan('user-1')).toBe('free');
  });

  it('returns free when subscription is unpaid', async () => {
    chainMock([{ status: 'unpaid', plan: 'pro' }]);
    expect(await getUserPlan('user-1')).toBe('free');
  });

  it('returns pro when subscription is active', async () => {
    chainMock([{ status: 'active', plan: 'pro' }]);
    expect(await getUserPlan('user-1')).toBe('pro');
  });

  it('returns business when subscription is trialing', async () => {
    chainMock([{ status: 'trialing', plan: 'business' }]);
    expect(await getUserPlan('user-1')).toBe('business');
  });
});

describe('checkWorkspaceLimit', () => {
  it('allows creation when under free plan limit', async () => {
    mockWhere.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 0 }]);
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await checkWorkspaceLimit('user-1');
    expect(result).toEqual({ allowed: true, current: 0, limit: 1 });
  });

  it('blocks when free plan limit is reached', async () => {
    mockWhere.mockResolvedValueOnce([]).mockResolvedValueOnce([{ count: 1 }]);
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await checkWorkspaceLimit('user-1');
    expect(result.allowed).toBe(false);
  });

  it('allows unlimited workspaces on business plan', async () => {
    mockWhere
      .mockResolvedValueOnce([{ status: 'active', plan: 'business' }])
      .mockResolvedValueOnce([{ count: 99 }]);
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await checkWorkspaceLimit('user-1');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBeNull();
  });

  it('blocks when pro plan limit of 5 is reached', async () => {
    mockWhere
      .mockResolvedValueOnce([{ status: 'active', plan: 'pro' }])
      .mockResolvedValueOnce([{ count: 5 }]);
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await checkWorkspaceLimit('user-1');
    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(5);
  });

  it('allows on pro plan when under limit', async () => {
    mockWhere
      .mockResolvedValueOnce([{ status: 'active', plan: 'pro' }])
      .mockResolvedValueOnce([{ count: 4 }]);
    mockFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockFrom });

    const result = await checkWorkspaceLimit('user-1');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(5);
  });
});
