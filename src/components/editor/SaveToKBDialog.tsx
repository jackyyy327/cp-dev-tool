'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import type { CrawlResult, Industry } from '@/types/sitemap'
import { CheckCircle2, Loader2, X } from 'lucide-react'

interface SaveToKBDialogProps {
  crawlResult: CrawlResult
  code: string
  onSaved: () => void
  onCancel: () => void
}

const INDUSTRY_OPTIONS: { value: Industry; label: string }[] = [
  { value: 'retail', label: '小売・EC' },
  { value: 'fashion', label: 'ファッション' },
  { value: 'electronics', label: '家電・IT' },
  { value: 'food', label: '食品・飲料' },
  { value: 'travel', label: '旅行・宿泊' },
  { value: 'finance', label: '金融' },
  { value: 'healthcare', label: '医療・ヘルスケア' },
  { value: 'technology', label: 'テクノロジー' },
  { value: 'other', label: 'その他' },
]

export function SaveToKBDialog({ crawlResult, code, onSaved, onCancel }: SaveToKBDialogProps) {
  const defaultName = (() => {
    try { return new URL(crawlResult.url).hostname.replace(/^www\./, '') } catch { return '' }
  })()

  const [name, setName] = useState(defaultName)
  const [industry, setIndustry] = useState<Industry>('other')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function addTag() {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) setTags(prev => [...prev, t])
    setTagInput('')
  }

  function removeTag(t: string) {
    setTags(prev => prev.filter(x => x !== t))
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag()
    }
  }

  async function handleSave() {
    if (!name.trim()) { setError('プロジェクト名は必須です'); return }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/sitemaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          url: crawlResult.url,
          platform: crawlResult.platform,
          siteType: crawlResult.siteType,
          industry,
          code,
          notes: notes.trim() || undefined,
          tags,
          crawlResult,
        }),
      })
      if (!res.ok) throw new Error('保存に失敗しました')
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="bg-gray-800 border-gray-700 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold text-sm">ナレッジベースに保存</h3>
        <button onClick={onCancel} className="text-gray-500 hover:text-gray-300 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Name */}
      <div>
        <label className="text-gray-400 text-xs mb-1 block">
          プロジェクト名 <span className="text-red-400">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="例：Beautygarage.jp"
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      {/* Industry */}
      <div>
        <label className="text-gray-400 text-xs mb-1 block">業種</label>
        <select
          value={industry}
          onChange={e => setIndustry(e.target.value as Industry)}
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
        >
          {INDUSTRY_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Tags */}
      <div>
        <label className="text-gray-400 text-xs mb-1 block">
          タグ
          <span className="text-gray-600 ml-1">（Enterまたはカンマで追加）</span>
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={e => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            onBlur={addTag}
            placeholder="例：hybris, B2B, beauty"
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {tags.map(t => (
              <Badge
                key={t}
                variant="outline"
                className="border-blue-800 text-blue-300 text-xs cursor-pointer hover:border-red-800 hover:text-red-400 transition-colors"
                onClick={() => removeTag(t)}
              >
                {t} ×
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="text-gray-400 text-xs mb-1 block">メモ（任意）</label>
        <Textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="例：Hybris /p/ /c/ 構成。GTM実装済み。カスタムページタイプあり。"
          className="bg-gray-900 border-gray-700 text-white text-xs resize-none h-16 placeholder-gray-600"
        />
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <div className="flex gap-2 pt-1">
        <Button
          variant="outline"
          onClick={onCancel}
          className="border-gray-700 text-gray-400 hover:bg-gray-800"
          size="sm"
        >
          キャンセル
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-2"
          size="sm"
        >
          {saving
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 保存中...</>
            : <><CheckCircle2 className="w-3.5 h-3.5" /> 保存する</>
          }
        </Button>
      </div>
    </Card>
  )
}
