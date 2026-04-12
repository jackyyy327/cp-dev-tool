import { NextRequest, NextResponse } from 'next/server'
import type { SitemapEntry } from '@/types/sitemap'

// In-memory store for now (replace with Supabase later)
const store: SitemapEntry[] = []

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const platform = searchParams.get('platform')
  const siteType = searchParams.get('siteType')
  const industry = searchParams.get('industry')
  const q = searchParams.get('q')?.toLowerCase()

  let results = [...store]

  if (platform) results = results.filter(s => s.platform === platform)
  if (siteType) results = results.filter(s => s.siteType === siteType)
  if (industry) results = results.filter(s => s.industry === industry)
  if (q) {
    results = results.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.url.toLowerCase().includes(q) ||
      s.tags.some(t => t.toLowerCase().includes(q)) ||
      s.notes?.toLowerCase().includes(q)
    )
  }

  // Sort by most recently updated
  results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  return NextResponse.json(results)
}

export async function POST(req: NextRequest) {
  const body = await req.json()

  const entry: SitemapEntry = {
    id: crypto.randomUUID(),
    name: body.name,
    url: body.url,
    platform: body.platform,
    siteType: body.siteType,
    industry: body.industry || 'other',
    code: body.code,
    notes: body.notes,
    tags: body.tags || [],
    crawlResult: body.crawlResult,
    generationResult: body.generationResult,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  store.push(entry)
  return NextResponse.json(entry, { status: 201 })
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const index = store.findIndex(s => s.id === body.id)

  if (index === -1) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  store[index] = { ...store[index], ...body, updatedAt: new Date().toISOString() }
  return NextResponse.json(store[index])
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  const index = store.findIndex(s => s.id === id)
  if (index === -1) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  store.splice(index, 1)
  return NextResponse.json({ success: true })
}
