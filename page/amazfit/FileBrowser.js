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

const _devInfo = hmSetting.getDeviceInfo()
const SCREEN_WIDTH  = _devInfo.width  || 480
const SCREEN_HEIGHT = _devInfo.height || 480
const IS_CIRCULAR   = SCREEN_WIDTH >= SCREEN_HEIGHT * 0.75
const MARGIN        = IS_CIRCULAR ? 48 : 16
const _sc           = SCREEN_WIDTH / 600
const sp            = n => Math.max(8, Math.round(n * _sc))
const ITEM_HEIGHT   = sp(88)
const FONT_SIZE     = sp(36)
const TEXT_COLOR = 0xC9D1D9
const DIM_COLOR = 0x8B949E
const BG_COLOR = 0x000000
const ACCENT = 0x58A6FF
const DIR_COLOR = 0xE3B341
const STAR_ZONE_W    = sp(44)
const RECENTS_MAX    = 5
const STAR_COLOR_ON  = 0xE3B341
const STAR_COLOR_OFF = 0x4A4F57
// Max entries rendered per page — keeps widget count under device limits
const PAGE_SIZE = 15

class FileBrowser {
  constructor(paramsStr) {
    try {
      const p = JSON.parse(paramsStr || '{}')
      this.currentPath = p.path || ''
      this.offset = p.offset || 0
    } catch (e) {
      this.currentPath = ''
      this.offset = 0
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

    const isRoot = this.currentPath === ''
    const pageStart = this.offset

    if (!isRoot) {
      // Back row
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

    if (isRoot) {
      const fileIndex  = config.get('fileIndex', [])
      const validPaths = new Set(fileIndex.map(n => n.path))

      // ── Recents ──────────────────────────────────────────────────
      const recents = config.get('recentFiles', []).filter(r => validPaths.has(r.path))
      if (recents.length > 0) {
        this._addSectionHeader('RECENT')
        for (const r of recents) {
          this._addRow({ icon: '📄', label: r.name, color: TEXT_COLOR,
            onTap: () => this._openFile(r) })
        }
      }

      // ── Favorites ─────────────────────────────────────────────────
      const favs = config.get('favoriteFiles', []).filter(f => validPaths.has(f.path))
      if (favs.length > 0) {
        this._addSectionHeader('FAVORITES')
        for (const f of favs) {
          this._addRow({ icon: '📄', label: f.name, color: TEXT_COLOR,
            onTap: () => this._openFile(f),
            showStar: true, starred: true,
            onStarTap: () => this._toggleFavorite(f) })
        }
      }

      // ── All Notes (paginated) ──────────────────────────────────────
      this._addSectionHeader('NOTES')
      const favSet = new Set(favs.map(f => f.path))
      const pageEntries = entries.slice(pageStart, pageStart + PAGE_SIZE)

      for (const entry of pageEntries) {
        const isDir = entry.type === 'dir'
        this._addRow({
          icon: isDir ? '📁' : '📄',
          label: entry.name,
          color: isDir ? DIR_COLOR : TEXT_COLOR,
          onTap: () => isDir ? this._openDir(entry) : this._openFile(entry),
          showStar: !isDir,
          starred: !isDir && favSet.has(entry.path),
          onStarTap: !isDir ? () => this._toggleFavorite(entry) : null,
        })
      }

      if (pageStart > 0) {
        this._addRow({
          icon: '←', label: 'Previous',
          color: ACCENT,
          onTap: () => hmApp.reloadPage({
            url: 'page/amazfit/FileBrowser',
            param: JSON.stringify({ path: '', offset: pageStart - PAGE_SIZE }),
          }),
        })
      }
      if (entries.length > pageStart + PAGE_SIZE) {
        const remaining = entries.length - pageStart - PAGE_SIZE
        this._addRow({
          icon: '→', label: remaining + ' more',
          color: ACCENT,
          onTap: () => hmApp.reloadPage({
            url: 'page/amazfit/FileBrowser',
            param: JSON.stringify({ path: '', offset: pageStart + PAGE_SIZE }),
          }),
        })
      }

    } else {
      // Subfolder — paginated, no sections, no stars
      const pageEntries = entries.slice(pageStart, pageStart + PAGE_SIZE)

      if (pageStart > 0) {
        this._addRow({
          icon: '←', label: 'Previous',
          color: ACCENT,
          onTap: () => hmApp.reloadPage({
            url: 'page/amazfit/FileBrowser',
            param: JSON.stringify({ path: this.currentPath, offset: pageStart - PAGE_SIZE }),
          }),
        })
      }

      for (const entry of pageEntries) {
        const isDir = entry.type === 'dir'
        this._addRow({
          icon: isDir ? '📁' : '📄',
          label: entry.name,
          color: isDir ? DIR_COLOR : TEXT_COLOR,
          onTap: () => isDir ? this._openDir(entry) : this._openFile(entry),
        })
      }

      if (entries.length > pageStart + PAGE_SIZE) {
        const remaining = entries.length - pageStart - PAGE_SIZE
        this._addRow({
          icon: '→', label: remaining + ' more',
          color: ACCENT,
          onTap: () => hmApp.reloadPage({
            url: 'page/amazfit/FileBrowser',
            param: JSON.stringify({ path: this.currentPath, offset: pageStart + PAGE_SIZE }),
          }),
        })
      }
    }

    this._addGap(16)
    this._addSyncButton()
    this._addGap(32)
  }

  _addRow({ icon, label, color, onTap, showStar = false, starred = false, onStarTap = null }) {
    const y = this.posY
    const margin = MARGIN

    // Row background
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
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
      w: SCREEN_WIDTH - margin * 2 - FONT_SIZE - 12 - (showStar ? STAR_ZONE_W : 0),
      h: FONT_SIZE + 4,
      text: label,
      text_size: FONT_SIZE,
      color: color,
      align_h: hmUI.align.LEFT,
      text_style: hmUI.text_style.ELLIPSIS,
    })

    // Tap area (shrunk when star zone present)
    const tap = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 0, y,
      w: showStar ? SCREEN_WIDTH - STAR_ZONE_W : SCREEN_WIDTH,
      h: ITEM_HEIGHT,
      color: 0x00000000,
      alpha: 0,
    })
    tap.addEventListener(hmUI.event.CLICK_DOWN, () => {})
    tap.addEventListener(hmUI.event.CLICK_UP, onTap)

    // Star zone
    if (showStar) {
      const starX = SCREEN_WIDTH - MARGIN - STAR_ZONE_W
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: starX, y: y + (ITEM_HEIGHT - FONT_SIZE) / 2,
        w: STAR_ZONE_W, h: FONT_SIZE + 4,
        text: starred ? '★' : '☆',
        text_size: FONT_SIZE,
        color: starred ? STAR_COLOR_ON : STAR_COLOR_OFF,
        align_h: hmUI.align.CENTER_H,
      })
      const starTap = hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: starX, y, w: STAR_ZONE_W + MARGIN, h: ITEM_HEIGHT,
        color: 0x00000000, alpha: 0,
      })
      starTap.addEventListener(hmUI.event.CLICK_DOWN, () => {})
      starTap.addEventListener(hmUI.event.CLICK_UP, onStarTap)
    }

    this.posY += ITEM_HEIGHT
  }

  _addSectionHeader(title) {
    this.posY += sp(6)
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: MARGIN, y: this.posY,
      w: SCREEN_WIDTH - MARGIN * 2, h: sp(28),
      text: title, text_size: sp(24),
      color: DIM_COLOR, align_h: hmUI.align.LEFT,
    })
    this.posY += sp(28)
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: MARGIN, y: this.posY,
      w: SCREEN_WIDTH - MARGIN * 2, h: 1,
      color: 0x2D333B,
    })
    this.posY += 5
  }

  _openFile(entry) {
    this._addRecent(entry)
    hmApp.gotoPage({
      url: 'page/amazfit/NoteScreen',
      param: JSON.stringify({ path: entry.path }),
    })
  }

  _openDir(entry) {
    hmApp.gotoPage({
      url: 'page/amazfit/FileBrowser',
      param: JSON.stringify({ path: entry.path }),
    })
  }

  _addRecent(entry) {
    let recents = config.get('recentFiles', [])
    recents = recents.filter(r => r.path !== entry.path)
    recents.unshift({ path: entry.path, name: entry.name })
    config.set('recentFiles', recents.slice(0, RECENTS_MAX))
  }

  _toggleFavorite(entry) {
    const favs = config.get('favoriteFiles', [])
    const idx = favs.findIndex(f => f.path === entry.path)
    if (idx === -1) favs.push({ path: entry.path, name: entry.name })
    else favs.splice(idx, 1)
    config.set('favoriteFiles', favs)
    hmApp.reloadPage({
      url: 'page/amazfit/FileBrowser',
      param: JSON.stringify({ path: this.currentPath, offset: this.offset }),
    })
  }

  _addSyncButton() {
    const y = this.posY
    const h = sp(72)
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
    const cy = Math.floor(SCREEN_HEIGHT / 2)

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
      w: SCREEN_WIDTH, h: sp(44),
      text: 'Open the Zepp app to',
      text_size: sp(32),
      color: DIM_COLOR,
      align_h: hmUI.align.CENTER_H,
    })
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: 0, y: cy + sp(32),
      w: SCREEN_WIDTH, h: sp(44),
      text: 'configure and sync',
      text_size: sp(32),
      color: DIM_COLOR,
      align_h: hmUI.align.CENTER_H,
    })

    // Sync button
    const bY = cy + sp(80)
    const bH = sp(68)
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

    // Demo Note button — opens mock renderer for display testing
    const dY = bY + bH + 16
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: bMargin, y: dY,
      w: SCREEN_WIDTH - bMargin * 2, h: bH,
      color: 0x21262D,
      radius: 10,
    })
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: bMargin, y: dY + (bH - FONT_SIZE) / 2,
      w: SCREEN_WIDTH - bMargin * 2, h: FONT_SIZE + 4,
      text: 'Demo Note',
      text_size: FONT_SIZE,
      color: DIM_COLOR,
      align_h: hmUI.align.CENTER_H,
    })
    const demoTap = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: bMargin, y: dY,
      w: SCREEN_WIDTH - bMargin * 2, h: bH,
      color: 0x00000000, alpha: 0,
    })
    demoTap.addEventListener(hmUI.event.CLICK_UP, () => {
      hmApp.gotoPage({
        url: 'page/amazfit/NoteScreen',
        param: JSON.stringify({ path: '__mock__' }),
      })
    })

    // Demo Browser button — seeds fake data to test sections
    const dbY = dY + bH + 16
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: bMargin, y: dbY,
      w: SCREEN_WIDTH - bMargin * 2, h: bH,
      color: 0x21262D,
      radius: 10,
    })
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: bMargin, y: dbY + (bH - FONT_SIZE) / 2,
      w: SCREEN_WIDTH - bMargin * 2, h: FONT_SIZE + 4,
      text: 'Demo Browser',
      text_size: FONT_SIZE,
      color: DIM_COLOR,
      align_h: hmUI.align.CENTER_H,
    })
    const dbTap = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: bMargin, y: dbY,
      w: SCREEN_WIDTH - bMargin * 2, h: bH,
      color: 0x00000000, alpha: 0,
    })
    dbTap.addEventListener(hmUI.event.CLICK_UP, () => {
      config.set('fileIndex', [
        { path: 'notes/todo.md',   name: 'todo.md',   type: 'file' },
        { path: 'notes/ideas.md',  name: 'ideas.md',  type: 'file' },
        { path: 'journal/2024.md', name: '2024.md',   type: 'file' },
        { path: 'readme.md',       name: 'readme.md', type: 'file' },
      ])
      config.set('recentFiles',   [{ path: 'notes/todo.md', name: 'todo.md' }])
      config.set('favoriteFiles', [{ path: 'journal/2024.md', name: '2024.md' }])
      hmApp.reloadPage({ url: 'page/amazfit/FileBrowser', param: '{}' })
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
