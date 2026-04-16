#!/usr/bin/env node
// Fixed regression matrix for the Sitemap Consultant Workbench.
// Usage:
//   1. Start the dev server:  pnpm dev
//   2. In another shell:      node scripts/regression.mjs
//      (or `node scripts/regression.mjs --base http://localhost:3000`)
//
// Each case declares a site + a consultant-style requirement, then a set of
// expectations. The harness hits /api/analyze and prints a pass/fail line per
// expectation — it does NOT mutate anything. Use it before/after refactors to
// detect regressions on:
//   • standard ecommerce (Shopify-style)
//   • pure content
//   • brand site with weak structure
//   • multilingual / Japanese
//   • failure mode (invalid domain)

const BASE = (() => {
  const i = process.argv.indexOf('--base')
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]
  return process.env.REGRESSION_BASE || 'http://localhost:3000'
})()

const CASES = [
  {
    name: 'allbirds · standard ecommerce',
    site: 'https://www.allbirds.com/',
    requirement:
      'Track product detail views, category impressions, add-to-cart clicks and purchase events. Capture login status and visitor language.',
    expect: {
      minPageTypes: 4,
      mustHaveClasses: ['product', 'category'],
      mustHaveInteractions: ['ViewCatalogObject', 'AddToCart'],
      mustHaveAttributes: ['language', 'loginStatus'],
      maxUnmapped: 1,
      // Acceptance-level (P4 trust calibration):
      allHaveOrigin: true,
      allHaveReview: true,
      minObservedPageTypes: 1,
      // Any attribute the requirement asked for that isn't also observed should
      // surface as requirement-driven + pending. Observed wins when both apply.
      minRequirementDrivenAttributes: 0,
      summaryIntegrity: true,
    },
  },
  {
    name: 'techcrunch · pure content',
    site: 'https://techcrunch.com/',
    requirement:
      'Track article views and author pages. Do not create any commerce objects.',
    expect: {
      minPageTypes: 2,
      mustHaveClasses: ['content'],
      forbidInteractions: ['AddToCart', 'Purchase'],
      maxUnmapped: 1,
      allHaveOrigin: true,
      allHaveReview: true,
      // Non-commerce safety: no observed commerce recommendations
      forbidObservedInteractions: ['AddToCart', 'Purchase', 'ViewCatalogObject'],
      summaryIntegrity: true,
    },
  },
  {
    name: 'patagonia.jp · multilingual + brand',
    site: 'https://www.patagonia.jp/home/',
    requirement:
      'Track product detail views, add-to-cart, and the visitor language / market. Respect the cookie consent banner.',
    expect: {
      minPageTypes: 2,
      mustHaveAttributes: ['language'],
      maxUnmapped: 2,
      allHaveOrigin: true,
      allHaveReview: true,
      // Reviewability: weak-structure brand sites should surface pending review items
      minPendingPageTypes: 1,
      summaryIntegrity: true,
    },
  },
  {
    name: 'invalid domain · failure mode',
    site: 'https://definitely-not-a-real-site-xyz-12345.invalid/',
    requirement: 'Track product views',
    expectFailure: 'UrlFetchFailure',
  },
]

async function run() {
  let pass = 0
  let fail = 0
  for (const c of CASES) {
    process.stdout.write('\n▸ ' + c.name + '\n  ' + c.site + '\n')
    let res
    try {
      res = await fetch(BASE + '/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ siteUrl: c.site, requirement: { rawText: c.requirement } }),
      })
    } catch (e) {
      console.log('  ✗ network error — is the dev server running on ' + BASE + '?')
      console.log('    ' + e.message)
      fail++
      continue
    }
    const body = await res.json()

    if (c.expectFailure) {
      if (!res.ok && body.kind === c.expectFailure) {
        console.log('  ✓ expected failure kind ' + c.expectFailure)
        pass++
      } else {
        console.log('  ✗ expected failure kind ' + c.expectFailure + ' — got ' + (body.kind || res.status))
        fail++
      }
      continue
    }

    if (!res.ok) {
      console.log('  ✗ request failed: ' + (body.error || res.status))
      fail++
      continue
    }
    const r = check(body, c.expect)
    for (const line of r.lines) console.log('  ' + line)
    pass += r.pass
    fail += r.fail
    const attrs = (body.attributes || []).map((a) => a.name + ':' + a.confidence).join(', ')
    console.log('    attributes: ' + (attrs || '(none)'))
    console.log(
      '    page types: ' +
        body.pageTypes.map((p) => p.name + '[' + p.confidence + ']').join(', '),
    )
  }
  console.log('\n' + pass + ' pass / ' + fail + ' fail')
  process.exit(fail === 0 ? 0 : 1)
}

