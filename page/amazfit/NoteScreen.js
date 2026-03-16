/**
 * NoteScreen — reads and displays a markdown note from watch storage.
 *
 * Rendering: hmUI.widget.SCROLL_LIST with pre-word-wrapped single-display-line
 * items. This makes one createWidget() call for any document length and relies
 * on the native virtual-list renderer (only visible rows drawn), eliminating
 * the per-line widget-creation lag of the previous approach.
 *
 * Params (JSON string): { path: "folder/note.md" }
 *   path = "__mock__" renders the built-in demo note for renderer testing.
 */

import { parseMarkdown } from '../../lib/markdown'

const { messageBuilder } = getApp()._options.globalData

const _dev = hmSetting.getDeviceInfo()
const SCREEN_WIDTH  = _dev.width  || 480
const SCREEN_HEIGHT = _dev.height || 480
// Circular displays (Balance 480×480) need wide margins so content stays
// inside the round bezel at all scroll positions.
const IS_CIRCULAR     = SCREEN_WIDTH >= SCREEN_HEIGHT * 0.75
const MARGIN          = IS_CIRCULAR ? 48 : 16
const CONTENT_START_Y = IS_CIRCULAR ? 72 : 8

// ── Colours ────────────────────────────────────────────────────────────────
const TEXT_COLOR         = 0xC9D1D9
const DIM_COLOR          = 0x8B949E
const BG_COLOR           = 0x000000
const HEADING_COLOR      = 0x58A6FF
const QUOTE_COLOR        = 0x8B949E
const BULLET_COLOR       = 0xE3B341
const CODE_BG            = 0x161B22
const CODE_COLOR         = 0x8B949E
const TABLE_HEADER_COLOR = 0x79C0FF

// ── SCROLL_LIST type IDs (unique per visual style) ─────────────────────────
const T_NORMAL  = 1   // regular paragraph
const T_H1      = 2   // # heading 1
const T_H2      = 3   // ## heading 2
const T_H3      = 4   // ### heading 3+
const T_CODE    = 5   // fenced code line
const T_QUOTE   = 6   // > blockquote
const T_BULLET  = 7   // list item (indent 1)
const T_BULLET2 = 8   // nested list (indent 2+)
const T_TABLE   = 9   // | table header row
const T_SPACER  = 10  // blank line
const T_NAV     = 11  // previous / next page button

// Source lines shown per page.  Limits SCROLL_LIST to ~80 display items,
// keeping createWidget() fast even when SCROLL_LIST renders eagerly.
const LINES_PER_PAGE = 40

// ── Proportional scaling helper (reference design width: 480px) ────────────
const _sc = SCREEN_WIDTH / 600
const sp  = n => Math.max(8, Math.round(n * _sc))

// ── Font sizes & row heights ───────────────────────────────────────────────
const FONT_SIZE = sp(40)
const H1_SIZE   = sp(48)
const H2_SIZE   = sp(44)
const CODE_SIZE = sp(32)

const LH        = FONT_SIZE + sp(10)  // normal line
const LH_H1     = H1_SIZE   + sp(14)
const LH_H2     = H2_SIZE   + sp(12)
const LH_H3     = FONT_SIZE + sp(12)
const LH_CODE   = CODE_SIZE + sp(10)
const LH_SPACER = sp(12)              // blank line gap

const CONTENT_W = SCREEN_WIDTH - MARGIN * 2

// ── Module-level helpers ───────────────────────────────────────────────────

/**
 * Word-wrap `text` to at most `maxChars` chars per line.
 * Returns an array of single-display-line strings.
 */
function wordWrap(text, maxChars) {
  if (!text) return ['']
  if (text.length <= maxChars) return [text]
  const words = text.split(' ')
  const result = []
  let line = ''
  for (const word of words) {
    const candidate = line ? line + ' ' + word : word
    if (candidate.length <= maxChars) {
      line = candidate
    } else {
      if (line) result.push(line)
      if (word.length > maxChars) {
        // hard-split a token that is itself too long
        for (let i = 0; i < word.length; i += maxChars) {
          const chunk = word.slice(i, i + maxChars)
          if (i + maxChars < word.length) result.push(chunk)
          else line = chunk
        }
      } else {
        line = word
      }
    }
  }
  if (line) result.push(line)
  return result.length > 0 ? result : ['']
}

/**
 * Collapse a flat items array (each with .tid) into contiguous-range
 * type descriptors required by SCROLL_LIST.data_type_config.
 */
