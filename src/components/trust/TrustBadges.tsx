'use client'

import type { Origin, Review, ReviewState } from '@/types/analysis'

const ORIGIN_STYLES: Record<Origin['type'], { label: string; className: string }> = {
  observed: {
    label: 'Observed',
    className: 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60',
  },
  inferred: {
    label: 'Inferred',
    className: 'bg-sky-950/40 text-sky-300 border-sky-800/60',
  },
  'requirement-driven': {
    label: 'Requested',
    className: 'bg-violet-950/40 text-violet-300 border-violet-800/60',
  },
}

const REVIEW_STYLES: Record<ReviewState, { label: string; className: string }> = {
  pending: {
    label: 'Pending review',
    className: 'bg-amber-950/40 text-amber-300 border-amber-800/60',
  },
  confirmed: {
    label: 'Confirmed',
    className: 'bg-green-950/40 text-green-300 border-green-800/60',
  },
  rejected: {
    label: 'Rejected',
    className: 'bg-red-950/40 text-red-300 border-red-800/60',
  },
}

export function OriginBadge({ origin, compact = false }: { origin?: Origin; compact?: boolean }) {
  if (!origin) return null
  const s = ORIGIN_STYLES[origin.type]
  return (
    <span
      title={origin.reason}
      className={
        'inline-flex items-center border rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ' +
        s.className +
        (compact ? '' : '')
      }
    >
      {s.label}
    </span>
  )
}

export function ReviewBadge({ review }: { review?: Review }) {
  const state: ReviewState = review?.state ?? 'pending'
  const s = REVIEW_STYLES[state]
  return (
    <span
      title={review?.note}
      className={
        'inline-flex items-center border rounded px-1.5 py-0.5 text-[10px] font-medium ' + s.className
      }
    >
      {s.label}
    </span>
  )
}

export function TrustRow({ origin, review }: { origin?: Origin; review?: Review }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <OriginBadge origin={origin} />
      <ReviewBadge review={review} />
    </div>
  )
}

export function ReviewControls({
  review,
  onChange,
  compact = false,
}: {
  review?: Review
  onChange: (state: ReviewState, note?: string) => void
  compact?: boolean
}) {
  const current: ReviewState = review?.state ?? 'pending'
  const base =
    'border rounded px-2 py-0.5 text-[10px] font-medium transition-colors cursor-pointer'
  const off = 'border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500'
  const confirmed = 'border-green-600 bg-green-950/40 text-green-300'
  const pending = 'border-amber-600 bg-amber-950/40 text-amber-300'
  const rejected = 'border-red-600 bg-red-950/40 text-red-300'
  function promptNote(to: ReviewState) {
    if (to === 'rejected') {
      const note = window.prompt(
        'Why are you rejecting this? (saved across sessions for this site)',
        review?.note ?? '',
      )
      if (note === null) return
      onChange(to, note || undefined)
      return
    }
    if (compact) {
      onChange(to)
      return
    }
    const note = window.prompt(
      to === 'confirmed' ? 'Optional confirmation note:' : 'Optional note:',
      review?.note ?? '',
    )
    if (note === null) return
    onChange(to, note || undefined)
  }
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => promptNote('confirmed')}
        className={base + ' ' + (current === 'confirmed' ? confirmed : off)}
      >
        Confirm
      </button>
      <button
        type="button"
        onClick={() => promptNote('pending')}
        className={base + ' ' + (current === 'pending' ? pending : off)}
      >
        Pending
      </button>
      <button
        type="button"
        onClick={() => promptNote('rejected')}
        className={base + ' ' + (current === 'rejected' ? rejected : off)}
      >
        Reject
      </button>
    </div>
  )
}
