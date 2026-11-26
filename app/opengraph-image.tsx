import { ImageResponse } from 'next/og';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from '@/lib/site';

export const alt = `${SITE_NAME}: ${SITE_TAGLINE.toLowerCase()}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/** Social share card used by OpenGraph and Twitter for every page that doesn't set its own. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: '#0b0b0f',
          color: '#fafafa',
          fontFamily: 'sans-serif',
        }}>
        <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -4 }}>
          {SITE_NAME.toLowerCase()}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.1, maxWidth: 900 }}>
            Client work, without the email chains.
          </div>
          <div style={{ fontSize: 30, color: '#a1a1aa', maxWidth: 900, lineHeight: 1.35 }}>
            {SITE_DESCRIPTION}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