function buildTypeRanges(items) {
  if (!items.length) return []
  const ranges = []
  let s = 0, tid = items[0].tid
  for (let i = 1; i <= items.length; i++) {
    if (i === items.length || items[i].tid !== tid) {
      ranges.push({ start: s, end: i - 1, type_id: tid })
      if (i < items.length) { s = i; tid = items[i].tid }
    }
  }
  return ranges
}

// ── SCROLL_LIST item_config ────────────────────────────────────────────────
// One entry per type ID.  text_view positions are relative to the item origin.
const ITEM_CONFIG = [
  {
    type_id: T_NORMAL,
    item_height: LH, item_bg_color: BG_COLOR, item_bg_radius: 0,
    text_view_count: 1,
    text_view: [{ x: MARGIN, y: 0, w: CONTENT_W, h: LH,
      key: 'text', align_h: hmUI.align.LEFT, color: TEXT_COLOR, text_size: FONT_SIZE }],
  },
  {
    type_id: T_H1,
    item_height: LH_H1, item_bg_color: BG_COLOR, item_bg_radius: 0,
    text_view_count: 1,
    text_view: [{ x: MARGIN, y: 0, w: CONTENT_W, h: LH_H1,
      key: 'text', align_h: hmUI.align.LEFT, color: HEADING_COLOR, text_size: H1_SIZE }],
  },
  {
    type_id: T_H2,
    item_height: LH_H2, item_bg_color: BG_COLOR, item_bg_radius: 0,
    text_view_count: 1,
    text_view: [{ x: MARGIN, y: 0, w: CONTENT_W, h: LH_H2,
      key: 'text', align_h: hmUI.align.LEFT, color: HEADING_COLOR, text_size: H2_SIZE }],
  },
  {
    type_id: T_H3,
    item_height: LH_H3, item_bg_color: BG_COLOR, item_bg_radius: 0,
    text_view_count: 1,
    text_view: [{ x: MARGIN, y: 0, w: CONTENT_W, h: LH_H3,
      key: 'text', align_h: hmUI.align.LEFT, color: HEADING_COLOR, text_size: FONT_SIZE }],
  },
  {
    type_id: T_CODE,
    item_height: LH_CODE, item_bg_color: CODE_BG, item_bg_radius: 0,
    text_view_count: 1,
    text_view: [{ x: MARGIN + 4, y: 0, w: CONTENT_W - 8, h: LH_CODE,
      key: 'text', align_h: hmUI.align.LEFT, color: CODE_COLOR, text_size: CODE_SIZE }],
  },
  {
    type_id: T_QUOTE,
    item_height: LH, item_bg_color: BG_COLOR, item_bg_radius: 0,
    text_view_count: 1,
    text_view: [{ x: MARGIN + 8, y: 0, w: CONTENT_W - 8, h: LH,
      key: 'text', align_h: hmUI.align.LEFT, color: QUOTE_COLOR, text_size: FONT_SIZE }],
  },
  {
    type_id: T_BULLET,
    item_height: LH, item_bg_color: BG_COLOR, item_bg_radius: 0,
    text_view_count: 1,
    text_view: [{ x: MARGIN + 12, y: 0, w: CONTENT_W - 12, h: LH,
      key: 'text', align_h: hmUI.align.LEFT, color: BULLET_COLOR, text_size: FONT_SIZE }],
  },
  {
    type_id: T_BULLET2,
    item_height: LH, item_bg_color: BG_COLOR, item_bg_radius: 0,
    text_view_count: 1,
    text_view: [{ x: MARGIN + 24, y: 0, w: CONTENT_W - 24, h: LH,
      key: 'text', align_h: hmUI.align.LEFT, color: BULLET_COLOR, text_size: FONT_SIZE }],
  },
  {
    type_id: T_TABLE,
    item_height: LH, item_bg_color: BG_COLOR, item_bg_radius: 0,
    text_view_count: 1,
    text_view: [{ x: MARGIN, y: 0, w: CONTENT_W, h: LH,
      key: 'text', align_h: hmUI.align.LEFT, color: TABLE_HEADER_COLOR, text_size: FONT_SIZE }],
  },
  // Spacer — tiny invisible text_view so the engine always has something to bind
  {
    type_id: T_SPACER,
    item_height: LH_SPACER, item_bg_color: BG_COLOR, item_bg_radius: 0,
    text_view_count: 1,
    text_view: [{ x: 0, y: 0, w: 1, h: 1, key: 'text', color: BG_COLOR, text_size: 8 }],
  },
  // Navigation row (previous / next page)
  {
    type_id: T_NAV,
    item_height: sp(68), item_bg_color: 0x161B22, item_bg_radius: 8,
    text_view_count: 1,
    text_view: [{ x: MARGIN, y: sp(20), w: CONTENT_W, h: FONT_SIZE + 4,
      key: 'text', align_h: hmUI.align.LEFT, color: 0x58A6FF, text_size: FONT_SIZE }],
  },
]

