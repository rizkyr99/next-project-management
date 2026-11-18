// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown } from '@/components/markdown';

const view = (text: string, names: string[] = []) => render(<Markdown text={text} mentionNames={names} />).container;
const marks = (body: string, names: string[]) =>
  Array.from(view(body, names).querySelectorAll('mark')).map((m) => m.textContent);

describe('mention highlighting', () => {
  it('highlights only the member name, not the rest of the sentence', () => {
    expect(marks('@Maya Chen can you check the headline copy?', ['Maya Chen', 'Jonas Weber'])).toEqual([
      '@Maya Chen',
    ]);
  });

  it('matches case-insensitively and prefers the longest name', () => {
    expect(marks('ping @ada lovelace and @Ada', ['Ada', 'Ada Lovelace'])).toEqual(['@ada lovelace', '@Ada']);
  });

  it("ignores @words that aren't members, and names that are only a prefix", () => {
    expect(marks('email me @home or ask @Bobby', ['Bob'])).toEqual([]);
  });

  it('treats names with regex characters literally', () => {
    expect(marks('thanks @J.R. (ops)', ['J.R. (ops)'])).toEqual(['@J.R. (ops)']);
  });

  it('keeps formatting around a mention', () => {
    const el = view('**@Maya Chen** please', ['Maya Chen']);
    expect(el.querySelector('strong mark')).toHaveTextContent('@Maya Chen');
  });
});

describe('formatting', () => {
  it('renders checklists as checkboxes, and tables', () => {
    const el = view('- [x] Brief\n- [ ] Draft\n\n| a | b |\n|---|---|\n| 1 | 2 |');
    const boxes = el.querySelectorAll('input[type=checkbox]');
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toBeChecked();
    expect(el.querySelector('table')).toBeInTheDocument();
  });

  it('opens links in a new tab, without referrer', () => {
    const link = view('[docs](https://example.com)').querySelector('a');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link?.getAttribute('rel')).toContain('noreferrer');
  });
});

describe('safety', () => {
  it('never renders raw HTML', () => {
    const el = view('<img src=x onerror="alert(1)"><script>alert(1)</script><b>bold</b>');
    expect(el.querySelector('script')).toBeNull();
    expect(el.querySelector('[onerror]')).toBeNull();
    expect(el.querySelector('b')).toBeNull();
  });

  it('drops javascript: links', () => {
    const link = view('[click](javascript:alert(1))').querySelector('a');
    expect(link?.getAttribute('href') ?? '').not.toMatch(/javascript/i);
  });

  it('shows images uploaded to Tide, but not images from other sites', () => {
    const el = view('![ours](/api/files/123e4567-e89b-42d3-a456-426614174000)\n\n![theirs](https://tracker.example/pixel.png)');
    const imgs = el.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toHaveAttribute('src', '/api/files/123e4567-e89b-42d3-a456-426614174000');
    expect(el).toHaveTextContent('image from another site not shown');
  });
});
