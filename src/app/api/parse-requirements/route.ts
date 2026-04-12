import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export interface CustomPageTypeEntry {
  id: string
  name: string
  action: string
  rule: string        // natural language description
  sampleUrls: string
}

export async function POST(req: NextRequest) {
  try {
    const { text, siteUrl }: { text: string; siteUrl?: string } = await req.json()

    if (!text?.trim()) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }

    const message = await client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `You are an expert at reading MCP (Salesforce Marketing Cloud Personalization) project requirements.

Extract page type definitions from the following requirements document and return them as a JSON array.

${siteUrl ? `Site URL: ${siteUrl}` : ''}

Requirements text:
"""
${text}
"""

Return a JSON array where each item has exactly these fields:
- name: the page type name (e.g. "BG_Category_Hair_and_Beauty_Top")
- action: the action name (e.g. "BG_Category_Hair_and_Beauty_Top_View"). If not specified, append "_View" to the name.
- rule: a clear English description of the URL matching rule (e.g. "URLs matching /c/2HA followed by up to 3 alphanumeric characters, and all sub-pages beneath them")
- sampleUrls: comma-separated sample URLs if mentioned, otherwise empty string

Return ONLY a valid JSON array, no explanation or markdown.`
      }]
    })

    const content = message.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type')

    // Strip markdown code fences if present
    const raw = content.text.replace(/```(?:json)?\n?/g, '').trim()
    const parsed = JSON.parse(raw)

    // Add generated IDs
    const entries: CustomPageTypeEntry[] = parsed.map((item: Omit<CustomPageTypeEntry, 'id'>) => ({
      id: crypto.randomUUID(),
      name: item.name || '',
      action: item.action || '',
      rule: item.rule || '',
      sampleUrls: item.sampleUrls || '',
    }))

    // Validation hints
    const emptyRules = entries.filter(e => !e.rule.trim()).length
    const emptyUrls = entries.filter(e => !e.sampleUrls.trim()).length

    return NextResponse.json({
      entries,
      validation: {
        total: entries.length,
        emptyRules,
        emptyUrls,
      },
    })
  } catch (error) {
    console.error('Parse requirements error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Parse failed' },
      { status: 500 }
    )
  }
}
