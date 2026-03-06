/**
 * FileBrowser page — navigates the notes folder tree.
 *
 * Params (JSON string): { path: "some/folder" }
 *   - path = "" means the repo root
 *
 * Reads the file index from ConfigStorage and shows entries
 * for the current path level. Directories navigate deeper;
 * files open NoteScreen.
 */

const { messageBuilder, config } = getApp()._options.globalData

const SCREEN_WIDTH = hmSetting.getDeviceInfo().width || 480
const ITEM_HEIGHT = 72
const FONT_SIZE = 18
const TEXT_COLOR = 0xC9D1D9
const DIM_COLOR = 0x8B949E
const BG_COLOR = 0x0D1117
const ACCENT = 0x58A6FF
const DIR_COLOR = 0xE3B341

class FileBrowser {
  constructor(paramsStr) {
    try {
      const p = JSON.parse(paramsStr || '{}')
      this.currentPath = p.path || ''
    } catch (e) {
      this.currentPath = ''
    }
    this.posY = 0
  }

  init() {
    hmUI.setStatusBarVisible(true)
    const title = this.currentPath
      ? this.currentPath.split('/').pop()
      : 'Git Notes'
    hmUI.updateStatusBarTitle(title)
    hmApp.setScreenKeep(true)

    const fileIndex = config.get('fileIndex', null)
    if (!fileIndex) {
      this._buildEmpty()
      return
    }

    const entries = this._entriesForPath(fileIndex)
    this._build(entries)
  }

  /**
   * Filter the flat file index to direct children of currentPath.
   */
  _entriesForPath(nodes) {
    const prefix = this.currentPath ? this.currentPath + '/' : ''
    const seen = new Set()
    const result = []

    for (const node of nodes) {
      if (!node.path.startsWith(prefix)) continue
      const relative = node.path.slice(prefix.length)
      const slashIdx = relative.indexOf('/')

      if (slashIdx === -1) {
        // Direct child file
        if (!seen.has(node.path)) {
          seen.add(node.path)
          result.push(node)
        }
      } else {
        // Child folder — add as a synthetic dir entry
        const dirName = relative.slice(0, slashIdx)
        const dirPath = prefix + dirName
        if (!seen.has(dirPath)) {
          seen.add(dirPath)
          result.push({ path: dirPath, name: dirName, type: 'dir' })
        }
      }
    }

    // Sort: dirs first, then files alphabetically
    result.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return result
  }

