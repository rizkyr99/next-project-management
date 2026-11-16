/** Column dot colors. Stored as the key; rendered with these classes. */
export const STATUS_COLORS = {
  gray: 'bg-zinc-400',
  blue: 'bg-blue-500',
  green: 'bg-emerald-500',
  yellow: 'bg-amber-400',
  orange: 'bg-orange-500',
  red: 'bg-red-500',
  purple: 'bg-violet-500',
  pink: 'bg-pink-500',
} as const;

export type StatusColor = keyof typeof STATUS_COLORS;
export const STATUS_COLOR_KEYS = Object.keys(STATUS_COLORS) as [StatusColor, ...StatusColor[]];

export function statusDotClass(color: string | null | undefined): string {
  return color && color in STATUS_COLORS ? STATUS_COLORS[color as StatusColor] : 'bg-muted-foreground/40';
}
