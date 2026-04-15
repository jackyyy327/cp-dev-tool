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
      // Not asserting product classification — brand sites are intentionally
      // conservative and may downgrade to needsConfirmation.
      maxUnmapped: 2,
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
  return { lines, pass, fail }
}

run().catch((e) => {
  console.error(e)
  process.exit(2)
})
