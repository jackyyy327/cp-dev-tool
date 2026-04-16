import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Pre-submit polish: user types rough notes, LLM rewrites them into
// consultant-grade English requirement bullets that the existing regex
// parseRequirements layer can bind cleanly. The LLM only rewrites — it does
// not invent pages or events that the user did not mention.

const SYSTEM_PROMPT = `You are helping a Salesforce Marketing Cloud Personalization consultant draft tracking requirements for a Sitemap implementation.

You will receive rough notes (possibly in Chinese, Japanese, or mixed-language) describing what the consultant wants tracked on a website, plus optional constraints.

Your job is to rewrite them into clean, structured consultant-style English that the downstream requirement parser can bind to page types, catalog objects, events, and user attributes.

Rules:
- Output English only, regardless of input language.
- Preserve the consultant's intent exactly. Do NOT invent page types, events, or attributes the user did not mention.
- One requirement per bullet line, starting with an imperative verb ("Track", "Capture", "Detect", "Respect").
- Use vocabulary the parser recognizes: product detail, category, search, cart, add-to-cart, purchase, article, login status, language, market, customer tier, consent, etc.
- Keep exclusions explicit: "Do not create ..." on its own line.
- Keep constraints separate — do not merge them into the requirements.
- Output strict JSON: {"requirements": "...", "constraints": "..."}. No markdown fences, no commentary.
- If constraints are empty, return "" for that field.`

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not set in the server environment.' },
      { status: 500 },
    )
  }

  let body: { requirements?: string; constraints?: string; siteUrl?: string } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { requirements = '', constraints = '', siteUrl = '' } = body
  if (!requirements.trim()) {
    return NextResponse.json({ error: 'requirements is required' }, { status: 400 })
  }

  const userPayload = [
    siteUrl ? 'Site: ' + siteUrl : null,
    'Rough requirements:\n' + requirements.trim(),
    constraints.trim() ? 'Rough constraints:\n' + constraints.trim() : null,
  ]
    .filter(Boolean)
    .join('\n\n')

  const t0 = Date.now()
  let res
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_POLISH_MODEL || 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPayload },
        ],
      }),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'network error'
    return NextResponse.json({ error: 'OpenAI request failed: ' + msg }, { status: 502 })
  }

  if (!res.ok) {
    const text = await res.text()
    console.error('[polish] openai error', { status: res.status, body: text })
    return NextResponse.json(
      { error: 'OpenAI returned ' + res.status, detail: text.slice(0, 400) },
      { status: 502 },
    )
  }

  const rawBody = await res.text()
  let json: { choices?: Array<{ message?: { content?: string } }> }
  try {
    json = JSON.parse(rawBody)
  } catch {
    console.error('[polish] openai returned non-JSON envelope', { body: rawBody })
    return NextResponse.json(
      { error: 'OpenAI response envelope was not valid JSON', raw: rawBody.slice(0, 400) },
      { status: 502 },
    )
  }
  const content = json.choices?.[0]?.message?.content ?? ''
  let parsed: { requirements?: string; constraints?: string } = {}
  try {
    parsed = JSON.parse(content)
  } catch {
    console.error('[polish] openai content was not valid JSON', { content })
    return NextResponse.json(
      { error: 'OpenAI response was not valid JSON', raw: content.slice(0, 400) },
      { status: 502 },
    )
  }
  console.log(
    '[polish] ok',
    JSON.stringify({ ms: Date.now() - t0, inLen: requirements.length, outLen: (parsed.requirements || '').length }),
  )
  return NextResponse.json({
    requirements: parsed.requirements ?? '',
    constraints: parsed.constraints ?? '',
  })
}
