import { describe, expect, it } from 'vitest';
import { mentionedNames } from '@/features/tasks/mentions';

describe('mentionedNames (shared by notifications and highlighting)', () => {
  it('takes the longest member name at each @, so "@Ada Lovelace" does not also mention "Ada"', () => {
    expect(mentionedNames('ping @Ada Lovelace about it', ['Ada', 'Ada Lovelace'])).toEqual(['Ada Lovelace']);
  });

  it('still mentions both when both are written', () => {
    expect(mentionedNames('@ada lovelace and @Ada', ['Ada', 'Ada Lovelace']).sort()).toEqual(['Ada', 'Ada Lovelace']);
  });

  it('ignores prefixes, non-members and empty names', () => {
    expect(mentionedNames('ask @Bobby or @nobody', ['Bob', '', '  '])).toEqual([]);
  });

  it('treats names with regex characters literally and deduplicates', () => {
    expect(mentionedNames('@J.R. (ops) and again @j.r. (ops)', ['J.R. (ops)'])).toEqual(['J.R. (ops)']);
  });
});
