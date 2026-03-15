/**
 * NoteScreen — reads and displays a markdown note from watch storage.
 *
 * Params (JSON string): { path: "folder/note.md" }
 *   path = "__mock__" renders the built-in demo note for renderer testing.
 *
 * Notes are stored as text files on the watch after sync.
 * Falls back to fetching from phone (via message) if not cached locally.
 */

import { parseMarkdown } from '../../lib/markdown'

const { messageBuilder, config } = getApp()._options.globalData

const _dev = hmSetting.getDeviceInfo()
const SCREEN_WIDTH = _dev.width || 480
const SCREEN_HEIGHT = _dev.height || 480
// Circular displays (Balance 480×480, Active ~390×450) need a wider margin so
// content stays inside the round bezel at all scroll positions.
const IS_CIRCULAR = SCREEN_WIDTH >= SCREEN_HEIGHT * 0.75
const MARGIN = IS_CIRCULAR ? 48 : 16
const CONTENT_START_Y = IS_CIRCULAR ? 72 : 8
const CONTENT_BOTTOM_PAD = IS_CIRCULAR ? 160 : 48
const FONT_SIZE = 20
const LINE_HEIGHT = FONT_SIZE + 8
const TEXT_COLOR = 0xC9D1D9
const DIM_COLOR = 0x8B949E
const BG_COLOR = 0x0D1117
const HEADING_COLOR = 0x58A6FF
const QUOTE_COLOR = 0x8B949E
const BULLET_COLOR = 0xE3B341
const CODE_BG = 0x161B22
const CODE_COLOR = 0x8B949E
const TABLE_HEADER_COLOR = 0x79C0FF

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

class NoteScreen {
  constructor(paramsStr) {
    try {
      const p = JSON.parse(paramsStr || '{}')
      this.filePath = p.path || ''
    } catch (e) {
      this.filePath = ''
    }
    this.posY = 0
  }

  init() {
    hmUI.setStatusBarVisible(true)
    const name = this.filePath.split('/').pop()
    hmUI.updateStatusBarTitle(name || 'Note')
    hmApp.setScreenKeep(true)

    // Mock mode — render built-in demo note
    if (!this.filePath || this.filePath === '__mock__') {
      this._render(MOCK_MD)
      return
    }

    // Try local storage first
    const content = this._readLocal(this.filePath)
    if (content !== null) {
      this._render(content)
      return
    }

    // Not synced locally — fetch from phone
    this._showLoading()
    messageBuilder.request({
      action: 'get_file',
      path: this.filePath,
    }, {}).then((resp) => {
      if (resp.error) {
        this._showError(resp.error)
      } else {
        this._writeLocal(this.filePath, resp.content)
        hmApp.reloadPage({
          url: 'page/amazfit/NoteScreen',
          param: JSON.stringify({ path: this.filePath }),
        })
      }
    }).catch((err) => {
      this._showError(String(err))
    })
  }

  _render(content) {
    const lines = parseMarkdown(content)

    hmUI.setLayerScrolling(true)

    // Background
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 0, y: 0,
      w: SCREEN_WIDTH, h: 9999,
      color: BG_COLOR,
    })

    this.posY = CONTENT_START_Y

    for (const line of lines) {
      this._addLine(line)
    }

    this.posY += CONTENT_BOTTOM_PAD
  }

  _addLine(line) {
    if (line.text === '') {
      this.posY += Math.floor(LINE_HEIGHT / 2)
      return
    }

    let color = TEXT_COLOR
    if (line.bold) {
      color = HEADING_COLOR
    } else if (line.table && line.header) {
      color = TABLE_HEADER_COLOR
    } else if (line.code) {
      color = CODE_COLOR
    } else if (line.text.startsWith('|')) {
      color = QUOTE_COLOR
    } else if (line.indent && !line.text.startsWith('|') && !line.code) {
      color = BULLET_COLOR
    }

    let effectiveFontSize = FONT_SIZE
    if (line.bold) {
      if (line.level === 1) effectiveFontSize = 24
      else if (line.level === 2) effectiveFontSize = 22
      else effectiveFontSize = 20
    }

    const x = MARGIN + (line.indent || 0) * 12
    const w = SCREEN_WIDTH - x - MARGIN

    const charsPerLine = Math.floor(w / (effectiveFontSize * 0.6)) || 20
    const wrappedLines = Math.ceil(line.text.length / charsPerLine) + 1
    const h = wrappedLines * (effectiveFontSize + 8) + 4

    // Code block: draw background rect behind text
    if (line.code) {
      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x, y: this.posY,
        w, h,
        color: CODE_BG,
      })
    }

    hmUI.createWidget(hmUI.widget.TEXT, {
      x, y: this.posY,
      w, h,
      text: line.text,
      text_size: effectiveFontSize,
      color,
      align_h: hmUI.align.LEFT,
      text_style: line.bold ? hmUI.text_style.ELLIPSIS : hmUI.text_style.WRAP,
    })

    this.posY += h
  }

  _showLoading() {
    const cy = Math.floor(SCREEN_HEIGHT / 2)
    this._loadingWidget = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 0, y: cy - 20,
      w: SCREEN_WIDTH, h: 40,
      text: 'Loading…',
      text_size: FONT_SIZE,
      color: DIM_COLOR,
      align_h: hmUI.align.CENTER_H,
    })
  }

  _showError(msg) {
    const cy = Math.floor(SCREEN_HEIGHT / 2)
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: MARGIN, y: cy - 40,
      w: SCREEN_WIDTH - MARGIN * 2, h: 80,
      text: 'Could not load note:\n' + msg,
      text_size: 16,
      color: 0xF85149,
      align_h: hmUI.align.CENTER_H,
      text_style: hmUI.text_style.WRAP,
    })
  }

  // ─── Local file storage ──────────────────────────────────────────────────

  _storageKey(filePath) {
    // Flatten path into a safe filename: replace / and space with _
    return 'note_' + filePath.replace(/[/\s]/g, '_') + '.txt'
  }

  _readLocal(filePath) {
    try {
      const fname = this._storageKey(filePath)
      const [fsStat, err] = hmFS.stat(fname)
      if (err !== 0 || !fsStat || fsStat.size === 0) return null

      const buf = new ArrayBuffer(fsStat.size)
      const u8 = new Uint8Array(buf)
      const fd = hmFS.open(fname, hmFS.O_RDONLY)
      hmFS.seek(fd, 0, hmFS.SEEK_SET)
      hmFS.read(fd, buf, 0, fsStat.size)
      hmFS.close(fd)

      const u16 = new Uint16Array(buf)
      let str = ''
      for (let i = 0; i < u16.length; i++) str += String.fromCharCode(u16[i])
      return str
    } catch (e) {
      return null
    }
  }

  _writeLocal(filePath, content) {
    try {
      const fname = this._storageKey(filePath)
      const ab = new ArrayBuffer(content.length * 2)
      const view = new Uint16Array(ab)
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

// ─── Page lifecycle ────────────────────────────────────────────────────────────

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
