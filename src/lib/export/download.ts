export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadJSON(filename: string, data: unknown): void {
  downloadFile(filename, JSON.stringify(data, null, 2), 'application/json')
}

export function downloadMarkdown(filename: string, content: string): void {
  downloadFile(filename, content, 'text/markdown')
}

export function downloadJS(filename: string, content: string): void {
  downloadFile(filename, content, 'application/javascript')
}
