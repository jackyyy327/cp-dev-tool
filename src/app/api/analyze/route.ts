import { NextRequest, NextResponse } from 'next/server'
import { buildAnalysis } from '@/lib/server/build-analysis'
import type { RequirementInput } from '@/types/analysis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let body: { siteUrl?: string; requirement?: RequirementInput } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.siteUrl || !body.requirement?.rawText) {
    return NextResponse.json(
      { error: 'siteUrl and requirement.rawText are required' },
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
      }),
    )
    return NextResponse.json(analysis)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown analysis error'
    console.error('[analyze] fail', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