function check(a, ex) {
  const lines = []
  let pass = 0
  let fail = 0
  const ok = (cond, msg) => {
    if (cond) {
      lines.push('✓ ' + msg)
      pass++
    } else {
      lines.push('✗ ' + msg)
      fail++
    }
  }
  const classOf = (pt) => {
    const n = pt.name.toLowerCase()
    if (/product/.test(n)) return 'product'
    if (/category|collection/.test(n)) return 'category'
    if (/search/.test(n)) return 'search'
    if (/cart|basket/.test(n)) return 'cart'
    if (/checkout|order/.test(n)) return 'checkout'
    if (/article|story|blog|content/.test(n)) return 'content'
    if (n === 'home') return 'home'
    return 'other'
  }
  const classes = new Set(a.pageTypes.map(classOf))
  const interactions = new Set(
    [
      ...a.pageTypes.map((p) => p.interactionName).filter(Boolean),
      ...a.events.map((e) => e.interactionName).filter(Boolean),
    ],
  )
  const attrNames = new Set((a.attributes || []).map((x) => x.name))

  if (ex.minPageTypes != null) ok(a.pageTypes.length >= ex.minPageTypes, '≥ ' + ex.minPageTypes + ' page types (' + a.pageTypes.length + ')')
  for (const cls of ex.mustHaveClasses || []) ok(classes.has(cls), 'has ' + cls + ' class')
  for (const int of ex.mustHaveInteractions || []) ok(interactions.has(int), 'has interaction ' + int)
  for (const int of ex.forbidInteractions || []) ok(!interactions.has(int), 'does not have ' + int)
  for (const n of ex.mustHaveAttributes || []) ok(attrNames.has(n), 'attribute ' + n + ' detected')
  if (ex.maxUnmapped != null) {
    const unmapped = a.requirementMappings.filter((r) => r.status === 'unmapped').length
    ok(unmapped <= ex.maxUnmapped, '≤ ' + ex.maxUnmapped + ' unmapped requirement(s) (got ' + unmapped + ')')
  }

  // --- Acceptance expectations (P4) ---
  const pts = a.pageTypes || []
  const evs = a.events || []
  const atrs = a.attributes || []

  if (ex.allHaveOrigin) {
    const missing = [
      ...pts.filter((p) => !p.origin).map((p) => 'pt:' + p.name),
      ...evs.filter((e) => !e.origin).map((e) => 'ev:' + (e.interactionName || e.customName || e.id)),
      ...atrs.filter((x) => !x.origin).map((x) => 'attr:' + x.name),
    ]
    ok(missing.length === 0, 'all items carry an origin tag' + (missing.length ? ' (missing: ' + missing.slice(0, 3).join(', ') + ')' : ''))
  }
  if (ex.allHaveReview) {
    const missing =
      pts.filter((p) => !p.review).length +
      evs.filter((e) => !e.review).length +
      atrs.filter((x) => !x.review).length
    ok(missing === 0, 'all items carry a review state (' + missing + ' missing)')
  }
  if (ex.minObservedPageTypes != null) {
    const n = pts.filter((p) => p.origin && p.origin.type === 'observed').length
    ok(n >= ex.minObservedPageTypes, '≥ ' + ex.minObservedPageTypes + ' observed page type(s) (got ' + n + ')')
  }
  if (ex.minPendingPageTypes != null) {
    const n = pts.filter((p) => (p.review && p.review.state === 'pending') || !p.review).length
    ok(n >= ex.minPendingPageTypes, '≥ ' + ex.minPendingPageTypes + ' pending page type(s) for consultant review (got ' + n + ')')
  }
  if (ex.minRequirementDrivenAttributes != null) {
    const n = atrs.filter((x) => x.origin && x.origin.type === 'requirement-driven').length
    ok(n >= ex.minRequirementDrivenAttributes, '≥ ' + ex.minRequirementDrivenAttributes + ' requirement-driven attribute(s) (got ' + n + ')')
  }
  for (const int of ex.forbidObservedInteractions || []) {
    const observedCommerce =
      pts.some((p) => p.interactionName === int && p.origin && p.origin.type === 'observed') ||
      evs.some((e) => e.interactionName === int && e.origin && e.origin.type === 'observed')
    ok(!observedCommerce, 'no observed ' + int + ' on non-commerce site')
  }
  if (ex.summaryIntegrity) {
    // Design Summary is derived from structured state; verify the structured
    // state itself is self-consistent enough to derive a summary from.
    const confirmedOrObserved = pts.filter(
      (p) => (p.review && p.review.state === 'confirmed') || (p.origin && p.origin.type === 'observed'),
    ).length
    const pending = pts.filter((p) => !p.review || p.review.state === 'pending').length
    const requested = atrs.filter((x) => x.origin && x.origin.type === 'requirement-driven').length
    const total = pts.length + evs.length + atrs.length
    ok(
      total > 0 && (confirmedOrObserved + pending + requested) >= 1,
      'summary-derivable groups present (recommended=' +
        confirmedOrObserved +
        ', pending=' +
        pending +
        ', requested=' +
        requested +
        ')',
    )
  }
  return { lines, pass, fail }
}

run().catch((e) => {
  console.error(e)
  process.exit(2)
})
