/**
 * NoteScreen — reads and displays a markdown note from watch storage.
 *
 * Params (JSON string): { path: "folder/note.md" }
 *
 * Notes are stored as text files on the watch after sync.
 * Falls back to fetching from phone (via message) if not cached locally.
 */

import { parseMarkdown, toPlainText } from '../../lib/markdown'

const { messageBuilder, config } = getApp()._options.globalData

const SCREEN_WIDTH = hmSetting.getDeviceInfo().width || 480
const SCREEN_HEIGHT = hmSetting.getDeviceInfo().height || 480
const MARGIN = 16
const FONT_SIZE = 18
const LINE_HEIGHT = FONT_SIZE + 8
const TEXT_COLOR = 0xC9D1D9
const DIM_COLOR = 0x8B949E
const BG_COLOR = 0x0D1117
const HEADING_COLOR = 0x58A6FF
const QUOTE_COLOR = 0x8B949E
const BULLET_COLOR = 0xE3B341

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
      this._clearWidgets()
      if (resp.error) {
        this._showError(resp.error)
      } else {
        // Cache locally for next time
        this._writeLocal(this.filePath, resp.content)
        this._render(resp.content)
      }
    }).catch((err) => {
      this._clearWidgets()
      this._showError(String(err))
    })
  }

  _render(content) {
    const parsed = parseMarkdown(content)
    const text = toPlainText(parsed)
    const lines = parsed

    hmUI.setLayerScrolling(true)

    // Background
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 0, y: 0,
      w: SCREEN_WIDTH, h: 9999,
      color: BG_COLOR,
    })

    this.posY = 8

    for (const line of lines) {
      this._addLine(line)
    }

    this.posY += 48
  }

  _addLine(line) {
    if (line.text === '') {
      this.posY += Math.floor(LINE_HEIGHT / 2)
      return
    }

    let color = TEXT_COLOR
    if (line.bold) color = HEADING_COLOR
    else if (line.indent) color = (line.text.startsWith('|') ? QUOTE_COLOR : TEXT_COLOR)

    const effectiveFontSize = line.bold ? FONT_SIZE + 2 : FONT_SIZE
    const x = MARGIN + (line.indent || 0) * 12
    const w = SCREEN_WIDTH - x - MARGIN

    // Estimate lines needed based on character count
    const charsPerLine = Math.floor(w / (effectiveFontSize * 0.6)) || 20
    const wrappedLines = Math.ceil(line.text.length / charsPerLine) || 1
    const h = wrappedLines * (effectiveFontSize + 8) + 4

    hmUI.createWidget(hmUI.widget.TEXT, {
      x, y: this.posY,
      w, h,
      text: line.text,
      text_size: effectiveFontSize,
      color,
      align_h: hmUI.align.LEFT,
      text_style: hmUI.text_style.NONE,
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

  _clearWidgets() {
    // Reload page to clear all widgets
    // (ZeppOS v1 doesn't have a bulk widget removal API)
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
      text_style: hmUI.text_style.NONE,
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

// ─── Storage helpers exposed for SyncScreen ──────────────────────────────────

export function writeNoteFile(filePath, content) {
  const fname = 'note_' + filePath.replace(/[/\s]/g, '_') + '.txt'
  try {
    const ab = new ArrayBuffer(content.length * 2)
    const view = new Uint16Array(ab)
    for (let i = 0; i < content.length; i++) view[i] = content.charCodeAt(i)

    const fd = hmFS.open(fname, hmFS.O_CREAT | hmFS.O_RDWR | hmFS.O_TRUNC)
    hmFS.seek(fd, 0, hmFS.SEEK_SET)
    hmFS.write(fd, ab, 0, ab.byteLength)
    hmFS.close(fd)
    return true
  } catch (e) {
    return false
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
