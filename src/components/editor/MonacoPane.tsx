'use client'

import dynamic from 'next/dynamic'

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

interface MonacoPaneProps {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
}

export function MonacoPane({ value, onChange, readOnly = false }: MonacoPaneProps) {
  return (
    <MonacoEditor
      height="100%"
      defaultLanguage="javascript"
      value={value}
      onChange={(val) => onChange?.(val ?? '')}
      theme="vs-dark"
      options={{
        readOnly,
        fontSize: 13,
        fontFamily: '"Geist Mono", "Fira Code", monospace',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        lineNumbers: 'on',
        renderLineHighlight: 'line',
        padding: { top: 16, bottom: 16 },
        scrollbar: { vertical: 'auto', horizontal: 'auto' },
        wordWrap: 'on',
        folding: true,
        tabSize: 2,
      }}
    />
  )
}
