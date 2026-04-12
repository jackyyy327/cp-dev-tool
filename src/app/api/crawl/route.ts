import { NextRequest, NextResponse } from 'next/server'
import { crawlWebsite } from '@/lib/crawler'

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Validate URL
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`)
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
    }

    const result = await crawlWebsite(parsedUrl.toString())
    return NextResponse.json(result)
  } catch (error) {
    console.error('Crawl error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Crawl failed' },
      { status: 500 }
    )
  }
}