// ── Demo note ──────────────────────────────────────────────────────────────
const MOCK_MD = `# Git Notes Demo

This is a long paragraph to verify that text wrapping works correctly on the narrow watch screen. It should wrap across multiple lines without scrolling sideways.

## Getting Started

Configure the app using the **Zepp** companion app on your phone. Then tap Sync to download your notes.

### Supported Formats

Inline \`code\`, **bold text**, and [link text](https://example.com) are all stripped to plain text for display.

- Unordered list item one
- Second item with more text
  - Nested item (level 2)
  - Another nested item

1. First ordered step
2. Second ordered step
3. Third ordered step

> This is a blockquote. It appears in grey with a leading pipe character.

## Table Example

| Format | Supported |
|--------|-----------|
| Bold   | Yes       |
| Tables | Yes       |
| Images | No        |

---

\`\`\`
function hello(name) {
  return "Hello, " + name
}
\`\`\`
`

// ── Page class ─────────────────────────────────────────────────────────────

class NoteScreen {
  constructor(paramsStr) {
    try {
      const p = JSON.parse(paramsStr || '{}')
      this.filePath = p.path || ''
      this.page     = p.page  || 0
    } catch (e) {
      this.filePath = ''
      this.page     = 0
    }
  }

  init() {
    hmUI.setStatusBarVisible(true)
    const name = this.filePath.split('/').pop()
    hmUI.updateStatusBarTitle(name || 'Note')
    hmApp.setScreenKeep(true)

    if (!this.filePath || this.filePath === '__mock__') {
      this._render(MOCK_MD)
      return
    }

    const content = this._readLocal(this.filePath)
    if (content !== null) {
      this._render(content)
      return
    }

    // Not cached — fetch from phone
    this._showLoading()
    messageBuilder.request({ action: 'get_file', path: this.filePath }, {})
      .then((resp) => {
        if (resp.error) {
          this._showError(resp.error)
        } else {
          this._writeLocal(this.filePath, resp.content)
          hmApp.reloadPage({
            url: 'page/amazfit/NoteScreen',
            param: JSON.stringify({ path: this.filePath }),
          })
        }
      })
      .catch((err) => { this._showError(String(err)) })
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  _render(content) {
    // ── Slice to the current page of source lines ────────────────────────────
    const sourceLines = content.split('\n')
    const totalPages  = Math.ceil(sourceLines.length / LINES_PER_PAGE) || 1
    const page        = this.page
    const hasPrev     = page > 0
    const hasNext     = page < totalPages - 1

    const pageText = sourceLines
      .slice(page * LINES_PER_PAGE, (page + 1) * LINES_PER_PAGE)
      .join('\n')

    // Build display items for this page only (~80 items max)
    const items = this._buildItems(parseMarkdown(pageText))

    // Inject navigation rows so the user can page through the note
    if (hasPrev) {
      items.unshift({ text: '← Page ' + page + ' of ' + totalPages, tid: T_NAV })
    }
    if (hasNext) {
      items.push({ text: 'Page ' + (page + 2) + ' of ' + totalPages + ' →', tid: T_NAV })
    }

    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 0, y: 0, w: SCREEN_WIDTH, h: SCREEN_HEIGHT, color: BG_COLOR,
    })

    if (items.length === 0) {
      this._showError('Empty note')
      return
    }

    const typeRanges = buildTypeRanges(items)
    const prevIdx    = hasPrev ? 0 : -1
    const nextIdx    = hasNext ? items.length - 1 : -1

