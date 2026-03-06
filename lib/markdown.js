/**
 * Minimal markdown → readable plain text converter for watch display.
 * Handles common markdown syntax without a full renderer.
 */

/**
 * Convert markdown string to a watch-readable plain text.
 * Returns an array of { text, indent, bold } line objects.
 */
export function parseMarkdown(md) {
  if (!md) return []

  const lines = md
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')

  const result = []

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]

    // Fenced code blocks — collect until closing ```
    if (raw.trimStart().startsWith('```')) {
      i++
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        result.push({ text: '  ' + lines[i], indent: 1 })
        i++
      }
      continue
    }

    // Headings
    const headingMatch = raw.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const text = stripInline(headingMatch[2]).toUpperCase()
      result.push({ text: level === 1 ? '== ' + text + ' ==' : '-- ' + text, bold: true })
      continue
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(raw.trim())) {
      result.push({ text: '────────────────' })
      continue
    }

    // Blockquote
    const quoteMatch = raw.match(/^>\s?(.*)$/)
    if (quoteMatch) {
      result.push({ text: '| ' + stripInline(quoteMatch[1]), indent: 1 })
      continue
    }

    // Unordered list
    const ulMatch = raw.match(/^(\s*)[-*+]\s+(.*)$/)
    if (ulMatch) {
      const indent = Math.floor(ulMatch[1].length / 2)
      result.push({ text: '  '.repeat(indent) + '• ' + stripInline(ulMatch[2]), indent })
      continue
    }

    // Ordered list
    const olMatch = raw.match(/^(\s*)(\d+)[.)]\s+(.*)$/)
    if (olMatch) {
      const indent = Math.floor(olMatch[1].length / 2)
      result.push({ text: '  '.repeat(indent) + olMatch[2] + '. ' + stripInline(olMatch[3]), indent })
      continue
    }

    // Blank line → spacer
    if (raw.trim() === '') {
      result.push({ text: '' })
      continue
    }

    // Regular paragraph text
    result.push({ text: stripInline(raw) })
  }

  return result
}

/**
 * Strip inline markdown syntax (bold, italic, code, links, images).
 */
function stripInline(text) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '[$1]')   // images → [alt]
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')       // links → text
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')      // ref links → text
    .replace(/`([^`]+)`/g, '$1')                    // inline code
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')           // bold+italic
    .replace(/___(.+?)___/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')               // bold
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')                   // italic
    .replace(/_(.+?)_/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')                   // strikethrough
    .replace(/<!--.*?-->/g, '')                     // HTML comments
    .replace(/<[^>]+>/g, '')                        // HTML tags
    .trim()
}

/**
 * Flatten parsed lines back to a plain string for simple display.
 */
export function toPlainText(parsed) {
  return parsed.map(l => l.text).join('\n')
}
