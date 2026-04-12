'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { SitemapEntry, Platform, SiteType, RecognitionStatus } from '@/types/sitemap'
import { Search, Globe, Calendar, Tag, BookOpen, Filter, FileSearch, CheckCircle2, AlertTriangle, HelpCircle, ChevronDown, ChevronUp, TriangleAlert } from 'lucide-react'

const PLATFORM_LABELS: Record<string, string> = {
  shopify: 'Shopify',
  magento: 'Magento',
  sfcc: 'SFCC',
  hybris: 'Hybris',
  bigcommerce: 'BigCommerce',
  wordpress: 'WordPress',
  woocommerce: 'WooCommerce',
  custom: 'Custom',
  unknown: 'Unknown',
}

const PLATFORM_COLORS: Record<string, string> = {
  shopify: 'bg-green-900/40 text-green-400 border-green-800',
  magento: 'bg-orange-900/40 text-orange-400 border-orange-800',
  sfcc: 'bg-blue-900/40 text-blue-400 border-blue-800',
  hybris: 'bg-cyan-900/40 text-cyan-400 border-cyan-800',
  bigcommerce: 'bg-indigo-900/40 text-indigo-400 border-indigo-800',
  wordpress: 'bg-sky-900/40 text-sky-400 border-sky-800',
  woocommerce: 'bg-purple-900/40 text-purple-400 border-purple-800',
  custom: 'bg-gray-800 text-gray-400 border-gray-700',
  unknown: 'bg-gray-800 text-gray-400 border-gray-700',
}

interface KnowledgeBaseProps {
  onUseAsTemplate?: (entry: SitemapEntry) => void
}

export function KnowledgeBase({ onUseAsTemplate }: KnowledgeBaseProps) {
  const [entries, setEntries] = useState<SitemapEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterPlatform, setFilterPlatform] = useState<Platform | ''>('')
  const [filterSiteType, setFilterSiteType] = useState<SiteType | ''>('')

  useEffect(() => {
    fetchEntries()
  }, [search, filterPlatform, filterSiteType])

  async function fetchEntries() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('q', search)
      if (filterPlatform) params.set('platform', filterPlatform)
      if (filterSiteType) params.set('siteType', filterSiteType)

      const res = await fetch(`/api/sitemaps?${params}`)
      const data = await res.json()
      setEntries(data)
    } finally {
      setLoading(false)
    }
  }

  const isEmpty = !loading && entries.length === 0

  return (
    <div className="space-y-6">
      {/* Search & Filter bar */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="クライアント名・URL・タグで検索..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={filterPlatform}
            onChange={e => setFilterPlatform(e.target.value as Platform | '')}
            className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
          >
            <option value="">すべてのプラットフォーム</option>
            <option value="shopify">Shopify</option>
            <option value="magento">Magento</option>
            <option value="sfcc">SFCC</option>
            <option value="hybris">Hybris</option>
            <option value="bigcommerce">BigCommerce</option>
            <option value="wordpress">WordPress</option>
            <option value="woocommerce">WooCommerce</option>
            <option value="custom">カスタム</option>
          </select>
          <select
            value={filterSiteType}
            onChange={e => setFilterSiteType(e.target.value as SiteType | '')}
            className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
          >
            <option value="">すべてのタイプ</option>
            <option value="ecommerce">EC・通販</option>
            <option value="b2b">B2B</option>
            <option value="media">メディア</option>
            <option value="general">一般</option>
          </select>
        </div>
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center mb-4">
            <BookOpen className="w-7 h-7 text-gray-600" />
          </div>
          <h3 className="text-white font-semibold mb-1">まだ保存されたサイトマップはありません</h3>
          <p className="text-gray-500 text-sm max-w-xs">
            サイトマップを生成してナレッジベースに保存すると、チームで知識を蓄積できます。
          </p>
        </div>
      )}

      {/* Grid */}
      {!isEmpty && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {entries.map(entry => (
            <SitemapCard key={entry.id} entry={entry} onDeleted={fetchEntries} onUseAsTemplate={onUseAsTemplate} />
          ))}
        </div>
      )}
    </div>
  )
}