    hmUI.createWidget(hmUI.widget.SCROLL_LIST, {
      x: 0,
      y: CONTENT_START_Y,
      w: SCREEN_WIDTH,
      h: SCREEN_HEIGHT - CONTENT_START_Y,
      item_space: 0,
      item_config: ITEM_CONFIG,
      item_config_count: ITEM_CONFIG.length,
      data_array: items,
      data_count: items.length,
      data_type_config: typeRanges,
      data_type_config_count: typeRanges.length,
      item_click_func: (list, idx) => {
        if (idx === prevIdx) {
          hmApp.reloadPage({ url: 'page/amazfit/NoteScreen',
            param: JSON.stringify({ path: this.filePath, page: page - 1 }) })
        } else if (idx === nextIdx) {
          hmApp.reloadPage({ url: 'page/amazfit/NoteScreen',
            param: JSON.stringify({ path: this.filePath, page: page + 1 }) })
        }
      },
    })
  }

  /**
   * Convert parsed markdown lines into SCROLL_LIST data items.
   * Each item is one pre-word-wrapped display line: { text, tid }.
   * This gives every item a fixed pixel height (per its type), which is
   * required by SCROLL_LIST.
   */
  _buildItems(parsedLines) {
    const items = []
    for (const line of parsedLines) {
      if (line.text === '') {
        items.push({ text: '', tid: T_SPACER })
        continue
      }

      const tid      = this._typeId(line)
      const fontSize = tid === T_H1 ? H1_SIZE : tid === T_H2 ? H2_SIZE : tid === T_CODE ? CODE_SIZE : FONT_SIZE
      const indent   = tid === T_BULLET ? 12 : tid === T_BULLET2 ? 24 : (tid === T_QUOTE || tid === T_CODE) ? 8 : 0
      const colW     = CONTENT_W - indent
      const maxChars = Math.max(6, Math.floor(colW / (fontSize * 0.6)))

      for (const sub of wordWrap(line.text, maxChars)) {
        items.push({ text: sub, tid })
      }
    }
    return items
  }

  _typeId(line) {
    if (line.bold && line.level === 1) return T_H1
    if (line.bold && line.level === 2) return T_H2
    if (line.bold) return T_H3
    if (line.code) return T_CODE
    if (line.table && line.header) return T_TABLE
    if (line.indent >= 2 && !line.text.startsWith('|')) return T_BULLET2
    if (line.indent >= 1 && !line.text.startsWith('|')) return T_BULLET
    if (line.text.startsWith('|')) return T_QUOTE
    return T_NORMAL
  }

  // ── Status widgets ────────────────────────────────────────────────────────

  _showLoading() {
    const cy = Math.floor(SCREEN_HEIGHT / 2)
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: 0, y: cy - 20, w: SCREEN_WIDTH, h: 40,
      text: 'Loading…', text_size: FONT_SIZE,
      color: DIM_COLOR, align_h: hmUI.align.CENTER_H,
    })
  }

  _showError(msg) {
    const cy = Math.floor(SCREEN_HEIGHT / 2)
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: MARGIN, y: cy - 40, w: CONTENT_W, h: 80,
      text: 'Could not load note:\n' + msg,
      text_size: sp(32), color: 0xF85149,
      align_h: hmUI.align.CENTER_H,
      text_style: hmUI.text_style.WRAP,
    })
  }

  // ── Local file storage ────────────────────────────────────────────────────

  _storageKey(filePath) {
    return 'note_' + filePath.replace(/[/\s]/g, '_') + '.txt'
  }

  _readLocal(filePath) {
    try {
      const fname = this._storageKey(filePath)
      const [fsStat, err] = hmFS.stat(fname)
      if (err !== 0 || !fsStat || fsStat.size === 0) return null

      const buf = new ArrayBuffer(fsStat.size)
      const fd  = hmFS.open(fname, hmFS.O_RDONLY)
      hmFS.seek(fd, 0, hmFS.SEEK_SET)
      hmFS.read(fd, buf, 0, fsStat.size)
      hmFS.close(fd)

      const u16 = new Uint16Array(buf)
      const CHUNK = 2048
      const chunks = []
      for (let i = 0; i < u16.length; i += CHUNK) {
        chunks.push(String.fromCharCode.apply(null, u16.subarray(i, i + CHUNK)))
      }
      return chunks.join('')
    } catch (e) {
      return null
    }
  }

  _writeLocal(filePath, content) {
    try {
      const fname = this._storageKey(filePath)
      const ab    = new ArrayBuffer(content.length * 2)
      const view  = new Uint16Array(ab)
      for (let i = 0; i < content.length; i++) view[i] = content.charCodeAt(i)

      const fd = hmFS.open(fname, hmFS.O_CREAT | hmFS.O_RDWR | hmFS.O_TRUNC)
      hmFS.seek(fd, 0, hmFS.SEEK_SET)
      hmFS.write(fd, ab, 0, ab.byteLength)
      hmFS.close(fd)
    } catch (e) {
      // non-fatal
    }
  }
}

// ── Page lifecycle ─────────────────────────────────────────────────────────

Page({
  onInit(params) {
    try {
      new NoteScreen(params).init()
    } catch (e) {
      console.log('NoteScreen error: ' + e)
    }
  },

  onDestroy() {
    hmApp.setScreenKeep(false)
  },
})
