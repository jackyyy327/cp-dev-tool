'use client'

import { useMemo, useState } from 'react'
import { useAnalysisStore } from '@/lib/analysis-store'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { codeFromAnalysis } from '@/lib/code-from-analysis'
import { ArrowLeft, Copy, Check } from 'lucide-react'

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
              <th className="text-left font-normal pb-1">Status</th>
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
                  <td className="py-2 capitalize text-gray-400">{pt.status}</td>
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
                <div className="font-mono text-gray-300">
                  {e.kind === 'interaction'
                    ? `SalesforceInteractions.${e.interactionName}`
                    : e.customName}
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
