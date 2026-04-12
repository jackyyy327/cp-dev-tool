'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronUp, Database, Copy, Check } from 'lucide-react'

interface DataLayerViewerProps {
  dataLayer: Record<string, unknown> | null
}

function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'text-orange-300'      // number
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-blue-300'        // key
        } else {
          cls = 'text-green-300'       // string value
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-violet-400'        // boolean
      } else if (/null/.test(match)) {
        cls = 'text-gray-500'          // null
      }
      return `<span class="${cls}">${match}</span>`
    }
  )
}

// Try to describe common dataLayer keys
const KEY_DESCRIPTIONS: Record<string, string> = {
  // GTM fallback
  _gtmDetected: 'GTMタグが検出されました',
  _gtmId: 'GTMコンテナID',
  // Common ecommerce
  event: 'イベント名',
  ecommerce: 'ECデータオブジェクト',
  transactionId: '取引ID',
  transactionTotal: '取引合計金額',
  transactionProducts: '購入商品一覧',
  currencyCode: '通貨コード',
  // Common page data
  pageType: 'ページタイプ識別子',
  pageName: 'ページ名',
  pageCategory: 'ページカテゴリ',
  pageTitle: 'ページタイトル',
  // User data
  userId: 'ユーザーID',
  userType: 'ユーザータイプ（会員/ゲスト）',
  isLoggedIn: 'ログイン状態',
  // Product data
  productId: '商品ID',
  productName: '商品名',
  productPrice: '商品価格',
  productCategory: '商品カテゴリ',
  productBrand: '商品ブランド',
}

export function DataLayerViewer({ dataLayer }: DataLayerViewerProps) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!dataLayer) {
    return (
      <div className="flex items-center justify-between py-1">
        <span className="text-gray-500 text-sm">DataLayer</span>
        <span className="text-gray-500 font-medium text-sm">未検出</span>
      </div>
    )
  }

  const isGtmOnly = dataLayer._gtmDetected && Object.keys(dataLayer).length <= 2
  const jsonStr = JSON.stringify(dataLayer, null, 2)
  const keys = Object.keys(dataLayer)

  function handleCopy() {
    navigator.clipboard.writeText(jsonStr)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      {/* Header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between py-1 group"
      >
        <span className="text-gray-500 text-sm">DataLayer</span>
        <div className="flex items-center gap-2">
          <Badge className="bg-green-900/40 text-green-400 border-green-800 text-xs">
            {isGtmOnly ? `GTM検出 (${dataLayer._gtmId})` : `${keys.length} キー検出`}
          </Badge>
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
            : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
          }
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Key descriptions */}
          {!isGtmOnly && (
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 mb-2">
                <Database className="w-3.5 h-3.5 text-green-400" />
                <span className="text-gray-400 text-xs">検出されたDataLayerキー</span>
              </div>
              <div className="space-y-1">
                {keys.map(key => {
                  const desc = KEY_DESCRIPTIONS[key]
                  const value = dataLayer[key]
                  const valueType = Array.isArray(value) ? 'array' : typeof value

                  return (
                    <div key={key} className="flex items-center gap-2 px-2 py-1 rounded bg-gray-800/50">
                      <code className="text-blue-300 text-xs font-mono flex-shrink-0">{key}</code>
                      <Badge variant="outline" className="border-gray-700 text-gray-600 text-xs flex-shrink-0">
                        {valueType}
                      </Badge>
                      {desc && <span className="text-gray-500 text-xs truncate">{desc}</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Raw JSON */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-gray-400 text-xs">DataLayer実例（サイトから取得）</span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-gray-600 hover:text-gray-400 text-xs transition-colors"
              >
                {copied
                  ? <><Check className="w-3 h-3 text-green-400" /> コピー済み</>
                  : <><Copy className="w-3 h-3" /> コピー</>
                }
              </button>
            </div>
            <pre
              className="bg-gray-950 border border-gray-800 rounded-lg p-3 text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto leading-relaxed"
              dangerouslySetInnerHTML={{ __html: syntaxHighlight(jsonStr) }}
            />
          </div>

          {/* Hint */}
          <p className="text-gray-600 text-xs">
            {isGtmOnly
              ? 'GTMコンテナは検出されましたが、dataLayerの初期値は取得できませんでした。GTMコンテナJSONをインポートすると、より正確なコードを生成できます。'
              : 'これらのキーはサイトマップコード生成時に活用され、適切なデータ取得ロジックが自動挿入されます。'
            }
          </p>
        </div>
      )}
    </div>
  )
}
