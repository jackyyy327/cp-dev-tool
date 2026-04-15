'use client'

import { useAnalysisStore } from '@/lib/analysis-store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type { Evidence, EvidenceKind, PageTypeDraft } from '@/types/analysis'
import { Check, X, ShieldAlert, Link2, FileText, Target, Gauge } from 'lucide-react'

const KIND_META: Record<EvidenceKind, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  UrlPattern: { label: 'URL Pattern', icon: Link2, color: 'text-blue-400' },
  PageSignal: { label: 'Page Signal', icon: FileText, color: 'text-cyan-400' },
  RequirementMatch: { label: 'Requirement Match', icon: Target, color: 'text-violet-400' },
  Confidence: { label: 'Confidence', icon: Gauge, color: 'text-green-400' },
  Risk: { label: 'Risk', icon: ShieldAlert, color: 'text-red-400' },
}

interface Props {
  pageType: PageTypeDraft | null
}

export function EvidencePane({ pageType }: Props) {
  const { state, dispatch } = useAnalysisStore()
  const analysis = state.analysis!

  const evidenceList: Evidence[] = pageType
    ? analysis.evidence.filter((e) => pageType.evidenceRefs.includes(e.id))
    : []

  return (
    <aside className="space-y-4">
      <Card size="sm" className="bg-gray-900 border-gray-800 px-4">
        <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium">Evidence</h3>
        {evidenceList.length === 0 ? (
          <p className="text-xs text-gray-600">No evidence attached to this Page Type.</p>
        ) : (
          <ul className="space-y-2">
            {evidenceList.map((ev) => {
              const meta = KIND_META[ev.kind]
              const Icon = meta.icon
              return (
                <li key={ev.id} className="flex gap-2">
                  <Icon className={'w-3.5 h-3.5 mt-0.5 shrink-0 ' + meta.color} />
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wide text-gray-600">
                      {meta.label}
                    </div>
                    <div className="text-xs text-gray-200 font-mono break-words">{ev.label}</div>
                    <div className="text-[11px] text-gray-500">{ev.detail}</div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      <Card size="sm" className="bg-gray-900 border-gray-800 px-4">
        <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium">Assumptions</h3>
        {analysis.assumptions.length === 0 ? (
          <p className="text-xs text-gray-600">No assumptions recorded.</p>
        ) : (
          <ul className="space-y-1.5 text-xs text-gray-400 list-disc pl-4">
            {analysis.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card size="sm" className="bg-gray-900 border-gray-800 px-4">
        <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
          Open Questions
        </h3>
        {analysis.pendingConfirmations.length === 0 ? (
          <p className="text-xs text-gray-600">No open questions.</p>
        ) : (
          <ul className="space-y-2">
            {analysis.pendingConfirmations.map((p) => (
              <li
                key={p.id}
                className="bg-gray-950 border border-gray-800 rounded px-3 py-2 space-y-2"
              >
                <div className="text-xs text-gray-300">{p.question}</div>
                <div className="flex gap-1.5">
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => dispatch({ type: 'CONFIRM_PENDING', id: p.id })}
                    className="border-green-900 text-green-400 hover:bg-green-950/30"
                  >
                    <Check className="w-3 h-3" /> Confirm
                  </Button>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => dispatch({ type: 'DISMISS_PENDING', id: p.id })}
                    className="text-gray-500 hover:text-white"
                  >
                    <X className="w-3 h-3" /> Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </aside>
  )
}
