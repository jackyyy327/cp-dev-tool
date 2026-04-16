'use client'

import { useAnalysisStore } from '@/lib/analysis-store'
import { Button } from '@/components/ui/button'
import { PageTypeList } from './PageTypeList'
import { PageTypeEditor } from './PageTypeEditor'
import { EvidencePane } from './EvidencePane'
import { DecisionsPanel } from './DecisionsPanel'
import { OriginBadge, ReviewControls } from '@/components/trust/TrustBadges'
import { ArrowLeft, ArrowRight, ExternalLink, AlertTriangle } from 'lucide-react'
import type { EvidenceLocation } from '@/types/analysis'

export function Workbench() {
  const { state, actions } = useAnalysisStore()
  const analysis = state.analysis
  if (!analysis) return null

  const selected =
    analysis.pageTypes.find((pt) => pt.id === state.selectedPageTypeId) ??
    analysis.pageTypes[0] ??
    null

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="border-b border-gray-800 bg-gray-900/50 sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={actions.backToInput}
              className="text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Input
            </Button>
            <span className="text-gray-700">/</span>
            <span className="text-sm text-white font-medium">
              Discovery &amp; Confirmation Workbench
            </span>
            <span className="text-xs text-gray-600">{analysis.site.url}</span>
          </div>
          <Button
            onClick={actions.goToResult}
            className="bg-blue-600 hover:bg-blue-500 text-white border-blue-600"
          >
            Generate Draft
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </header>

      <main className="flex-1 max-w-screen-2xl w-full mx-auto px-6 py-6 flex flex-col gap-4">
        <PartialDiscoveryBanner />
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
          <PageTypeList />
          <PageTypeEditor pageType={selected} />
          <EvidencePane pageType={selected} />
        </div>
        <AttributesStrip />
        <DecisionsPanel />
      </main>
    </div>
  )
}

function AttributesStrip() {
  const { state, actions } = useAnalysisStore()
  const analysis = state.analysis
  const attrs = analysis?.attributes ?? []
  const siteUrl = analysis?.site.url ?? ''
  if (attrs.length === 0) {
    return (
      <section className="border border-gray-800 rounded bg-gray-900/40 p-4 text-xs text-gray-500">
        <div className="text-gray-300 text-sm font-medium mb-1">User Attributes</div>
        No attribute candidates detected. Personalization targeting will rely on page type alone until attributes are added manually.
      </section>
    )
  }
  const confColor: Record<string, string> = {
    high: 'text-emerald-300 border-emerald-700/50',
    medium: 'text-amber-300 border-amber-700/50',
    low: 'text-gray-400 border-gray-700',
  }
  return (
    <section className="border border-gray-800 rounded bg-gray-900/40 p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-gray-200 text-sm font-medium">User Attribute Candidates</div>
        <div className="text-[11px] text-gray-500">
          {attrs.length} detected · confirm sources before locking
        </div>
      </div>
      <ul className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {attrs.map((a) => {
          const locations = (
            analysis?.evidence
              .filter((e) => a.evidenceRefs.includes(e.id))
              .flatMap((e) => e.locations ?? []) ?? []
          ).slice(0, 3)
          return (
            <li
              key={a.id}
              className={
                'border rounded px-3 py-2 text-xs bg-gray-950/60 ' +
                (a.status === 'excluded'
                  ? 'border-red-900/50 text-red-300'
                  : 'border-gray-800 text-gray-300')
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-gray-100">
                  {a.name}
                  <span className="ml-1 text-[10px] text-gray-500">({a.category})</span>
                </span>
                <span
                  className={
                    'text-[10px] uppercase border rounded px-1.5 py-0.5 ' +
                    (confColor[a.confidence] ?? 'text-gray-400 border-gray-700')
                  }
                >
                  {a.status === 'excluded' ? 'excluded' : a.confidence}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                <OriginBadge origin={a.origin} />
                {a.status !== 'excluded' && (
                  <ReviewControls
                    review={a.review}
                    compact
                    onChange={(rs) => actions.review('attribute', a.id, rs)}
                  />
                )}
              </div>
              <div className="mt-1.5 text-gray-500">source: {a.proposedSource}</div>
              <div className="mt-1 text-gray-500">{a.confidenceReason}</div>
              <div className="mt-1 text-amber-200/80">→ {a.consultantAction}</div>
              {a.review?.note && (
                <div className="mt-1.5 text-[11px] text-red-300/80 italic border-l-2 border-red-900/60 pl-2">
                  {a.review.note}
                </div>
              )}
              {locations.length > 0 && (
                <AttributeLocations locations={locations} siteUrl={siteUrl} />
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function AttributeLocations({
  locations,
  siteUrl,
}: {
  locations: EvidenceLocation[]
  siteUrl: string
}) {
  return (
    <ul className="mt-2 space-y-1 border-t border-gray-800/60 pt-2">
      {locations.map((loc, i) => (
        <li key={i} className="text-[10px] leading-snug">
          <a
            href={toAbsoluteUrl(siteUrl, loc.url)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 font-mono break-all"
          >
            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
            {loc.url}
          </a>
          {loc.patternName && (
            <span className="text-gray-600"> · {loc.patternName}</span>
          )}
          {loc.snippet && (
            <div className="mt-0.5 font-mono text-gray-500 break-words">…{loc.snippet}…</div>
          )}
        </li>
      ))}
    </ul>
  )
}

function PartialDiscoveryBanner() {
  const { state } = useAnalysisStore()
  const sampleCount = state.analysis?.site.sampledPages.length ?? 0
  if (sampleCount >= 3) return null
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-800/60 bg-amber-950/30 px-4 py-3">
      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
      <div className="text-sm text-amber-200">
        <span className="font-medium">Limited discovery:</span> only {sampleCount} page(s) were
        reachable from the entry point. These results may not represent the full site structure.
        Try providing a different entry URL or adding page URLs manually.
      </div>
    </div>
  )
}

function toAbsoluteUrl(siteUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  try {
    const origin = new URL(siteUrl).origin
    return origin + (path.startsWith('/') ? path : '/' + path)
  } catch {
    return path
  }
}
