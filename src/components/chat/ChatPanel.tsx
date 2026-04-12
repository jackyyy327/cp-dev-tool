'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { MessageCircle, X, Send, Loader2, Bot, User, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

interface ChatPanelProps {
  context?: string
}

export function ChatPanel({ context }: ChatPanelProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [hasUnread, setHasUnread] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Scroll to bottom on new messages
  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, open])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
      setHasUnread(false)
    }
  }, [open])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    const assistantMsgId = crypto.randomUUID()

    setMessages(prev => [
      ...prev,
      userMsg,
      { id: assistantMsgId, role: 'assistant', content: '' },
    ])
    setInput('')
    setStreaming(true)

    abortRef.current = new AbortController()

    try {
      const history = [...messages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }))

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, context }),
        signal: abortRef.current.signal,
      })

      if (!res.ok) throw new Error('Chat request failed')
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        const final = accumulated
        setMessages(prev =>
          prev.map(m => m.id === assistantMsgId ? { ...m, content: final } : m)
        )
      }

      // Mark unread if panel is closed
      if (!open) setHasUnread(true)
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMsgId
              ? { ...m, content: 'エラーが発生しました。もう一度お試しください。' }
              : m
          )
        )
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [input, streaming, messages, context, open])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function handleClose() {
    if (streaming) abortRef.current?.abort()
    setOpen(false)
  }

  function clearHistory() {
    setMessages([])
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 ${
          open
            ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            : 'bg-gradient-to-br from-blue-500 to-violet-600 text-white hover:shadow-blue-900/40 hover:scale-105'
        }`}
        title="AIアシスタント"
      >
        {open ? <ChevronDown className="w-5 h-5" /> : (
          <>
            <MessageCircle className="w-5 h-5" />
            {hasUnread && (
              <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-green-400 rounded-full border-2 border-gray-950" />
            )}
          </>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-22 right-6 z-50 w-96 max-w-[calc(100vw-3rem)] flex flex-col rounded-2xl overflow-hidden shadow-2xl border border-gray-700 bg-gray-900"
          style={{ height: '520px' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700 flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="text-white text-sm font-semibold">MCP アシスタント</div>
                <div className="text-gray-500 text-xs">MCPに関する質問に答えます</div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={clearHistory}
                  className="text-gray-600 hover:text-gray-400 text-xs px-2 py-1 rounded hover:bg-gray-700 transition-colors"
                >
                  クリア
                </button>
              )}
              <button
                onClick={handleClose}
                className="text-gray-500 hover:text-gray-300 transition-colors p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <WelcomeScreen onSuggest={q => { setInput(q); setTimeout(() => inputRef.current?.focus(), 50) }} />
            )}

            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                  msg.role === 'user'
                    ? 'bg-blue-600'
                    : 'bg-gradient-to-br from-blue-500 to-violet-600'
                }`}>
                  {msg.role === 'user'
                    ? <User className="w-3.5 h-3.5 text-white" />
                    : <Bot className="w-3.5 h-3.5 text-white" />
                  }
                </div>
                <div className={`flex-1 ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
                  <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed max-w-[85%] ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-sm'
                      : 'bg-gray-800 text-gray-200 rounded-tl-sm'
                  }`}>
                    {msg.content === '' && msg.role === 'assistant'
                      ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                      : <MarkdownText text={msg.content} />
                    }
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t border-gray-800 bg-gray-900 flex-shrink-0">
            <div className="flex items-end gap-2 bg-gray-800 rounded-xl px-3 py-2 border border-gray-700 focus-within:border-blue-500 transition-colors">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="質問を入力... (Enterで送信)"
                rows={1}
                className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 focus:outline-none resize-none max-h-24"
                style={{ overflowY: input.split('\n').length > 3 ? 'auto' : 'hidden' }}
              />
              <Button
                size="sm"
                onClick={sendMessage}
                disabled={!input.trim() || streaming}
                className="w-7 h-7 p-0 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 flex-shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
              </Button>
            </div>
            <p className="text-gray-700 text-xs mt-1.5 text-center">
              Shift+Enter で改行
            </p>
          </div>
        </div>
      )}
    </>
  )
}

function WelcomeScreen({ onSuggest }: { onSuggest: (q: string) => void }) {
  const suggestions = [
    'isMatch 関数の書き方を教えて',
    'コンテンツゾーンとは何ですか？',
    'Confirmed / Likely / Template の違いは？',
    'カタログオブジェクトの設定方法',
    'SPA サイトの設定方法は？',
    'ヒューリスティック識別の限界とは？',
  ]

  return (
    <div className="space-y-4">
      <div className="text-center pt-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center mx-auto mb-3">
          <Bot className="w-5 h-5 text-white" />
        </div>
        <p className="text-white text-sm font-medium">MCPアシスタント</p>
        <p className="text-gray-500 text-xs mt-1">
          MCP・このツールの使い方・生成コードについて<br />何でもお聞きください
        </p>
      </div>
      <div className="grid grid-cols-1 gap-1.5">
        {suggestions.map(q => (
          <button
            key={q}
            onClick={() => onSuggest(q)}
            className="text-left text-xs text-gray-400 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-gray-600 rounded-lg px-3 py-2 transition-colors"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}

// Minimal markdown renderer: code blocks, inline code, bold
function MarkdownText({ text }: { text: string }) {
  if (!text) return null

  // Split by code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g)

  return (
    <div className="space-y-2">
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const lines = part.slice(3, -3).split('\n')
          // Remove language identifier on first line if present
          const lang = /^\w+$/.test(lines[0]) ? lines.shift() : ''
          return (
            <pre key={i} className="bg-gray-900 rounded-lg p-2.5 text-xs overflow-x-auto text-green-300 font-mono border border-gray-700">
              {lang && <span className="text-gray-600 text-xs block mb-1">{lang}</span>}
              {lines.join('\n')}
            </pre>
          )
        }
        // Inline formatting
        return (
          <span key={i} className="whitespace-pre-wrap">
            {part.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((seg, j) => {
              if (seg.startsWith('`') && seg.endsWith('`')) {
                return <code key={j} className="bg-gray-700 text-green-300 rounded px-1 text-xs font-mono">{seg.slice(1, -1)}</code>
              }
              if (seg.startsWith('**') && seg.endsWith('**')) {
                return <strong key={j} className="text-white font-semibold">{seg.slice(2, -2)}</strong>
              }
              return seg
            })}
          </span>
        )
      })}
    </div>
  )
}
