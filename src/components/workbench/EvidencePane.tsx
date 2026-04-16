'use client'

import { useAnalysisStore } from '@/lib/analysis-store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import type {
  Evidence,
  EvidenceKind,
  EvidenceLocation,
  PageTypeDraft,
} from '@/types/analysis'
import {
  Check,
  X,
  ShieldAlert,
  Link2,
  FileText,
  Target,
  Gauge,
  Scale,
  GitCompare,
  ExternalLink,
} from 'lucide-react'

const KIND_META: Record<
  EvidenceKind,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  UrlPattern: { label: 'URL Pattern', icon: Link2, color: 'text-blue-400' },
  PageSignal: { label: 'Page Signal', icon: FileText, color: 'text-cyan-400' },
  RequirementMatch: { label: 'Requirement Match', icon: Target, color: 'text-violet-400' },
  Confidence: { label: 'Confidence', icon: Gauge, color: 'text-green-400' },
  Risk: { label: 'Risk', icon: ShieldAlert, color: 'text-red-400' },
  Scoring: { label: 'Classification', icon: Scale, color: 'text-amber-400' },
  Competing: { label: 'Competing', icon: GitCompare, color: 'text-orange-400' },
}

interface Props {
  pageType: PageTypeDraft | null
}

export function EvidencePane({ pageType }: Props) {
  const { state, dispatch } = useAnalysisStore()
  const analysis = state.analysis!
  const siteUrl = analysis.site.url

  const evidenceList: Evidence[] = pageType
    ? analysis.evidence.filter((e) => pageType.evidenceRefs.includes(e.id))
    : []

  // Lift the scoring evidence's confidence reason to the top of the pane so
  // consultants see "why this level" without scanning the whole list.
  const scoringEv = evidenceList.find((e) => e.kind === 'Scoring')

  return (
    <aside className="space-y-4">
      <Card size="sm" className="bg-gray-900 border-gray-800 px-4">
        <h3 className="text-xs uppercase tracking-wide text-gray-500 font-medium">Evidence</h3>
        {pageType && (
          <div className="text-[11px] text-gray-500 mb-2">
            Confidence: <span className={confColor(pageType.confidence)}>{pageType.confidence}</span>
          </div>
        )}
        {pageType && scoringEv?.confidenceReason && (
          <div className="mb-3 border-l-2 border-green-900/80 pl-2 text-[11px] text-gray-300 italic">
            <span className="text-gray-500 not-italic">Why {pageType.confidence}: </span>
            {scoringEv.confidenceReason}
          </div>
        )}
        {evidenceList.length === 0 ? (
          <p className="text-xs text-gray-600">No evidence attached to this Page Type.</p>
        ) : (
          <ul className="space-y-3">
            {evidenceList.map((ev) => {
              const meta = KIND_META[ev.kind]
              const Icon = meta.icon
              return (
                <li key={ev.id} className="flex gap-2">
                  <Icon className={'w-3.5 h-3.5 mt-0.5 shrink-0 ' + meta.color} />
                  <div className="min-w-0 space-y-1">
                    <div className="text-[10px] uppercase tracking-wide text-gray-600">
                      {meta.label}
                      {ev.source && ev.source !== ev.kind ? ' · ' + ev.source : ''}
                    </div>
                    <div className="text-xs text-gray-100 font-medium break-words">{ev.label}</div>
                    <div className="text-[11px] text-gray-500 leading-snug">{ev.detail}</div>
                    {ev.matched && ev.matched.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-0.5">
                        {ev.matched.slice(0, 8).map((m, i) => (
                          <span
                            key={i}
                            className="text-[10px] font-mono bg-gray-950 border border-gray-800 text-gray-400 rounded px-1.5 py-0.5"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    )}
                    {ev.locations && ev.locations.length > 0 && (
                      <LocationsList locations={ev.locations} siteUrl={siteUrl} />
                    )}
                    {ev.confidenceReason && ev.kind !== 'Scoring' && (
                      <div className="text-[11px] text-green-400/70 italic">
                        Why: {ev.confidenceReason}
                      </div>
                    )}
                    {ev.competingInterpretation && (
                      <div className="text-[11px] text-orange-300/80">
                        Could also be: {ev.competingInterpretation}
                      </div>
                    )}
                    {ev.consultantAction && (
                      <div className="text-[11px] text-violet-300/80">
                        Next: {ev.consultantAction}
                      </div>
                    )}
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

function LocationsList({
  locations,
  siteUrl,
}: {
  locations: EvidenceLocation[]
  siteUrl: string
}) {
  return (
    <ul className="pt-1 space-y-1.5">
      {locations.slice(0, 12).map((loc, i) => {
        const href = toAbsolute(siteUrl, loc.url)
        return (
          <li key={i} className="border-l border-gray-800 pl-2">
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-mono text-blue-400 hover:text-blue-300 break-all"
            >
              <ExternalLink className="w-3 h-3 shrink-0" />
              {loc.url}
            </a>
            {loc.label && loc.label !== loc.url && (
              <div className="text-[10px] text-gray-500 italic">{loc.label}</div>
            )}
            {loc.patternName && (
              <div className="text-[10px] text-gray-600">matched: {loc.patternName}</div>
            )}
            {loc.snippet && (
              <div className="text-[11px] text-gray-400 font-mono bg-gray-950/60 border border-gray-800/60 rounded px-1.5 py-1 mt-0.5 break-words">
                …{loc.snippet}…
              </div>
            )}
          </li>
        )
      })}
      {locations.length > 12 && (
        <li className="text-[10px] text-gray-600 pl-2">
          +{locations.length - 12} more
        </li>
      )}
    </ul>
  )
}

function toAbsolute(siteUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  try {
    const origin = new URL(siteUrl).origin
    return origin + (path.startsWith('/') ? path : '/' + path)
  } catch {
    return path
  }
}

function confColor(c: 'high' | 'medium' | 'low'): string {
  if (c === 'high') return 'text-green-400'
  if (c === 'medium') return 'text-amber-400'
  return 'text-red-400'
}
