import { NextRequest, NextResponse } from 'next/server'
import { generateSitemapCode } from '@/lib/sitemap-generator'
import type { CrawlResult } from '@/types/sitemap'
import type { CustomPageTypeEntry } from '@/app/api/parse-requirements/route'
import type { GtmParseResult } from '@/lib/gtm-parser'

export async function POST(req: NextRequest) {
  try {
    const {
      crawlResult,
      customNotes,
      customPageTypes,
      gtmData,
    }: {
      crawlResult: CrawlResult
      customNotes?: string
      customPageTypes?: CustomPageTypeEntry[]
      gtmData?: GtmParseResult
    } = await req.json()

    if (!crawlResult) {
      return NextResponse.json({ error: 'crawlResult is required' }, { status: 400 })
    }

    const code = await generateSitemapCode(crawlResult, customNotes, customPageTypes, gtmData)
    return NextResponse.json({ code })
  } catch (error) {
    console.error('Generate error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
      { status: 500 }
    )
  }
}
