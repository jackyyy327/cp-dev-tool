'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import type { CustomPageTypeEntry } from '@/app/api/parse-requirements/route'
import {
  Plus,
  Trash2,
  FileText,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  X,
} from 'lucide-react'

interface CustomPageTypesProps {
  entries: CustomPageTypeEntry[]
  onChange: (entries: CustomPageTypeEntry[]) => void
  siteUrl?: string
}

export function CustomPageTypes({ entries, onChange, siteUrl }: CustomPageTypesProps) {
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importHint, setImportHint] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  function addEmpty() {
    const newEntry: CustomPageTypeEntry = {
      id: crypto.randomUUID(),
      name: '',
      action: '',
      rule: '',
      sampleUrls: '',
    }
    onChange([...entries, newEntry])
    setExpandedIds(prev => new Set([...prev, newEntry.id]))
  }

  function remove(id: string) {
    onChange(entries.filter(e => e.id !== id))
  }

  function update(id: string, field: keyof CustomPageTypeEntry, value: string) {
    onChange(entries.map(e => e.id === id ? { ...e, [field]: value } : e))
    // Auto-fill action when name is set
    if (field === 'name' && value) {
      const entry = entries.find(e => e.id === id)
      if (entry && !entry.action) {
        onChange(entries.map(e => e.id === id ? { ...e, name: value, action: `${value}_View` } : e))
      }
    }
  }

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleImport() {
    if (!importText.trim()) return
    setImporting(true)
    setImportError('')
    try {
      const res = await fetch('/api/parse-requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: importText, siteUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      const imported: CustomPageTypeEntry[] = data.entries
      onChange([...entries, ...imported])
      const newIds = imported.map((e: CustomPageTypeEntry) => e.id)
      setExpandedIds(prev => new Set([...prev, ...newIds]))
      setImportText('')
      setImportOpen(false)

      // Build validation hint
      const noRule = imported.filter(e => !e.rule.trim()).length
      const noUrls = imported.filter(e => !e.sampleUrls.trim()).length
      const hints: string[] = [`${imported.length} 件のページタイプを AI 初稿として抽出しました。`]
      if (noRule > 0) hints.push(`${noRule} 件で判定ルールが空です。`)
      if (noUrls > 0) hints.push(`${noUrls} 件でサンプル URL が未設定です — 追加すると isMatch の精度が向上します。`)
      setImportHint(hints.join(' '))
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold text-sm">カスタムページタイプ</h2>
          <p className="text-gray-500 text-xs mt-0.5">
            プロジェクト固有のページタイプ名・判定ルールを定義します
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setImportOpen(v => !v); setImportError('') }}
            className="h-7 text-xs px-2.5 border-gray-700 text-gray-300 hover:bg-gray-800 flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            要件書からインポート
          </Button>
          <Button
            size="sm"
            onClick={addEmpty}
            className="h-7 text-xs px-2.5 bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            手動で追加
          </Button>
        </div>
      </div>

      {/* Import panel */}
      {importOpen && (
        <Card className="bg-gray-800/60 border-gray-700 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <span className="text-white text-sm font-medium">要件書を貼り付け</span>
            </div>
            <button onClick={() => setImportOpen(false)} className="text-gray-500 hover:text-gray-300">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-gray-400 text-xs">
            要件書をそのまま貼り付けてください。Claude が AI 初稿としてページタイプ名・Action・URL 判定ルールを抽出します。
          </p>
          <p className="text-amber-400/70 text-xs">
            ※ 抽出結果は AI による推定です。ページタイプ名・Action・判定ルール・サンプル URL を必ず確認・修正してからご使用ください。
          </p>
          <Textarea
            placeholder={`Example:\n\nBG_Category_Hair_and_Beauty_Top\nURL: /c/2HA + 3文字\nAction: BG_Category_Hair_and_Beauty_Top_View\n\nBG_Product_Detail\nURL: /p/ 以降すべて\nAction: BG_Product_Detail_View`}
            value={importText}
            onChange={e => setImportText(e.target.value)}
            className="bg-gray-900 border-gray-700 text-white text-xs resize-none h-36 placeholder-gray-600 font-mono"
          />
          {importError && (
            <p className="text-red-400 text-xs">{importError}</p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setImportOpen(false); setImportText('') }}
              className="h-7 text-xs border-gray-700 text-gray-400 hover:bg-gray-800"
            >
              キャンセル
            </Button>
            <Button
              size="sm"
              onClick={handleImport}
              disabled={importing || !importText.trim()}
              className="h-7 text-xs bg-violet-600 hover:bg-violet-500 text-white flex items-center gap-1.5"
            >
              {importing
                ? <><Loader2 className="w-3 h-3 animate-spin" /> 解析中...</>
                : <><Sparkles className="w-3 h-3" /> Claudeで解析</>
              }
            </Button>
          </div>
        </Card>
      )}

      {/* Import hint */}
      {importHint && (
        <div className="flex items-start gap-2 bg-amber-950/20 border border-amber-900/30 rounded-lg px-3 py-2">
          <Sparkles className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-amber-200/70 text-xs">{importHint}</p>
          <button onClick={() => setImportHint('')} className="text-amber-400/50 hover:text-amber-300 shrink-0">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Entry list */}
      {entries.length === 0 && !importOpen && (
        <div className="border border-dashed border-gray-800 rounded-lg py-6 text-center">
          <p className="text-gray-600 text-xs">カスタムページタイプはまだありません</p>
          <p className="text-gray-700 text-xs mt-0.5">手動で追加するか、要件書からインポートしてください</p>
        </div>
      )}

      <div className="space-y-2">
        {entries.map((entry, index) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            index={index}
            expanded={expandedIds.has(entry.id)}
            onToggle={() => toggleExpand(entry.id)}
            onUpdate={(field, value) => update(entry.id, field, value)}
            onRemove={() => remove(entry.id)}
          />
        ))}
      </div>
    </div>
  )
}

