import type { Segment } from '../types/db'

/**
 * The per-segment accents that shared screens switch on: commercial runs
 * orange, domestic green. Kept in one place so a screen serving both sides
 * carries a `segment` prop rather than two copies of the same markup.
 */
export interface SegmentTheme {
  /** Filled primary action — the new/edit buttons. */
  primary: string
  /** Watermark fill behind a hero card. */
  watermark: string
  /** Route prefix for this segment's pages. */
  base: string
}

export const SEGMENT_THEME: Record<Segment, SegmentTheme> = {
  commercial: {
    primary: 'bg-gradient-to-br from-accentSoft to-accent shadow-glow',
    watermark: 'rgba(228,87,27,.16)',
    base: '/commercial',
  },
  domestic: {
    primary:
      'bg-gradient-to-br from-[#3DA06A] to-[#2E8B57] shadow-[0_10px_22px_-12px_rgba(46,139,87,0.7)]',
    watermark: 'rgba(46,139,87,.18)',
    base: '/domestic',
  },
}
