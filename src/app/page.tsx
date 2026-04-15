'use client'

import { AnalysisStoreProvider, useAnalysisStore } from '@/lib/analysis-store'
import { HomeInput } from '@/components/input/HomeInput'
import { AnalysisLoading } from '@/components/analysis/AnalysisLoading'
import { Workbench } from '@/components/workbench/Workbench'
import { ResultPage } from '@/components/result/ResultPage'

export default function Page() {
  return (
    <AnalysisStoreProvider>
      <PhaseRouter />
    </AnalysisStoreProvider>
  )
}

function PhaseRouter() {
  const { state } = useAnalysisStore()
  switch (state.phase) {
    case 'input':
      return <HomeInput />
    case 'loading':
      return <AnalysisLoading />
    case 'workbench':
      return <Workbench />
    case 'result':
      return <ResultPage />
  }
}
