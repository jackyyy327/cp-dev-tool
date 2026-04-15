import { NextRequest, NextResponse } from 'next/server'
import { buildAnalysis } from '@/lib/server/build-analysis'
import { FetchError } from '@/lib/server/fetch-site'
import type { RequirementInput } from '@/types/analysis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: { siteUrl?: string; requirement?: RequirementInput } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body', kind: 'RequirementParseFailure' }, { status: 400 })
  }
  if (!body.siteUrl || !body.requirement?.rawText) {
    return NextResponse.json(
      { error: 'siteUrl and requirement.rawText are required', kind: 'RequirementParseFailure' },
      { status: 400 },
    )
  }
  const t0 = Date.now()
  try {
    const analysis = await buildAnalysis(body.siteUrl, body.requirement)
    console.log(
      '[analyze] ok',
      JSON.stringify({
        url: body.siteUrl,
        ms: Date.now() - t0,
        pageTypes: analysis.pageTypes.length,
        samples: analysis.site.sampledPages.length,
        mapped: analysis.requirementMappings.filter((r) => r.status === 'mapped').length,
        unmapped: analysis.requirementMappings.filter((r) => r.status === 'unmapped').length,
        needsConfirm: analysis.requirementMappings.filter((r) => r.status === 'needsConfirmation').length,
      }),
    )
    return NextResponse.json(analysis)
  } catch (err) {
    if (err instanceof FetchError) {
      console.error('[analyze] fail', err.kind, err.message)
      return NextResponse.json({ error: err.message, kind: err.kind, status: err.status }, { status: 502 })
    }
    const message = err instanceof Error ? err.message : 'Unknown analysis error'
    console.error('[analyze] fail unknown', message)
    return NextResponse.json({ error: message, kind: 'UrlFetchFailure' }, { status: 500 })
  }
}
