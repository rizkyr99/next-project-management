import { callRoomSchema } from '@/features/call/schema';
import { requireProjectAccess, toErrorResponse } from '@/lib/authz';

export const dynamic = 'force-dynamic';

/** Public STUN: enough when both people can reach each other directly. */
const STUN: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];

/** TURN credentials last long enough to cover a long call. */
const TTL_SECONDS = 4 * 60 * 60;

/**
 * ICE servers for a call. With Cloudflare TURN configured, it returns
 * short-lived TURN credentials as well, which relay video for people behind
 * strict NATs or firewalls, who otherwise couldn't connect at all. The key
 * stays on the server; browsers only ever see credentials that expire.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    callRoomSchema.parse({ projectId: searchParams.get('projectId') });
    await requireProjectAccess(searchParams.get('projectId')!);
  } catch (error) {
    return toErrorResponse(error);
  }

  const iceServers = (await turnServers()) ?? STUN;
  return Response.json({ iceServers }, { headers: { 'Cache-Control': 'no-store' } });
}

async function turnServers(): Promise<RTCIceServer[] | null> {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !token) return null;

  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: TTL_SECONDS }),
        signal: AbortSignal.timeout(5_000),
        cache: 'no-store',
      },
    );
    if (!res.ok) throw new Error(`Cloudflare TURN responded ${res.status}`);
    const body = (await res.json()) as { iceServers?: RTCIceServer | RTCIceServer[] };
    const servers = Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : [];
    // Browsers wait on every server listed; Cloudflare's port-53 URLs are
    // blocked by most browsers anyway, so leave them out.
    const cleaned = servers
      .map((s) => ({ ...s, urls: [s.urls].flat().filter((u) => !/:53(\?|$)/.test(u)) }))
      .filter((s) => s.urls.length > 0);
    return cleaned.length > 0 ? cleaned : null;
  } catch (err) {
    // Calls still work peer-to-peer without TURN.
    console.error('[call ice] TURN credentials unavailable:', err);
    return null;
  }
}
