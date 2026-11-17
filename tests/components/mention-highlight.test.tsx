// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/tasks/actions', () => ({}));
import { renderBody } from '@/features/tasks/components/task-comments';

const marks = (body: string, names: string[]) =>
  Array.from(render(<p>{renderBody(body, names)}</p>).container.querySelectorAll('mark')).map((m) => m.textContent);

describe('comment mention highlighting', () => {
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
});
