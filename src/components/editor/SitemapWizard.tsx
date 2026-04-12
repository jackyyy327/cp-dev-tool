'use client'

import { useState, useEffect } from 'react'
import { MonacoPane } from './MonacoPane'
import { CustomPageTypes } from './CustomPageTypes'
import { GtmImport } from './GtmImport'
import { SaveToKBDialog } from './SaveToKBDialog'
import { UrlAnalysis } from './UrlAnalysis'
import { DataLayerViewer } from './DataLayerViewer'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import type { CrawlResult, SitemapEntry } from '@/types/sitemap'
import type { CustomPageTypeEntry } from '@/app/api/parse-requirements/route'
import type { GtmParseResult } from '@/lib/gtm-parser'
import {
  Globe,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Cpu,
  Code2,
  Save,
  Copy,
  Check,
  BookOpen,
} from 'lucide-react'

type Step = 'input' | 'crawling' | 'review' | 'generating' | 'done'

const PLATFORM_LABELS: Record<string, string> = {
  shopify: 'Shopify',
  magento: 'Magento',
  sfcc: 'Salesforce B2C Commerce',
  hybris: 'SAP Commerce Cloud (Hybris)',
  bigcommerce: 'BigCommerce',
  wordpress: 'WordPress',
  woocommerce: 'WooCommerce',
  custom: 'Custom',
  unknown: 'Unknown',
}

const CONFIDENCE_COLOR = (c: number) => {
  if (c >= 80) return 'text-green-400'
  if (c >= 60) return 'text-yellow-400'
  return 'text-red-400'
}

interface SitemapWizardProps {
  templateEntry?: SitemapEntry | null
  onTemplateConsumed?: () => void
  onSaved?: () => void
}

