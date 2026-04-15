'use client'

import { useAnalysisStore } from '@/lib/analysis-store'
import { Button } from '@/components/ui/button'
import { PageTypeList } from './PageTypeList'
import { PageTypeEditor } from './PageTypeEditor'
import { EvidencePane } from './EvidencePane'
import { ArrowLeft, ArrowRight } from 'lucide-react'

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

      <main className="flex-1 max-w-screen-2xl w-full mx-auto px-6 py-6 grid gap-4 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_320px]">
        <PageTypeList />
        <PageTypeEditor pageType={selected} />
        <EvidencePane pageType={selected} />
      </main>
    </div>
  )
}