  _build(entries) {
    // Background
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 0, y: 0,
      w: SCREEN_WIDTH, h: 9999,
      color: BG_COLOR,
    })

    if (entries.length === 0) {
      this._buildEmpty()
      return
    }

    hmUI.setLayerScrolling(true)

    // Back row (if inside a subfolder)
    if (this.currentPath) {
      this._addRow({
        icon: '←',
        label: '..',
        color: DIM_COLOR,
        onTap: () => {
          const parts = this.currentPath.split('/')
          parts.pop()
          hmApp.reloadPage({
            url: 'page/amazfit/FileBrowser',
            param: JSON.stringify({ path: parts.join('/') }),
          })
        },
      })
    }

    for (const entry of entries) {
      const isDir = entry.type === 'dir'
      this._addRow({
        icon: isDir ? '📁' : '📄',
        label: entry.name,
        color: isDir ? DIR_COLOR : TEXT_COLOR,
        onTap: () => {
          if (isDir) {
            hmApp.gotoPage({
              url: 'page/amazfit/FileBrowser',
              param: JSON.stringify({ path: entry.path }),
            })
          } else {
            hmApp.gotoPage({
              url: 'page/amazfit/NoteScreen',
              param: JSON.stringify({ path: entry.path }),
            })
          }
        },
      })
    }

    // Sync button at the bottom
    this._addGap(16)
    this._addSyncButton()
    this._addGap(32)

  }

  _addRow({ icon, label, color, onTap }) {
    const y = this.posY
    const margin = 16

    // Row background (tap target)
    const bg = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 0, y,
      w: SCREEN_WIDTH, h: ITEM_HEIGHT,
      color: BG_COLOR,
    })

    // Separator line
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: margin, y: y + ITEM_HEIGHT - 1,
      w: SCREEN_WIDTH - margin * 2, h: 1,
      color: 0x21262D,
    })

    // Icon (text glyph)
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: margin, y: y + (ITEM_HEIGHT - FONT_SIZE) / 2,
      w: FONT_SIZE + 8, h: FONT_SIZE + 4,
      text: icon,
      text_size: FONT_SIZE,
      color: color,
      align_h: hmUI.align.LEFT,
    })

    // Label
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: margin + FONT_SIZE + 12, y: y + (ITEM_HEIGHT - FONT_SIZE) / 2,
      w: SCREEN_WIDTH - margin * 2 - FONT_SIZE - 12,
      h: FONT_SIZE + 4,
      text: label,
      text_size: FONT_SIZE,
      color: color,
      align_h: hmUI.align.LEFT,
      text_style: hmUI.text_style.ELLIPSIS,
    })

    // Tap area
    const tap = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 0, y,
      w: SCREEN_WIDTH, h: ITEM_HEIGHT,
      color: 0x00000000,
      alpha: 0,
    })
    tap.addEventListener(hmUI.event.CLICK_DOWN, () => {})
    tap.addEventListener(hmUI.event.CLICK_UP, onTap)

    this.posY += ITEM_HEIGHT
  }

  _addSyncButton() {
    const y = this.posY
    const h = 56
    const margin = 24

    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: margin, y,
      w: SCREEN_WIDTH - margin * 2, h,
      color: 0x161B22,
      radius: 12,
    })

    hmUI.createWidget(hmUI.widget.TEXT, {
      x: margin, y: y + (h - FONT_SIZE) / 2,
      w: SCREEN_WIDTH - margin * 2, h: FONT_SIZE + 4,
      text: '⟳  Sync Notes',
      text_size: FONT_SIZE,
      color: ACCENT,
      align_h: hmUI.align.CENTER_H,
    })

    const tap = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: margin, y,
      w: SCREEN_WIDTH - margin * 2, h,
      color: 0x00000000,
      alpha: 0,
    })
    tap.addEventListener(hmUI.event.CLICK_UP, () => {
      hmApp.gotoPage({ url: 'page/amazfit/SyncScreen' })
    })

    this.posY += h
  }

  _addGap(height) {
    this.posY += height
  }

  _buildEmpty() {
    hmUI.setLayerScrolling(false)
    const cy = Math.floor((hmSetting.getDeviceInfo().height || 480) / 2)

    hmUI.createWidget(hmUI.widget.TEXT, {
      x: 0, y: cy - 60,
      w: SCREEN_WIDTH, h: 40,
      text: 'No notes synced yet',
      text_size: FONT_SIZE,
      color: DIM_COLOR,
      align_h: hmUI.align.CENTER_H,
    })

    hmUI.createWidget(hmUI.widget.TEXT, {
      x: 0, y: cy - 10,
      w: SCREEN_WIDTH, h: 36,
      text: 'Open the Zepp app to',
      text_size: 16,
      color: DIM_COLOR,
      align_h: hmUI.align.CENTER_H,
    })
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: 0, y: cy + 22,
      w: SCREEN_WIDTH, h: 36,
      text: 'configure and sync',
      text_size: 16,
      color: DIM_COLOR,
      align_h: hmUI.align.CENTER_H,
    })

    // Sync button
    const bY = cy + 70
    const bH = 52
    const bMargin = 40
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: bMargin, y: bY,
      w: SCREEN_WIDTH - bMargin * 2, h: bH,
      color: 0x238636,
      radius: 10,
    })
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: bMargin, y: bY + (bH - FONT_SIZE) / 2,
      w: SCREEN_WIDTH - bMargin * 2, h: FONT_SIZE + 4,
      text: 'Sync Now',
      text_size: FONT_SIZE,
      color: 0xFFFFFF,
      align_h: hmUI.align.CENTER_H,
    })
    const tap = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: bMargin, y: bY,
      w: SCREEN_WIDTH - bMargin * 2, h: bH,
      color: 0x00000000, alpha: 0,
    })
    tap.addEventListener(hmUI.event.CLICK_UP, () => {
      hmApp.gotoPage({ url: 'page/amazfit/SyncScreen' })
    })
  }
}

// ─── Page lifecycle ────────────────────────────────────────────────────────────

Page({
  onInit(params) {
    try {
      new FileBrowser(params).init()
    } catch (e) {
      console.log('FileBrowser error: ' + e)
    }
  },

  onDestroy() {
    hmApp.setScreenKeep(false)
  },
})
