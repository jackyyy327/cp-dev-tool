'use client'

import { useMemo, useState } from 'react'
import { useAnalysisStore } from '@/lib/analysis-store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { codeFromAnalysis } from '@/lib/code-from-analysis'
import { sitemapJSONFromAnalysis } from '@/lib/export/sitemap-json'
import { designDocFromAnalysis } from '@/lib/export/design-doc'
import { downloadJSON, downloadMarkdown, downloadJS } from '@/lib/export/download'
import { ArrowLeft, Copy, Check, Download, FileJson, FileText, FileCode } from 'lucide-react'
import { OriginBadge, ReviewBadge } from '@/components/trust/TrustBadges'
import type {
  AnalysisResult,
  AttributeCandidate,
  EventDraft,
  PageTypeDraft,
} from '@/types/analysis'

type Tab = 'summary' | 'code' | 'notes'

export function ResultPage() {
  const { state, actions } = useAnalysisStore()
  const analysis = state.analysis!
  const [tab, setTab] = useState<Tab>('summary')
  const code = useMemo(() => codeFromAnalysis(analysis), [analysis])

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      <header className="border-b border-gray-800 bg-gray-900/50 sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={actions.backToWorkbench}
              className="text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Workbench
            </Button>
            <span className="text-gray-700">/</span>
            <span className="text-sm text-white font-medium">Result</span>
            <span className="text-xs text-gray-600">{analysis.site.url}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
              <TabButton active={tab === 'summary'} onClick={() => setTab('summary')}>
                Design Summary
              </TabButton>
              <TabButton active={tab === 'code'} onClick={() => setTab('code')}>
                Sitemap Code
              </TabButton>
              <TabButton active={tab === 'notes'} onClick={() => setTab('notes')}>
                Notes
              </TabButton>
            </div>
            <ExportButtons analysis={analysis} code={code} />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-screen-2xl w-full mx-auto px-6 py-6">
        {tab === 'summary' && <DesignSummary />}
        {tab === 'code' && <SitemapCode code={code} />}
        {tab === 'notes' && <NotesTab />}
      </main>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={
        'px-3 py-1 rounded-md text-xs font-medium transition-colors ' +
        (active ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white')
      }
    >
      {children}
    </button>
  )
}

