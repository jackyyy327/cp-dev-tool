'use client'

import { useEffect, useRef, useState } from 'react'
import { useAnalysisStore } from '@/lib/analysis-store'
import type { AnalysisResult } from '@/types/analysis'
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
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

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
          throw new Error(body.error || 'Analysis failed with HTTP ' + res.status)
        }
        return (await res.json()) as AnalysisResult
      })
      .then((analysis) => {
        setActiveStep(STEPS.length)
        // Brief pause so the user sees the final step tick over before route change.
        setTimeout(() => actions.finishLoading(analysis), 300)
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return
        actions.failLoading(err.message || 'Unknown analysis error')
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
        <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center">
          <span className="font-semibold text-sm tracking-tight">Sitemap Consultant Workbench</span>
          <span className="ml-3 text-gray-600 text-xs">Analyzing {state.siteUrlInput}</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-2xl font-bold mb-1">Analyzing your site</h1>
        <p className="text-gray-400 text-sm mb-8">
          Converting natural-language requirements into a structured sitemap design.
        </p>

        {state.error ? (
          <ErrorPanel error={state.error} onBack={actions.backToInput} />
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

function ErrorPanel({ error, onBack }: { error: string; onBack: () => void }) {
  return (
    <div className="bg-red-950/20 border border-red-900 rounded-lg p-6">
      <div className="flex items-start gap-3 mb-4">
        <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-red-200 mb-1">Analysis failed</h2>
          <p className="text-sm text-red-300/80 break-words">{error}</p>
        </div>
      </div>
      <div className="text-xs text-red-300/60 mb-4">
        The site could not be crawled. Check that the URL is reachable from this machine and
        returns HTML (not a JS-only SPA shell or a login wall), then try again.
      </div>
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
