'use client'

import { useAnalysisStore } from '@/lib/analysis-store'
import { getSiteMemory, type MemoryEntry, type MemoryTargetKind } from '@/lib/review-memory'
import { Card } from '@/components/ui/card'
import { Trash2, Brain } from 'lucide-react'

const KIND_LABELS: Record<MemoryTargetKind, string> = {
  pageType: 'Page Type',
  event: 'Event',
  attribute: 'Attribute',
}

export function DecisionsPanel() {
  const { state, actions } = useAnalysisStore()
  const siteUrl = state.analysis?.site.url
  // Re-read memory whenever memoryVersion bumps (state.memoryVersion is the
  // reactive trigger even though we don't reference its value directly).
  void state.memoryVersion
  const memory = siteUrl ? getSiteMemory(siteUrl) : null
  const entries = memory?.entries ?? []

  if (entries.length === 0) return null

  return (
    <Card size="sm" className="bg-gray-900 border-gray-800 px-4">
      <div className="flex items-center gap-2 mb-2">
        <Brain className="w-3.5 h-3.5 text-violet-400" />
        <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
          Remembered Decisions
        </h3>
        <span className="text-[10px] text-gray-600 ml-auto">
          {entries.length} for this site
        </span>
      </div>
      <p className="text-[11px] text-gray-600 mb-3">
        These rejections were saved from previous sessions. They auto-apply when
        this site is re-analyzed. Remove an entry to stop auto-rejecting.
      </p>
      <ul className="space-y-2">
        {entries.map((entry) => (
          <EntryRow
            key={entry.fingerprint}
            entry={entry}
            onForget={() => actions.forgetMemoryEntry(entry.fingerprint)}
          />
        ))}
      </ul>
    </Card>
  )
}

function EntryRow({
  entry,
  onForget,
}: {
  entry: MemoryEntry
  onForget: () => void
}) {
  const kindLabel = KIND_LABELS[entry.kind] ?? entry.kind
  const date = new Date(entry.createdAt).toLocaleDateString()
  return (
    <li className="flex items-start gap-2 text-xs bg-gray-950/60 border border-gray-800 rounded px-3 py-2">
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase text-gray-600">{kindLabel}</span>
          <span className="text-gray-300 font-medium truncate">{entry.displayLabel}</span>
        </div>
        <div className="text-gray-500">{entry.reason || '(no reason)'}</div>
        <div className="text-[10px] text-gray-700">{date}</div>
      </div>
      <button
        type="button"
        onClick={onForget}
        title="Forget this decision"
        className="text-gray-600 hover:text-red-400 transition-colors shrink-0 mt-0.5"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </li>
  )
}