interface EntryCardProps {
  entry: CustomPageTypeEntry
  index: number
  expanded: boolean
  onToggle: () => void
  onUpdate: (field: keyof CustomPageTypeEntry, value: string) => void
  onRemove: () => void
}

function EntryCard({ entry, index, expanded, onToggle, onUpdate, onRemove }: EntryCardProps) {
  const isValid = entry.name.trim() && entry.rule.trim()

  return (
    <Card className="bg-gray-900 border-gray-800 overflow-hidden">
      {/* Collapsed header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-gray-600 text-xs font-mono w-5 text-right flex-shrink-0">
            {index + 1}
          </span>
          {entry.name ? (
            <code className="text-blue-300 text-xs truncate">{entry.name}</code>
          ) : (
            <span className="text-gray-600 text-xs italic">名称未設定</span>
          )}
          {entry.action && (
            <Badge variant="outline" className="border-gray-700 text-gray-500 text-xs hidden sm:flex">
              {entry.action}
            </Badge>
          )}
          {!isValid && (
            <span className="text-yellow-600 text-xs">⚠ 未完成</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={e => { e.stopPropagation(); onRemove() }}
            className="text-gray-600 hover:text-red-400 transition-colors p-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {expanded
            ? <ChevronUp className="w-4 h-4 text-gray-500" />
            : <ChevronDown className="w-4 h-4 text-gray-500" />
          }
        </div>
      </button>

      {/* Expanded form */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-800 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-gray-400 text-xs mb-1 block">
                ページタイプ名 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={entry.name}
                onChange={e => onUpdate('name', e.target.value)}
                placeholder="BG_Category_Hair_and_Beauty_Top"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
            <div>
              <label className="text-gray-400 text-xs mb-1 block">Action名</label>
              <input
                type="text"
                value={entry.action}
                onChange={e => onUpdate('action', e.target.value)}
                placeholder="BG_Category_Hair_and_Beauty_Top_View"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-gray-400 text-xs mb-1 block">
              判定ルール <span className="text-red-400">*</span>
              <span className="text-gray-600 ml-1">（自然言語で記述してください）</span>
            </label>
            <Textarea
              value={entry.rule}
              onChange={e => onUpdate('rule', e.target.value)}
              placeholder="例：/c/2HA の後ろに最大3文字の英数字が続くURL、およびその配下のすべてのページ"
              className="bg-gray-800 border-gray-700 text-white text-xs resize-none h-16 placeholder-gray-600"
            />
          </div>

          <div>
            <label className="text-gray-400 text-xs mb-1 block">
              サンプルURL
              <span className="text-gray-600 ml-1">（カンマ区切り、isMatchの精度向上に役立ちます）</span>
            </label>
            <input
              type="text"
              value={entry.sampleUrls}
              onChange={e => onUpdate('sampleUrls', e.target.value)}
              placeholder="https://www.beautygarage.jp/c/2HA, https://www.beautygarage.jp/c/2HAxxx"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      )}
    </Card>
  )
}
