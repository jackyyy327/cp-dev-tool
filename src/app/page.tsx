'use client'

import { useState } from 'react'
import { SitemapWizard } from '@/components/editor/SitemapWizard'
import { KnowledgeBase } from '@/components/knowledge-base/KnowledgeBase'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { SitemapEntry } from '@/types/sitemap'
import { Sparkles, BookOpen, Zap } from 'lucide-react'

export default function Home() {
  const [activeTab, setActiveTab] = useState('generate')
  const [templateEntry, setTemplateEntry] = useState<SitemapEntry | null>(null)

  function handleUseAsTemplate(entry: SitemapEntry) {
    setTemplateEntry(entry)
    setActiveTab('generate')
  }

  return (
    <>
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight">MCP Dev Tool</span>
            <span className="text-gray-600 text-xs">by dentsuDigital</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            Claude AI 搭載
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-screen-2xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">
                パーソナライゼーション自動化ツール
              </h1>
              <p className="text-gray-400 text-sm">
                MCPサイトマップの自動生成とチームナレッジベースの管理
              </p>
            </div>
            <TabsList className="bg-gray-900 border border-gray-800">
              <TabsTrigger value="generate" className="flex items-center gap-2 data-[state=active]:bg-gray-800">
                <Sparkles className="w-3.5 h-3.5" />
                サイトマップ生成
              </TabsTrigger>
              <TabsTrigger value="knowledge" className="flex items-center gap-2 data-[state=active]:bg-gray-800">
                <BookOpen className="w-3.5 h-3.5" />
                ナレッジベース
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="generate" className="mt-0">
            <SitemapWizard
              templateEntry={templateEntry}
              onTemplateConsumed={() => setTemplateEntry(null)}
            />
          </TabsContent>

          <TabsContent value="knowledge" className="mt-0">
            <KnowledgeBase onUseAsTemplate={handleUseAsTemplate} />
          </TabsContent>
        </Tabs>
      </main>
    </div>

    <ChatPanel />
    </>
  )
}
