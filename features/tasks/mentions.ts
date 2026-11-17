/**
 * @mention matching, shared by the server (who gets notified) and the comment
 * view (what gets highlighted), so the two can never disagree.
 *
 * Rules: case-insensitive; the name must end at a non-word character or the
 * end of the text; and at each "@" the longest member name wins, so
 * "@Ada Lovelace" mentions Ada Lovelace only, not also a member named "Ada".
 */

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A global regex capturing `@Name` for any of `names`, longest first; null if none. */
export function mentionPattern(names: string[]): RegExp | null {
  const alternatives = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  if (alternatives.length === 0) return null;
  return new RegExp(`(@(?:${alternatives.join('|')})(?!\\w))`, 'gi');
}

/** The member names mentioned in `text`, as written in `names` (deduplicated). */
export function mentionedNames(text: string, names: string[]): string[] {
  const pattern = mentionPattern(names);
  if (!pattern) return [];
  const byLower = new Map(names.map((n) => [n.trim().toLowerCase(), n]));
  const found = new Set<string>();
  for (const match of text.matchAll(pattern)) {
    const name = byLower.get(match[1].slice(1).toLowerCase());
    if (name) found.add(name);
  }
  return [...found];
}