function DesignSummary() {
  const analysis = useAnalysisStore().state.analysis!
  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
      <ConsultantSummaryCard analysis={analysis} />
      <Card size="sm" className="bg-gray-900 border-gray-800 px-5 lg:col-span-2">
        <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium">Page Types</h2>
        <table className="w-full text-xs">
          <thead className="text-gray-600">
            <tr>
              <th className="text-left font-normal pb-1">Name</th>
              <th className="text-left font-normal pb-1">isMatch</th>
              <th className="text-left font-normal pb-1">Interaction</th>
              <th className="text-left font-normal pb-1">Object</th>
              <th className="text-left font-normal pb-1">Events</th>
              <th className="text-left font-normal pb-1">Origin</th>
              <th className="text-left font-normal pb-1">Review</th>
            </tr>
          </thead>
          <tbody>
            {analysis.pageTypes.map((pt) => {
              const object = pt.objectRefs[0]
                ? analysis.dataObjects.find((d) => d.id === pt.objectRefs[0])
                : null
              const events = analysis.events.filter((e) => pt.eventRefs.includes(e.id))
              return (
                <tr key={pt.id} className="border-t border-gray-800">
                  <td className="py-2 text-white font-medium">{pt.name}</td>
                  <td className="py-2 text-gray-400 font-mono">{pt.isMatchHint}</td>
                  <td className="py-2 text-gray-300 font-mono">{pt.interactionName ?? '—'}</td>
                  <td className="py-2 text-gray-300">{object?.type ?? '—'}</td>
                  <td className="py-2 text-gray-300">
                    {events.length === 0
                      ? '—'
                      : events
                          .map((e) =>
                            e.kind === 'interaction' ? e.interactionName : e.customName,
                          )
                          .join(', ')}
                  </td>
                  <td className="py-2"><OriginBadge origin={pt.origin} /></td>
                  <td className="py-2"><ReviewBadge review={pt.review} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <Card size="sm" className="bg-gray-900 border-gray-800 px-5">
        <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
          Catalog Objects
        </h2>
        <ul className="space-y-3">
          {analysis.dataObjects.map((d) => (
            <li key={d.id}>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="border-gray-700 text-gray-300">
                  {d.type}
                </Badge>
                <span className="text-xs text-gray-300 font-medium">{d.label}</span>
              </div>
              <ul className="text-xs text-gray-500 pl-4 list-disc space-y-0.5">
                {d.fields.map((f, i) => (
                  <li key={i}>
                    <span className="font-mono text-gray-300">{f.name}</span>
                    <span className="text-gray-600"> ← {f.source}</span>
                    {f.required && <span className="text-red-400"> *</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Card>

      <Card size="sm" className="bg-gray-900 border-gray-800 px-5">
        <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium">Events</h2>
        {analysis.events.length === 0 ? (
          <p className="text-xs text-gray-600">No events defined.</p>
        ) : (
          <ul className="space-y-2 text-xs">
            {analysis.events.map((e) => (
              <li key={e.id} className="border-t border-gray-800 pt-2 first:border-0 first:pt-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono text-gray-300 truncate">
                    {e.kind === 'interaction'
                      ? `SalesforceInteractions.${e.interactionName}`
                      : e.customName}
                  </div>
                  <div className="flex items-center gap-1">
                    <OriginBadge origin={e.origin} />
                    <ReviewBadge review={e.review} />
                  </div>
                </div>
                <div className="text-gray-600">{e.triggerHint}</div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card size="sm" className="bg-gray-900 border-gray-800 px-5 lg:col-span-2">
        <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
          Requirement Mappings
        </h2>
        <ul className="space-y-2 text-xs">
          {analysis.requirementMappings.map((rm) => {
            const pt = rm.targets[0]?.pageTypeRef
              ? analysis.pageTypes.find((p) => p.id === rm.targets[0].pageTypeRef)
              : null
            return (
              <li key={rm.id} className="flex items-start justify-between gap-3">
                <span className="text-gray-300">{rm.text}</span>
                <span className="text-gray-500">
                  {pt ? pt.name : 'unmapped'} · {rm.status}
                </span>
              </li>
            )
          })}
        </ul>
      </Card>

      <Card size="sm" className="bg-gray-900 border-gray-800 px-5">
        <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
          Pending Confirmations
        </h2>
        {analysis.pendingConfirmations.length === 0 ? (
          <p className="text-xs text-gray-600">All confirmations resolved.</p>
        ) : (
          <ul className="space-y-1.5 text-xs text-gray-400 list-disc pl-4">
            {analysis.pendingConfirmations.map((p) => (
              <li key={p.id}>{p.question}</li>
            ))}
          </ul>
        )}
      </Card>

      <Card size="sm" className="bg-gray-900 border-gray-800 px-5">
        <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium">Assumptions</h2>
        <ul className="space-y-1.5 text-xs text-gray-400 list-disc pl-4">
          {analysis.assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

function ConsultantSummaryCard({ analysis }: { analysis: AnalysisResult }) {
  const groups = groupForSummary(analysis)
  return (
    <Card size="sm" className="bg-gray-900 border-gray-800 px-5 lg:col-span-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm text-white font-semibold">Consultant Summary</h2>
        <span className="text-[11px] text-gray-500">
          Tracking design working draft · derived from structured state
        </span>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        Recommended items have either been confirmed by the consultant or are observed site facts
        with high confidence. Pending items still need review. Requested items were proposed by
        the requirement text and have no crawl-time evidence yet.
      </p>

      <div className="grid gap-4 mt-4 grid-cols-1 md:grid-cols-2">
        <SummaryList
          title="Recommended Page Types"
          items={groups.recommendedPts.map((pt) => ({
            id: pt.id,
            label: pt.name,
            meta: pt.interactionName,
            origin: pt.origin,
            review: pt.review,
          }))}
          emptyLabel="No page types ready yet."
        />
        <SummaryList
          title="Recommended Interactions"
          items={groups.recommendedEvents.map((e) => ({
            id: e.id,
            label: e.kind === 'interaction' ? e.interactionName ?? 'interaction' : e.customName ?? 'event',
            meta: e.triggerHint,
            origin: e.origin,
            review: e.review,
          }))}
          emptyLabel="No interactions ready yet."
        />
        <SummaryList
          title="Recommended User Attributes"
          items={groups.recommendedAttrs.map((a) => ({
            id: a.id,
            label: a.name,
            meta: a.category + ' · ' + a.proposedSource,
            origin: a.origin,
            review: a.review,
          }))}
          emptyLabel="No attributes ready yet."
        />
        <SummaryList
          title="Pending Review"
          items={groups.pending.map((it) => ({
            id: it.id,
            label: it.label,
            meta: it.meta,
            origin: it.origin,
            review: it.review,
          }))}
          emptyLabel="Nothing pending."
        />
        <SummaryList
          title="Requirement-Driven Candidates"
          items={groups.requested.map((it) => ({
            id: it.id,
            label: it.label,
            meta: it.meta,
            origin: it.origin,
            review: it.review,
          }))}
          emptyLabel="No requirement-driven items."
        />
        <SummaryList
          title="Exclusions & Sensitive Items"
          items={groups.exclusions.map((a) => ({
            id: a.id,
            label: a.name,
            meta: a.consultantAction,
            origin: a.origin,
            review: a.review,
          }))}
          emptyLabel="No exclusions."
        />
      </div>

      {groups.notes.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-800">
          <h3 className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
            Consultant Notes
          </h3>
          <ul className="text-xs text-gray-400 list-disc pl-4 space-y-0.5">
            {groups.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

interface SummaryItem {
  id: string
  label: string
  meta?: string
  origin?: PageTypeDraft['origin']
  review?: PageTypeDraft['review']
}

function SummaryList({
  title,
  items,
  emptyLabel,
}: {
  title: string
  items: SummaryItem[]
  emptyLabel: string
}) {
  return (
    <div className="bg-gray-950/60 border border-gray-800 rounded p-3">
      <div className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">{title}</div>
      {items.length === 0 ? (
        <p className="text-xs text-gray-600">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li key={it.id} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-gray-100 font-medium truncate">{it.label}</span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <OriginBadge origin={it.origin} />
                  <ReviewBadge review={it.review} />
                </div>
              </div>
              {it.meta && <div className="text-gray-600 truncate">{it.meta}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

type FlatItem = {
  id: string
  label: string
  meta?: string
  origin?: PageTypeDraft['origin']
  review?: PageTypeDraft['review']
}

function groupForSummary(analysis: AnalysisResult): {
  recommendedPts: PageTypeDraft[]
  recommendedEvents: EventDraft[]
  recommendedAttrs: AttributeCandidate[]
  pending: FlatItem[]
  requested: FlatItem[]
  exclusions: AttributeCandidate[]
  notes: string[]
} {
  const isRecommended = (r?: { state?: string }, origin?: { type?: string }) =>
    r?.state === 'confirmed' ||
    (origin?.type === 'observed' && r?.state !== 'rejected' && r?.state !== 'pending')
  const isPending = (r?: { state?: string }) => (r?.state ?? 'pending') === 'pending'
  const isRequested = (origin?: { type?: string }) => origin?.type === 'requirement-driven'

  const recommendedPts = analysis.pageTypes.filter(
    (pt) => isRecommended(pt.review, pt.origin) && pt.review?.state !== 'rejected',
  )
  const recommendedEvents = analysis.events.filter(
    (e) => isRecommended(e.review, e.origin) && e.review?.state !== 'rejected',
  )
  const recommendedAttrs = analysis.attributes.filter(
    (a) =>
      a.status !== 'excluded' &&
      isRecommended(a.review, a.origin) &&
      a.review?.state !== 'rejected',
  )

  const pending: FlatItem[] = []
  for (const pt of analysis.pageTypes) {
    if (isPending(pt.review) && !isRequested(pt.origin)) {
      pending.push({
        id: pt.id,
        label: pt.name,
        meta: pt.interactionName,
        origin: pt.origin,
        review: pt.review,
      })
    }
  }
  for (const e of analysis.events) {
    if (isPending(e.review) && !isRequested(e.origin)) {
      pending.push({
        id: e.id,
        label:
          e.kind === 'interaction'
            ? e.interactionName ?? 'interaction'
            : e.customName ?? 'event',
        meta: e.triggerHint,
        origin: e.origin,
        review: e.review,
      })
    }
  }
  for (const a of analysis.attributes) {
    if (a.status === 'excluded') continue
    if (isPending(a.review) && !isRequested(a.origin)) {
      pending.push({
        id: a.id,
        label: a.name,
        meta: a.category + ' · ' + a.proposedSource,
        origin: a.origin,
        review: a.review,
      })
    }
  }

  const requested: FlatItem[] = []
  for (const pt of analysis.pageTypes) {
    if (isRequested(pt.origin) && pt.review?.state !== 'confirmed') {
      requested.push({
        id: pt.id,
        label: pt.name,
        meta: pt.interactionName,
        origin: pt.origin,
        review: pt.review,
      })
    }
  }
  for (const e of analysis.events) {
    if (isRequested(e.origin) && e.review?.state !== 'confirmed') {
      requested.push({
        id: e.id,
        label:
          e.kind === 'interaction'
            ? e.interactionName ?? 'interaction'
            : e.customName ?? 'event',
        meta: e.triggerHint,
        origin: e.origin,
        review: e.review,
      })
    }
  }
  for (const a of analysis.attributes) {
    if (a.status === 'excluded') continue
    if (isRequested(a.origin) && a.review?.state !== 'confirmed') {
      requested.push({
        id: a.id,
        label: a.name,
        meta: a.category + ' · ' + a.proposedSource,
        origin: a.origin,
        review: a.review,
      })
    }
  }

  const exclusions = analysis.attributes.filter(
    (a) => a.status === 'excluded' || a.review?.state === 'rejected',
  )

  return {
    recommendedPts,
    recommendedEvents,
    recommendedAttrs,
    pending,
    requested,
    exclusions,
    notes: analysis.assumptions,
  }
}

function SitemapCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <Card size="sm" className="bg-gray-900 border-gray-800 px-0 py-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
        <span className="text-xs text-gray-500 uppercase tracking-wide">sitemap.js</span>
        <Button
          size="xs"
          variant="outline"
          onClick={copy}
          className="border-gray-700 text-gray-300 hover:bg-gray-800"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy Code'}
        </Button>
      </div>
      <pre className="text-xs text-gray-200 font-mono p-4 overflow-auto max-h-[70vh]">
        <code>{code}</code>
      </pre>
    </Card>
  )
}

function ExportButtons({
  analysis,
  code,
}: {
  analysis: AnalysisResult
  code: string
}) {
  const domain = safeDomain(analysis.site.url)
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-gray-600 uppercase tracking-wide mr-1">Export</span>
      <Button
        size="xs"
        variant="outline"
        onClick={() => downloadJSON(domain + '-sitemap.json', sitemapJSONFromAnalysis(analysis))}
        className="border-gray-700 text-gray-300 hover:bg-gray-800"
        title="Download structured JSON config"
      >
        <FileJson className="w-3 h-3" />
        JSON
      </Button>
      <Button
        size="xs"
        variant="outline"
        onClick={() => downloadMarkdown(domain + '-design.md', designDocFromAnalysis(analysis))}
        className="border-gray-700 text-gray-300 hover:bg-gray-800"
        title="Download client-facing design document"
      >
        <FileText className="w-3 h-3" />
        Design Doc
      </Button>
      <Button
        size="xs"
        variant="outline"
        onClick={() => downloadJS(domain + '-sitemap.js', code)}
        className="border-gray-700 text-gray-300 hover:bg-gray-800"
        title="Download sitemap.js"
      >
        <FileCode className="w-3 h-3" />
        JS
      </Button>
    </div>
  )
}

function safeDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return 'site'
  }
}

function NotesTab() {
  const analysis = useAnalysisStore().state.analysis!
  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
      <Card size="sm" className="bg-gray-900 border-gray-800 px-5">
        <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
          Assumptions &amp; Limitations
        </h2>
        <ul className="space-y-1.5 text-xs text-gray-400 list-disc pl-4">
          {analysis.assumptions.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </Card>
      <Card size="sm" className="bg-gray-900 border-gray-800 px-5">
        <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
          Manual selectors to verify
        </h2>
        <ul className="space-y-1.5 text-xs text-gray-400 list-disc pl-4">
          {analysis.events.map((e) => (
            <li key={e.id}>
              {e.kind === 'interaction' ? e.interactionName : e.customName} — {e.triggerHint}
            </li>
          ))}
        </ul>
      </Card>
      <Card size="sm" className="bg-gray-900 border-gray-800 px-5 lg:col-span-2">
        <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium">
          User Attribute Candidates
        </h2>
        {analysis.attributes.length === 0 ? (
          <p className="text-xs text-gray-500">
            No attribute candidates detected. Targeting will rely on page type alone until attributes are added manually.
          </p>
        ) : (
          <ul className="space-y-1.5 text-xs text-gray-400 list-disc pl-4">
            {analysis.attributes.map((a) => (
              <li key={a.id}>
                <span className="text-gray-200 font-medium">{a.name}</span>{' '}
                <span className="text-gray-500">({a.category} · {a.status === 'excluded' ? 'excluded' : a.confidence})</span>
                {' — '}
                {a.proposedSource}. {a.consultantAction}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
