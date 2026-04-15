'use client'

import { useEffect, useState } from 'react'
import { useAnalysisStore } from '@/lib/analysis-store'
import type { AnalysisResult, FailureKind } from '@/types/analysis'
import { Button } from '@/components/ui/button'
import { Check, Loader2, CircleDashed, AlertTriangle } from 'lucide-react'

const STEPS = [
  {
    id: 'scan',
    title: 'Scanning site structure',
    detail: 'Fetching sampled pages and detecting routing conventions.',
  },
  {
    id: 'classify',
    title: 'Identifying candidate page types',
    detail: 'Clustering URL patterns and page signals into Page Type candidates.',
  },
  {
    id: 'map',
    title: 'Mapping requirements to page types and events',
    detail: 'Linking natural-language tracking requirements to catalog objects and interactions.',
  },
  {
    id: 'draft',
    title: 'Preparing implementation draft',
    detail: 'Drafting SalesforceInteractions sitemap skeleton from the confirmed structure.',
  },
] as const

export function AnalysisLoading() {
  const { state, actions } = useAnalysisStore()
  const [activeStep, setActiveStep] = useState(0)

  useEffect(() => {
    const stepTimers: ReturnType<typeof setTimeout>[] = []
    // Visual progression: step forward at a steady pace, capped at the last "in-progress" step.
    stepTimers.push(setTimeout(() => setActiveStep(1), 600))
    stepTimers.push(setTimeout(() => setActiveStep(2), 1600))
    stepTimers.push(setTimeout(() => setActiveStep(3), 3200))

    const controller = new AbortController()
    fetch('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        siteUrl: state.siteUrlInput,
        requirement: state.requirementInput,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          const err = new Error(body.error || 'Analysis failed with HTTP ' + res.status) as Error & {
            kind?: FailureKind
          }
          err.kind = (body.kind as FailureKind) || 'UrlFetchFailure'
          throw err
        }
        return (await res.json()) as AnalysisResult
      })
      .then((analysis) => {
        setActiveStep(STEPS.length)
        setTimeout(() => actions.finishLoading(analysis), 300)
      })
      .catch((err: Error & { kind?: FailureKind }) => {
        if (err.name === 'AbortError') return
        actions.failLoading(err.message || 'Unknown analysis error', err.kind ?? 'UrlFetchFailure')
      })

    return () => {
      stepTimers.forEach(clearTimeout)
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 bg-gray-900/50">
        <div className="max-w-screen-xl mx-auto px-6 h-16 flex items-center">
          <span className="font-semibold text-xl tracking-tight">Salesforce Personalization Workbench</span>
          <span className="ml-3 text-gray-500 text-sm">By DentsuDigital</span>
          <span className="ml-4 text-gray-600 text-xs">Analyzing {state.siteUrlInput}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold mb-1">Analyzing your site</h1>
        <p className="text-gray-400 text-sm mb-8">
          Converting natural-language requirements into a structured sitemap design.
        </p>

        {state.error ? (
          <ErrorPanel error={state.error} kind={state.errorKind} onBack={actions.backToInput} />
        ) : (
          <>
            <section className="mb-8">
              <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-3">
                Progress Steps
              </h2>
              <ol className="space-y-3">
                {STEPS.map((step, i) => {
                  const status: 'done' | 'active' | 'pending' =
                    i < activeStep ? 'done' : i === activeStep ? 'active' : 'pending'
                  return (
                    <li
                      key={step.id}
                      className="flex items-start gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3"
                    >
                      <div className="mt-0.5">
                        {status === 'done' && <Check className="w-4 h-4 text-green-400" />}
                        {status === 'active' && (
                          <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                        )}
                        {status === 'pending' && (
                          <CircleDashed className="w-4 h-4 text-gray-600" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div
                          className={
                            status === 'pending'
                              ? 'text-sm text-gray-500'
                              : 'text-sm text-white font-medium'
                          }
                        >
                          {step.title}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">{step.detail}</div>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </section>

            <section className="mb-8">
              <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-3">
                Current Finding
              </h2>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-sm text-gray-400">
                {activeStep < STEPS.length
                  ? 'Running real site analysis — fetching sampled pages and classifying page types…'
                  : 'Analysis complete. Opening workbench…'}
              </div>
            </section>

            <section>
              <h2 className="text-xs uppercase tracking-wide text-gray-500 font-medium mb-3">
                Status Summary
              </h2>
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 text-sm text-gray-400">
                The workbench will open once the structured design is ready. You will be able to
                rename, merge, and confirm page types before generating the sitemap code.
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

const KIND_META: Record<FailureKind, { title: string; hint: string }> = {
  UrlFetchFailure: {
    title: 'URL fetch failed',
    hint: 'The entry URL could not be retrieved. Check that it is reachable from this machine, the protocol (https vs http), and that the path resolves to HTML.',
  },
  SamplingFailure: {
    title: 'Sampling failed',
    hint: 'The entry page loaded but no additional sample pages could be crawled. The site may be gating navigation behind JavaScript or rate-limiting requests.',
  },
  RequirementParseFailure: {
    title: 'Requirement parse failed',
    hint: 'The requirement text could not be interpreted. Rephrase using consultant-style sentences such as "Track product detail views" or "Capture add to cart".',
  },
  LowConfidenceAnalysis: {
    title: 'Low-confidence analysis',
    hint: 'Results were produced but should be treated as provisional. Review every page type before generating production code.',
  },
  BlockedByAntiBot: {
    title: 'Blocked by anti-bot / WAF',
    hint: 'The site returned 403/429 — it is rejecting the analyzer\'s request. Try a different entry URL, or run this against a staging environment.',
  },
  SpaLowVisibility: {
    title: 'SPA shell — low DOM visibility',
    hint: 'The page rendered as a client-side shell with little pre-rendered HTML. DOM signals are unreliable; expect mostly low-confidence output.',
  },
}

function ErrorPanel({
  error,
  kind,
  onBack,
}: {
  error: string
  kind: FailureKind | null
  onBack: () => void
}) {
  const meta = kind ? KIND_META[kind] : KIND_META.UrlFetchFailure
  return (
    <div className="bg-red-950/20 border border-red-900 rounded-lg p-6">
      <div className="flex items-start gap-3 mb-4">
        <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-wide text-red-400/70 mb-0.5">
            {kind ?? 'UrlFetchFailure'}
          </div>
          <h2 className="text-sm font-semibold text-red-200 mb-1">{meta.title}</h2>
          <p className="text-sm text-red-300/80 break-words">{error}</p>
        </div>
      </div>
      <div className="text-xs text-red-300/60 mb-4">{meta.hint}</div>
      <Button
        onClick={onBack}
        variant="outline"
        className="border-red-900 text-red-300 hover:bg-red-950/40"
      >
        Back to Input
      </Button>
    </div>
  )
}
