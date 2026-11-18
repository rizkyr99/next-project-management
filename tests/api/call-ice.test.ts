import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/db/drizzle', () => ({ db: {} }));
vi.mock('@/lib/authz', async (orig) => ({
  ...(await orig<typeof import('@/lib/authz')>()),
  requireProjectAccess: vi.fn(),
}));

import { requireProjectAccess, AuthzError } from '@/lib/authz';
import { GET } from '@/app/api/call/ice/route';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const get = (id = PROJECT) => GET(new Request(`http://t/api/call/ice?projectId=${id}`));
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(requireProjectAccess).mockResolvedValue({} as never);
  delete process.env.CLOUDFLARE_TURN_KEY_ID;
  delete process.env.CLOUDFLARE_TURN_API_TOKEN;
});
afterEach(() => vi.unstubAllGlobals());

function withTurn() {
  process.env.CLOUDFLARE_TURN_KEY_ID = 'key-1';
  process.env.CLOUDFLARE_TURN_API_TOKEN = 'token-1';
}

describe('GET /api/call/ice', () => {
  it('404s a project the user cannot access, without asking Cloudflare', async () => {
    withTurn();
    vi.mocked(requireProjectAccess).mockRejectedValue(new AuthzError());
    expect((await get()).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed project id', async () => {
    expect((await get('x')).status).toBe(400);
  });

  it('returns STUN only when TURN is not configured', async () => {
    const res = await get();
    expect(res.headers.get('cache-control')).toBe('no-store');
    const { iceServers } = await res.json();
    expect(iceServers).toEqual([{ urls: expect.arrayContaining([expect.stringMatching(/^stun:/)]) }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns short-lived Cloudflare TURN credentials, minus port-53 URLs', async () => {
    withTurn();
    fetchMock.mockResolvedValue(
      Response.json({
        iceServers: [
          { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
          {
            urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'],
            username: 'user',
            credential: 'cred',
          },
        ],
      }),
    );
    const { iceServers } = await (await get()).json();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://rtc.live.cloudflare.com/v1/turn/keys/key-1/credentials/generate-ice-servers');
    expect(init.headers.Authorization).toBe('Bearer token-1');
    expect(JSON.parse(init.body)).toEqual({ ttl: 14400 });
    expect(iceServers).toEqual([
      { urls: ['stun:stun.cloudflare.com:3478'] },
      {
        urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'],
        username: 'user',
        credential: 'cred',
      },
    ]);
  });

  it('falls back to STUN when Cloudflare fails', async () => {
    withTurn();
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { iceServers } = await (await get()).json();
    expect(iceServers[0].urls[0]).toMatch(/^stun:/);
  });
});
