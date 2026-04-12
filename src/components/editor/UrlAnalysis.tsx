'use client'

import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import type { Platform } from '@/types/sitemap'
import { ChevronDown, ChevronUp, ExternalLink, Sparkles } from 'lucide-react'

interface UrlAnalysisProps {
  urls: string[]
  platform: Platform
}

interface UrlCategory {
  key: string
  label: string
  description: string
  color: string
  urls: string[]
}

const CATEGORY_META: Record<string, { label: string; description: string; color: string }> = {
  home:               { label: 'ホーム',             description: 'サイトのトップページ',                         color: 'bg-blue-900/40 text-blue-400 border-blue-800' },
  product_detail:     { label: '商品ページ',          description: '個別商品の詳細ページ — カタログ抽出の対象',      color: 'bg-green-900/40 text-green-400 border-green-800' },
  category:           { label: 'カテゴリ/一覧',       description: '商品カテゴリまたはコレクション一覧ページ',       color: 'bg-cyan-900/40 text-cyan-400 border-cyan-800' },
  cart:               { label: 'カート',             description: 'ショッピングカートページ',                     color: 'bg-orange-900/40 text-orange-400 border-orange-800' },
  checkout:           { label: 'チェックアウト',       description: '決済・注文手続きページ',                       color: 'bg-yellow-900/40 text-yellow-400 border-yellow-800' },
  order_confirmation: { label: '注文完了',            description: '注文確認・サンクスページ — コンバージョン計測',   color: 'bg-emerald-900/40 text-emerald-400 border-emerald-800' },
  search_results:     { label: '検索結果',            description: 'サイト内検索の結果ページ',                     color: 'bg-violet-900/40 text-violet-400 border-violet-800' },
  account:            { label: 'マイページ',          description: 'ユーザーアカウント・マイページ',                color: 'bg-indigo-900/40 text-indigo-400 border-indigo-800' },
  blog_detail:        { label: 'ブログ/記事',         description: 'ブログ記事やニュースの個別ページ',              color: 'bg-pink-900/40 text-pink-400 border-pink-800' },
  static:             { label: '静的ページ',          description: '会社情報・お問い合わせ・プライバシーポリシー等', color: 'bg-gray-800 text-gray-400 border-gray-700' },
  other:              { label: 'その他',             description: '自動分類できないページ — 手動確認を推奨',       color: 'bg-gray-800 text-gray-500 border-gray-700' },
}