function SitemapCard({ entry, onDeleted, onUseAsTemplate }: {
  entry: SitemapEntry
  onDeleted: () => void
  onUseAsTemplate?: (entry: SitemapEntry) => void
}) {
  const [expanded, setExpanded] = useState(false)

  async function handleDelete() {
    if (!confirm(`「${entry.name}」を削除しますか？`)) return
    await fetch(`/api/sitemaps?id=${entry.id}`, { method: 'DELETE' })
    onDeleted()
  }

  function handleUseAsTemplate() {
    onUseAsTemplate?.(entry)
  }

  const gr = entry.generationResult

  return (
    <Card className="bg-gray-900 border-gray-800 p-4 hover:border-gray-700 transition-colors group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-sm truncate">{entry.name}</h3>
          <div className="flex items-center gap-1 mt-0.5">
            <Globe className="w-3 h-3 text-gray-600 flex-shrink-0" />
            <span className="text-gray-500 text-xs truncate">{entry.url}</span>
          </div>
        </div>
        <Badge className={`text-xs ml-2 flex-shrink-0 ${PLATFORM_COLORS[entry.platform]}`}>
          {PLATFORM_LABELS[entry.platform]}
        </Badge>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <Badge variant="outline" className="border-gray-700 text-gray-400 text-xs capitalize">
          {entry.siteType}
        </Badge>
        <Badge variant="outline" className="border-gray-700 text-gray-400 text-xs capitalize">
          {entry.industry}
        </Badge>
      </div>

      {entry.tags.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap mb-3">
          <Tag className="w-3 h-3 text-gray-600" />
          {entry.tags.map(tag => (
            <span key={tag} className="text-gray-500 text-xs bg-gray-800 px-1.5 py-0.5 rounded">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Structured analysis summary */}
      {gr ? (
        <div className="mb-3 space-y-1.5">
          <div className="flex items-start gap-1.5">
            <FileSearch className="w-3 h-3 text-blue-400 mt-0.5 shrink-0" />
            <p className={`text-gray-400 text-xs ${expanded ? '' : 'line-clamp-2'}`}>
              {gr.summary.overallAssessment}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs flex-wrap">
            {gr.pageTypes.length > 0 && (
              <span className="text-gray-500">
                {gr.pageTypes.length} ページタイプ
              </span>
            )}
            {gr.summary.globalRisks.length > 0 && (
              <span className="text-red-400/70">
                {gr.summary.globalRisks.length} リスク
              </span>
            )}
          </div>
          {gr.pageTypes.length > 0 && (
            <PageTypeStatusSummary pageTypes={gr.pageTypes} />
          )}

          {/* Expanded detail */}
          {expanded && (
            <div className="pt-1.5 space-y-2 border-t border-gray-800 mt-1.5">
              {gr.summary.globalRisks.length > 0 && (
                <div>
                  <span className="text-red-400 text-xs font-medium flex items-center gap-1 mb-1">
                    <TriangleAlert className="w-3 h-3" />
                    リスク
                  </span>
                  <ul className="space-y-0.5">
                    {gr.summary.globalRisks.map((risk, i) => (
                      <li key={i} className="text-xs text-red-300/70">&#x2022; {risk}</li>
                    ))}
                  </ul>
                </div>
              )}
              {gr.summary.nextActions.length > 0 && (
                <div>
                  <span className="text-green-400 text-xs font-medium mb-1 block">次のアクション</span>
                  <ul className="space-y-0.5">
                    {gr.summary.nextActions.map((a, i) => (
                      <li key={i} className="text-xs text-green-300/70">&#x2022; {a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Expand toggle */}
          {(gr.summary.globalRisks.length > 0 || gr.summary.nextActions.length > 0 || gr.summary.overallAssessment.length > 100) && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {expanded ? '閉じる' : '詳細を表示'}
            </button>
          )}
        </div>
      ) : (
        <div className="mb-3">
          <p className="text-gray-600 text-xs">構造化分析データなし</p>
        </div>
      )}

      {entry.notes && (
        <p className="text-gray-500 text-xs mb-3 line-clamp-2">{entry.notes}</p>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-gray-600 text-xs">
          <Calendar className="w-3 h-3" />
          {new Date(entry.updatedAt).toLocaleDateString()}
        </div>
        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="sm"
            variant="outline"
            onClick={handleUseAsTemplate}
            className="h-6 text-xs px-2 border-gray-700 text-gray-400 hover:bg-gray-800"
          >
            テンプレートとして使用
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDelete}
            className="h-6 text-xs px-2 border-red-900 text-red-400 hover:bg-red-950/40"
          >
            削除
          </Button>
        </div>
      </div>
    </Card>
  )
}

const STATUS_ICON: Record<RecognitionStatus, React.ReactNode> = {
  confirmed: <CheckCircle2 className="w-3 h-3 text-green-400" />,
  likely: <AlertTriangle className="w-3 h-3 text-yellow-400" />,
  template: <HelpCircle className="w-3 h-3 text-gray-500" />,
}

function PageTypeStatusSummary({ pageTypes }: { pageTypes: { recognitionStatus: RecognitionStatus }[] }) {
  const counts = { confirmed: 0, likely: 0, template: 0 }
  for (const pt of pageTypes) {
    counts[pt.recognitionStatus]++
  }

  return (
    <div className="flex items-center gap-3 text-xs">
      {counts.confirmed > 0 && (
        <span className="flex items-center gap-1 text-green-400">
          {STATUS_ICON.confirmed} {counts.confirmed} Confirmed
        </span>
      )}
      {counts.likely > 0 && (
        <span className="flex items-center gap-1 text-yellow-400">
          {STATUS_ICON.likely} {counts.likely} Likely
        </span>
      )}
      {counts.template > 0 && (
        <span className="flex items-center gap-1 text-gray-500">
          {STATUS_ICON.template} {counts.template} Template
        </span>
      )}
    </div>
  )
}
