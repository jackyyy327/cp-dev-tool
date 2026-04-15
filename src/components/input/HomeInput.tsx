'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useAnalysisStore } from '@/lib/analysis-store'
import { Sparkles, Wand2, Loader2 } from 'lucide-react'

export function HomeInput() {
  const { actions } = useAnalysisStore()
  const [url, setUrl] = useState('')
  const [requirements, setRequirements] = useState('')
  const [constraints, setConstraints] = useState('')
  const [error, setError] = useState('')
  const [polishing, setPolishing] = useState(false)
  const [polishNote, setPolishNote] = useState('')

  async function handlePolish() {
    if (!requirements.trim()) {
      setError('Write some rough requirements first — the AI will clean them up.')
      return
    }
    setError('')
    setPolishNote('')
    setPolishing(true)
    try {
      const res = await fetch('/api/polish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requirements,
          constraints,
          siteUrl: url.trim() || undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error || 'Polish failed')
        return
      }
      if (body.requirements) setRequirements(body.requirements)
      if (typeof body.constraints === 'string') setConstraints(body.constraints)
      setPolishNote('Rewritten by AI — review before running analysis.')
    } catch (e) {
      setError('Polish request failed: ' + (e instanceof Error ? e.message : 'unknown'))
    } finally {
      setPolishing(false)
    }
  }

  function handleStart() {
    if (!url.trim()) {
      setError('Please enter a target website URL.')
      return
    }
    try {
      new URL(url.trim())
    } catch {
      setError('Enter a valid URL including https://')
      return
    }
    if (!requirements.trim()) {
      setError('Please describe the tracking requirements.')
      return
    }
    setError('')
    actions.startAnalysis(url.trim(), {
      rawText: requirements.trim(),
      constraints: constraints.trim() || undefined,
    })
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 bg-gray-900/50 sticky top-0 z-50">
        <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-sm tracking-tight">
            Sitemap Consultant Workbench
          </span>
          <span className="text-gray-600 text-xs">for Salesforce Personalization</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-16">
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-3">
            Turn website requirements into a structured sitemap design
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            Input a target URL and your tracking requirements. The workbench helps you discover
            candidate Page Types, confirm catalog objects and interactions, and produces an
            editable Sitemap implementation draft.
          </p>
        </div>

        <div className="space-y-5">
          <Field label="Target Website URL">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.example-shop.com"
              className="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </Field>

          <Field
            label="Tracking Requirements"
            action={
              <button
                type="button"
                onClick={handlePolish}
                disabled={polishing}
                className="text-[11px] font-medium text-violet-300 hover:text-violet-200 disabled:text-gray-600 flex items-center gap-1"
              >
                {polishing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Wand2 className="w-3 h-3" />
                )}
                {polishing ? 'Polishing…' : 'Polish with AI'}
              </button>
            }
          >
            <Textarea
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              placeholder="Capture product ID, name, price, and add-to-cart clicks on product detail pages. (Rough notes in any language are fine — click Polish with AI to rewrite.)"
              className="min-h-28 bg-gray-900 border-gray-800 text-white placeholder:text-gray-600"
            />
            {polishNote && (
              <p className="text-[11px] text-violet-300 mt-1">{polishNote}</p>
            )}
          </Field>

          <Field label="Additional Constraints (Optional)">
            <Textarea
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              placeholder="e.g. No third-party tag manager; must work without a GTM container."
              className="min-h-20 bg-gray-900 border-gray-800 text-white placeholder:text-gray-600"
            />
          </Field>

          {error && (
            <div className="text-sm text-red-400 border border-red-900/60 bg-red-950/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="pt-2">
            <Button
              onClick={handleStart}
              size="lg"
              className="bg-blue-600 hover:bg-blue-500 text-white border-blue-600"
            >
              Start Analysis
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}

function Field({
  label,
  children,
  action,
}: {
  label: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-300 uppercase tracking-wide">{label}</span>
        {action}
      </span>
      {children}
    </label>
  )
}
