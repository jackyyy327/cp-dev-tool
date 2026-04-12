'use client'

import { useState, useRef } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { parseGtmContainer, type GtmParseResult } from '@/lib/gtm-parser'
import { Upload, ChevronDown, ChevronUp, CheckCircle2, X, FileJson } from 'lucide-react'

interface GtmImportProps {
  onParsed: (result: GtmParseResult) => void
  onClear: () => void
  parsed: GtmParseResult | null
}

export function GtmImport({ onParsed, onClear, parsed }: GtmImportProps) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    if (!file.name.endsWith('.json')) {
      setError('JSONファイルを選択してください')
      return
    }
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const json = JSON.parse(e.target?.result as string)
        const result = parseGtmContainer(json)
        onParsed(result)
        setOpen(false)
        setError('')
      } catch (err) {
        setError(err instanceof Error ? err.message : '解析に失敗しました')
      }
    }
    reader.readAsText(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  if (parsed) {
    return (
      <Card className="bg-gray-900 border-gray-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-white text-sm font-medium">GTMコンテナ読み込み済み</span>
            <Badge className="bg-orange-900/40 text-orange-400 border-orange-800 text-xs">
              {parsed.containerName}
            </Badge>
          </div>
          <button onClick={onClear} className="text-gray-600 hover:text-gray-400 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center mb-3">
          <div className="bg-gray-800 rounded-lg p-2">
            <div className="text-white font-semibold text-lg">{parsed.variables.length}</div>
            <div className="text-gray-500 text-xs">DataLayer変数</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-2">
            <div className="text-white font-semibold text-lg">{parsed.customEvents.length}</div>
            <div className="text-gray-500 text-xs">カスタムイベント</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-2">
            <div className="text-white font-semibold text-lg">{parsed.tagCount}</div>
            <div className="text-gray-500 text-xs">タグ数</div>
          </div>
        </div>

        {parsed.variables.length > 0 && (
          <div className="space-y-1">
            <p className="text-gray-500 text-xs mb-1.5">検出された変数（サイトマップ生成に活用されます）</p>
            <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
              {parsed.variables.map(v => (
                <span key={v.dlvKey} className="text-xs bg-gray-800 border border-gray-700 rounded px-2 py-0.5 font-mono text-blue-300">
                  {v.dlvKey}
                </span>
              ))}
            </div>
          </div>
        )}

        {parsed.customEvents.length > 0 && (
          <div className="mt-2 space-y-1">
            <p className="text-gray-500 text-xs mb-1.5">カスタムイベント</p>
            <div className="flex flex-wrap gap-1.5">
              {parsed.customEvents.map(ev => (
                <span key={ev} className="text-xs bg-violet-900/40 border border-violet-800 rounded px-2 py-0.5 text-violet-300">
                  {ev}
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>
    )
  }

  return (
    <Card className="bg-gray-900 border-gray-800 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileJson className="w-4 h-4 text-orange-400" />
          <span className="text-white text-sm font-medium">GTMコンテナをインポート（任意）</span>
          <span className="text-gray-500 text-xs">DataLayer変数を自動抽出してコードの精度を上げます</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-800 pt-3 space-y-3">
          <p className="text-gray-400 text-xs">
            GTM管理画面から「コンテナをエクスポート」してダウンロードしたJSONファイルをアップロードしてください。
          </p>

          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-gray-700 hover:border-blue-600 rounded-lg p-6 text-center cursor-pointer transition-colors"
          >
            <Upload className="w-6 h-6 text-gray-600 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">クリックまたはドロップしてJSONをアップロード</p>
            <p className="text-gray-600 text-xs mt-1">GTMエクスポートJSON（.json）</p>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleInputChange}
          />

          {error && <p className="text-red-400 text-xs">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setOpen(false); setError('') }}
              className="h-7 text-xs border-gray-700 text-gray-400 hover:bg-gray-800"
            >
              キャンセル
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