function categorizeUrl(path: string, platform: Platform): string {
  const p = path.toLowerCase()

  if (p === '/' || p === '') return 'home'

  // Platform-specific patterns first
  if (platform === 'shopify') {
    if (p.startsWith('/products/')) return 'product_detail'
    if (p.startsWith('/collections/')) return 'category'
    if (p.startsWith('/cart')) return 'cart'
    if (p.startsWith('/blogs/')) return 'blog_detail'
    if (p.includes('/account')) return 'account'
    if (p.includes('/checkout')) return 'checkout'
  } else if (platform === 'hybris') {
    if (/\/p\/[^/]+$/.test(p)) return 'product_detail'
    if (/\/c\/[^/]+/.test(p)) return 'category'
    if (p.includes('/cart')) return 'cart'
    if (p.includes('/checkout')) return 'checkout'
    if (p.includes('/search')) return 'search_results'
    if (p.includes('/my-account') || p.includes('/account')) return 'account'
    if (/\/order-confirmation|\/order-detail/.test(p)) return 'order_confirmation'
  } else if (platform === 'magento') {
    if (p.includes('/catalog/product/view')) return 'product_detail'
    if (p.includes('/catalog/category/view') || p.includes('.html') && p.split('/').length <= 3) return 'category'
    if (p.includes('/checkout/cart')) return 'cart'
    if (p.includes('/checkout')) return 'checkout'
    if (p.includes('/customer/account')) return 'account'
    if (p.includes('/catalogsearch/result')) return 'search_results'
  }

  // Generic patterns
  if (/\/product[s]?\/[^/]+/.test(p) || /\/item[s]?\/[^/]+/.test(p)) return 'product_detail'
  if (/\/categor(y|ies)\//.test(p) || /\/collection[s]?\//.test(p)) return 'category'
  if (/\/cart/.test(p)) return 'cart'
  if (/\/checkout/.test(p)) return 'checkout'
  if (/\/order[s]?[/-]?(confirmation|complete|thank)/.test(p)) return 'order_confirmation'
  if (/\/search/.test(p) || p.includes('?q=')) return 'search_results'
  if (/\/account|\/my-|\/profile|\/dashboard/.test(p)) return 'account'
  if (/\/blog|\/article[s]?|\/news|\/post[s]?/.test(p)) return 'blog_detail'

  // Static pages
  if (/\/(about|company|contact|faq|help|privacy|terms|legal|shipping|returns|sitemap)/.test(p)) return 'static'

  return 'other'
}

export function UrlAnalysis({ urls, platform }: UrlAnalysisProps) {
  const [expanded, setExpanded] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const categories = useMemo<UrlCategory[]>(() => {
    const groups: Record<string, string[]> = {}

    for (const url of urls) {
      try {
        const path = new URL(url).pathname
        const cat = categorizeUrl(path, platform)
        ;(groups[cat] = groups[cat] || []).push(url)
      } catch {
        ;(groups.other = groups.other || []).push(url)
      }
    }

    // Sort: categories with more URLs first, 'other' always last
    const order = ['home', 'product_detail', 'category', 'cart', 'checkout', 'order_confirmation', 'search_results', 'account', 'blog_detail', 'static', 'other']
    return order
      .filter(key => groups[key]?.length)
      .map(key => ({
        key,
        ...CATEGORY_META[key],
        urls: groups[key],
      }))
  }, [urls, platform])

  function toggleGroup(key: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  return (
    <div>
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between py-1 group"
      >
        <span className="text-gray-500 text-sm">検出URL</span>
        <div className="flex items-center gap-2">
          <span className="text-white font-medium text-sm">{urls.length.toLocaleString()} 件</span>
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
            : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
          }
        </div>
      </button>

      {/* Expanded: categorized URL list */}
      {expanded && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-gray-400 text-xs">AI推測によるURL分類</span>
          </div>

          {categories.map(cat => (
            <div key={cat.key} className="rounded-lg border border-gray-800 overflow-hidden">
              {/* Category header */}
              <button
                onClick={() => toggleGroup(cat.key)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Badge className={`text-xs ${cat.color}`}>
                    {cat.label}
                  </Badge>
                  <span className="text-gray-500 text-xs">{cat.description}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-xs font-mono">{cat.urls.length}</span>
                  {expandedGroups.has(cat.key)
                    ? <ChevronUp className="w-3 h-3 text-gray-600" />
                    : <ChevronDown className="w-3 h-3 text-gray-600" />
                  }
                </div>
              </button>

              {/* URL list */}
              {expandedGroups.has(cat.key) && (
                <div className="border-t border-gray-800 bg-gray-950/50 max-h-48 overflow-y-auto">
                  {cat.urls.slice(0, 50).map((url, i) => {
                    const path = (() => { try { return new URL(url).pathname } catch { return url } })()
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs border-b border-gray-800/50 last:border-0 hover:bg-gray-800/30 group/row"
                      >
                        <span className="text-gray-600 font-mono w-6 text-right flex-shrink-0">{i + 1}</span>
                        <span className="text-gray-300 font-mono truncate flex-1">{path}</span>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-700 hover:text-blue-400 opacity-0 group-hover/row:opacity-100 transition-opacity flex-shrink-0"
                          onClick={e => e.stopPropagation()}
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )
                  })}
                  {cat.urls.length > 50 && (
                    <div className="px-3 py-2 text-gray-600 text-xs text-center">
                      他 {cat.urls.length - 50} 件のURL
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
