'use client'

import { useAnalysisStore } from '@/lib/analysis-store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Plus, Check, Circle, Edit3 } from 'lucide-react'
import { OriginBadge, ReviewBadge } from '@/components/trust/TrustBadges'

export function PageTypeList() {
  const { state, dispatch } = useAnalysisStore()
  const analysis = state.analysis!
  const selectedId = state.selectedPageTypeId

  return (
    <aside className="space-y-4">
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
            Candidate Page Types
          </h2>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => dispatch({ type: 'ADD_PAGE_TYPE' })}
            className="text-gray-500 hover:text-white"
            aria-label="Create new Page Type"
          >
            <Plus className="w-3 h-3" />
          </Button>
        </div>
        <div className="space-y-1.5">
          {analysis.pageTypes.map((pt) => {
            const active = pt.id === selectedId
            return (
              <button
                key={pt.id}
                onClick={() => dispatch({ type: 'SELECT_PAGE_TYPE', id: pt.id })}
                className={
                  'w-full text-left rounded-lg border px-3 py-2 transition-colors ' +
                  (active
                    ? 'bg-blue-950/30 border-blue-800 text-white'
                    : 'bg-gray-900 border-gray-800 text-gray-300 hover:border-gray-700')
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">{pt.name}</span>
                  <StatusBadge status={pt.status} />
                </div>
                <div className="text-xs text-gray-500 truncate mt-0.5">{pt.isMatchHint}</div>
                <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                  <OriginBadge origin={pt.origin} />
                  <ReviewBadge review={pt.review} />
                </div>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-600">
                  <span>{pt.sampleUrls.length} sample{pt.sampleUrls.length === 1 ? '' : 's'}</span>
                  <span>·</span>
                  <span className="capitalize">{pt.confidence} confidence</span>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <Card size="sm" className="bg-gray-900 border-gray-800 px-4">
        <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
          Site Structure Summary
        </h3>
        <dl className="text-xs text-gray-400 space-y-1">
          <Row k="URL" v={analysis.site.url} />
          {analysis.site.platform && <Row k="Platform" v={analysis.site.platform} />}
          <Row k="Sampled Pages" v={String(analysis.site.sampledPages.length)} />
          <Row k="Page Types" v={String(analysis.pageTypes.length)} />
          <Row k="Objects" v={String(analysis.dataObjects.length)} />
          <Row k="Events" v={String(analysis.events.length)} />
        </dl>
      </Card>

      <Card size="sm" className="bg-gray-900 border-gray-800 px-4">
        <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
          Sampled Pages
        </h3>
        <ul className="space-y-1.5">
          {analysis.site.sampledPages.map((p) => (
            <li key={p.url} className="text-xs">
              <div className="text-gray-300 font-mono truncate">{p.url}</div>
              {p.signals.length > 0 && (
                <div className="text-gray-600 truncate">{p.signals.join(', ')}</div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </aside>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-gray-600">{k}</dt>
      <dd className="text-gray-300 font-mono text-[11px] truncate max-w-[60%]">{v}</dd>
    </div>
  )
}

function StatusBadge({ status }: { status: 'suggested' | 'confirmed' | 'edited' }) {
  if (status === 'confirmed')
    return (
      <span className="text-[10px] text-green-400 flex items-center gap-1">
        <Check className="w-3 h-3" /> Confirmed
      </span>
    )
  if (status === 'edited')
    return (
      <span className="text-[10px] text-blue-400 flex items-center gap-1">
        <Edit3 className="w-3 h-3" /> Edited
      </span>
    )
  return (
    <span className="text-[10px] text-gray-500 flex items-center gap-1">
      <Circle className="w-3 h-3" /> Suggested
    </span>
  )
}