export function SitemapWizard({ templateEntry, onTemplateConsumed, onSaved }: SitemapWizardProps) {
  const [step, setStep] = useState<Step>('input')
  const [url, setUrl] = useState('')
  const [customNotes, setCustomNotes] = useState('')
  const [customPageTypes, setCustomPageTypes] = useState<CustomPageTypeEntry[]>([])
  const [gtmData, setGtmData] = useState<GtmParseResult | null>(null)
  const [crawlResult, setCrawlResult] = useState<CrawlResult | null>(null)
  const [generatedCode, setGeneratedCode] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [savedToKB, setSavedToKB] = useState(false)

  // Load template when provided from knowledge base
  useEffect(() => {
    if (!templateEntry) return
    setUrl(templateEntry.url)
    setGeneratedCode(templateEntry.code)
    if (templateEntry.crawlResult) {
      setCrawlResult(templateEntry.crawlResult)
    }
    setStep('done')
    setSavedToKB(false)
    setShowSaveDialog(false)
    onTemplateConsumed?.()
  }, [templateEntry]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCrawl() {
    setError('')
    setStep('crawling')
    try {
      const res = await fetch('/api/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCrawlResult(data)
      setStep('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Crawl failed')
      setStep('input')
    }
  }

  async function handleGenerate() {
    setStep('generating')
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crawlResult, customNotes, customPageTypes, gtmData }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setGeneratedCode(data.code)
      setSavedToKB(false)
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
      setStep('review')
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(generatedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleReset() {
    setStep('input')
    setUrl('')
    setCrawlResult(null)
    setGeneratedCode('')
    setCustomNotes('')
    setCustomPageTypes([])
    setGtmData(null)
    setError('')
    setShowSaveDialog(false)
    setSavedToKB(false)
  }

  function handleSaved() {
    setShowSaveDialog(false)
    setSavedToKB(true)
    onSaved?.()
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-[calc(100vh-10rem)]">
      {/* Left pane: Wizard */}
      <div className="flex flex-col gap-4 overflow-y-auto pr-1">

        {/* Step indicators */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {['input', 'crawling', 'review', 'generating', 'done'].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span className={`${step === s ? 'text-blue-400 font-medium' :
                ['crawling', 'review', 'generating', 'done'].indexOf(s) <= ['crawling', 'review', 'generating', 'done'].indexOf(step) ? 'text-gray-400' : 'text-gray-700'
                }`}>
                {['URL入力', '解析中', '確認', '生成中', '完了'][i]}
              </span>
              {i < 4 && <ChevronRight className="w-3 h-3 text-gray-700" />}
            </div>
          ))}
        </div>

        {/* Step 1: URL input */}
        {step === 'input' && (
          <Card className="bg-gray-900 border-gray-800 p-6">
            <h2 className="text-white font-semibold mb-1">クライアントサイトのURLを入力</h2>
            <p className="text-gray-400 text-sm mb-4">
              サイト構造を自動解析し、プラットフォームを検出してサイトマップを生成します。
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="https://example.com"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && url && handleCrawl()}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <Button
                onClick={handleCrawl}
                disabled={!url}
                className="bg-blue-600 hover:bg-blue-500 text-white"
              >
                解析開始
              </Button>
            </div>
            {error && (
              <div className="mt-3 flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
          </Card>
        )}

        {/* Step 2: Crawling */}
        {step === 'crawling' && (
          <Card className="bg-gray-900 border-gray-800 p-6">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
              <h2 className="text-white font-semibold">サイトを解析中...</h2>
            </div>
            <div className="space-y-2 text-sm text-gray-400">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                トップページのHTMLを取得
              </div>
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                プラットフォーム・サイトタイプを検出
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <div className="w-4 h-4 rounded-full border border-gray-700" />
                sitemap.xmlを解析
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <div className="w-4 h-4 rounded-full border border-gray-700" />
                JSON-LD・dataLayerを抽出
              </div>
            </div>
          </Card>
        )}

        {/* Step 3: Review crawl result */}
        {(step === 'review' || step === 'generating') && crawlResult && (
          <div className="space-y-4">
            <Card className="bg-gray-900 border-gray-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-white font-semibold text-sm">サイト解析結果</h2>
                <CheckCircle2 className="w-4 h-4 text-green-400" />
              </div>

              {/* Basic info row */}
              <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                <div>
                  <span className="text-gray-500">プラットフォーム</span>
                  <div className="text-white font-medium mt-0.5">
                    {PLATFORM_LABELS[crawlResult.platform] || crawlResult.platform}
                  </div>
                </div>
                <div>
                  <span className="text-gray-500">サイトタイプ</span>
                  <div className="text-white font-medium mt-0.5 capitalize">{crawlResult.siteType}</div>
                </div>
                <div>
                  <span className="text-gray-500">SPA</span>
                  <div className="text-white font-medium mt-0.5">{crawlResult.isSPA ? 'あり' : 'なし'}</div>
                </div>
                <div>
                  <span className="text-gray-500">JSON-LDスキーマ</span>
                  <div className="text-white font-medium mt-0.5">{crawlResult.jsonLd.length}</div>
                </div>
              </div>

              {/* URL Analysis — expandable */}
              <div className="border-t border-gray-800 pt-2 mt-2">
                <UrlAnalysis urls={crawlResult.sitemapXmlUrls} platform={crawlResult.platform} />
              </div>

              {/* DataLayer Viewer — expandable */}
              <div className="border-t border-gray-800 pt-2 mt-2">
                <DataLayerViewer dataLayer={crawlResult.dataLayer} />
              </div>
            </Card>

            <Card className="bg-gray-900 border-gray-800 p-4">
              <h2 className="text-white font-semibold text-sm mb-3">検出されたページタイプ</h2>
              <div className="space-y-2">
                {crawlResult.detectedPageTypes.map(pt => (
                  <div key={pt.name} className="flex items-center justify-between py-1.5 border-b border-gray-800 last:border-0">
                    <div className="flex items-center gap-2">
                      <code className="text-blue-300 text-xs bg-blue-950/40 px-1.5 py-0.5 rounded">{pt.name}</code>
                      {pt.urls.length > 0 && (
                        <span className="text-gray-600 text-xs truncate max-w-32">{pt.urls[0].replace(/^https?:\/\/[^/]+/, '')}</span>
                      )}
                    </div>
                    <span className={`text-xs font-medium ${CONFIDENCE_COLOR(pt.confidence)}`}>
                      {pt.confidence}%
                    </span>
                  </div>
                ))}
              </div>
            </Card>

            {/* GTM Import */}
            <GtmImport
              parsed={gtmData}
              onParsed={setGtmData}
              onClear={() => setGtmData(null)}
            />

            <Card className="bg-gray-900 border-gray-800 p-4">
              <CustomPageTypes
                entries={customPageTypes}
                onChange={setCustomPageTypes}
                siteUrl={url}
              />
            </Card>

            <Card className="bg-gray-900 border-gray-800 p-4">
              <h2 className="text-white font-semibold text-sm mb-2">追加メモ（任意）</h2>
              <p className="text-gray-500 text-xs mb-3">カスタム属性、特殊イベント、その他追加したい要件があれば記入してください</p>
              <Textarea
                placeholder="例：商品ページで「brand」「collection」属性をトラッキング。ウィッシュリストボタン（.add-to-wishlist）のリスナーを追加..."
                value={customNotes}
                onChange={e => setCustomNotes(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white text-sm resize-none h-20 placeholder-gray-600"
              />
            </Card>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handleReset} className="border-gray-700 text-gray-400 hover:bg-gray-800">
                最初からやり直す
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={step === 'generating'}
                className="flex-1 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white"
              >
                {step === 'generating' ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Claudeで生成中...</>
                ) : (
                  <><Cpu className="w-4 h-4 mr-2" /> サイトマップコードを生成</>
                )}
              </Button>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
          </div>
        )}

        {/* Step 5: Done */}
        {step === 'done' && (
          <div className="space-y-4">
            <Card className="bg-gray-900 border-gray-800 p-4">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
                <h2 className="text-white font-semibold text-sm">サイトマップの生成が完了しました</h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="border-gray-700 text-gray-400 text-xs">
                  {PLATFORM_LABELS[crawlResult?.platform || 'unknown']}
                </Badge>
                <Badge variant="outline" className="border-gray-700 text-gray-400 text-xs capitalize">
                  {crawlResult?.siteType}
                </Badge>
                <Badge variant="outline" className="border-gray-700 text-gray-400 text-xs">
                  {crawlResult?.detectedPageTypes.length} ページタイプ
                </Badge>
              </div>
            </Card>

            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={handleCopy}
                variant="outline"
                className="border-gray-700 text-gray-300 hover:bg-gray-800 flex items-center gap-2"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'コピーしました！' : 'コードをコピー'}
              </Button>

              {savedToKB ? (
                <Button
                  variant="outline"
                  disabled
                  className="border-green-800 text-green-400 flex items-center gap-2 cursor-default"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  保存済み
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setShowSaveDialog(v => !v)}
                  className="border-gray-700 text-gray-300 hover:bg-gray-800 flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  ナレッジベースに保存
                </Button>
              )}

              <Button onClick={handleReset} variant="outline" className="border-gray-700 text-gray-400 hover:bg-gray-800 ml-auto">
                新しいプロジェクト
              </Button>
            </div>

            {/* Inline save dialog */}
            {showSaveDialog && crawlResult && (
              <SaveToKBDialog
                crawlResult={crawlResult}
                code={generatedCode}
                onSaved={handleSaved}
                onCancel={() => setShowSaveDialog(false)}
              />
            )}
          </div>
        )}
      </div>

      {/* Right pane: Monaco code editor */}
      <div className="rounded-xl overflow-hidden border border-gray-800 bg-gray-900 flex flex-col">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 bg-gray-900/80">
          <div className="flex items-center gap-2">
            <Code2 className="w-4 h-4 text-gray-500" />
            <span className="text-xs text-gray-400 font-medium">sitemap.js</span>
          </div>
          {generatedCode && (
            <div className="flex items-center gap-2">
              {savedToKB && (
                <Badge className="bg-green-900/40 text-green-400 border-green-800 text-xs flex items-center gap-1">
                  <BookOpen className="w-3 h-3" />
                  KB保存済み
                </Badge>
              )}
              <Badge className="bg-green-900/40 text-green-400 border-green-800 text-xs">
                生成完了
              </Badge>
            </div>
          )}
        </div>
        <div className="flex-1">
          <MonacoPane
            value={generatedCode || '// 生成されたサイトマップコードがここに表示されます...'}
            onChange={setGeneratedCode}
            readOnly={!generatedCode}
          />
        </div>
      </div>
    </div>
  )
}
