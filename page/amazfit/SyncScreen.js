/**
 * SyncScreen — pull the latest notes from GitHub to the watch.
 *
 * Flow:
 *  1. Ask phone for the file list (index of all .md files)
 *  2. For each file, request its content from the phone
 *  3. Save each file to watch local storage
 *  4. Update the file index in ConfigStorage
 *  5. Show progress and completion status
 */

import { writeNoteFile } from './NoteScreen'

const { messageBuilder, config } = getApp()._options.globalData

const SCREEN_WIDTH = hmSetting.getDeviceInfo().width || 480
const SCREEN_HEIGHT = hmSetting.getDeviceInfo().height || 480
const FONT_SIZE = 18
const TEXT_COLOR = 0xC9D1D9
const DIM_COLOR = 0x8B949E
const BG_COLOR = 0x0D1117
const ACCENT = 0x58A6FF
const SUCCESS = 0x3FB950
const ERROR_COLOR = 0xF85149

class SyncScreen {
  constructor() {
    this.widgets = {}
    this.cancelled = false
  }

  init() {
    hmUI.setStatusBarVisible(true)
    hmUI.updateStatusBarTitle('Sync Notes')
    hmApp.setScreenKeep(true)

    this._buildUI()
    this._startSync()
  }

  _buildUI() {
    const cx = Math.floor(SCREEN_WIDTH / 2)
    const cy = Math.floor(SCREEN_HEIGHT / 2)

    // Background
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: 0, y: 0,
      w: SCREEN_WIDTH, h: SCREEN_HEIGHT,
      color: BG_COLOR,
    })

    // Title
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: 0, y: 40,
      w: SCREEN_WIDTH, h: 28,
      text: 'Syncing Notes',
      text_size: FONT_SIZE + 2,
      color: TEXT_COLOR,
      align_h: hmUI.align.CENTER_H,
    })

    // Status text (dynamic)
    this.widgets.status = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 16, y: cy - 40,
      w: SCREEN_WIDTH - 32, h: 28,
      text: 'Connecting…',
      text_size: 15,
      color: DIM_COLOR,
      align_h: hmUI.align.CENTER_H,
      text_style: hmUI.text_style.ELLIPSIS,
    })

    // Progress text (e.g. "3 / 12")
    this.widgets.progress = hmUI.createWidget(hmUI.widget.TEXT, {
      x: 0, y: cy,
      w: SCREEN_WIDTH, h: 36,
      text: '',
      text_size: FONT_SIZE + 4,
      color: ACCENT,
      align_h: hmUI.align.CENTER_H,
    })

    // Progress bar background
    const barW = SCREEN_WIDTH - 64
    const barX = 32
    const barY = cy + 48
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: barX, y: barY,
      w: barW, h: 8,
      color: 0x21262D,
      radius: 4,
    })

    // Progress bar fill (starts at 0)
    this.widgets.progressBar = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: barX, y: barY,
      w: 0, h: 8,
      color: ACCENT,
      radius: 4,
    })

    this.barX = barX
    this.barW = barW

    // Cancel button
    const btnY = SCREEN_HEIGHT - 80
    const btnMargin = 48
    this.widgets.cancelBtn = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: btnMargin, y: btnY,
      w: SCREEN_WIDTH - btnMargin * 2, h: 48,
      color: 0x21262D,
      radius: 10,
    })
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: btnMargin, y: btnY + 14,
      w: SCREEN_WIDTH - btnMargin * 2, h: 24,
      text: 'Cancel',
      text_size: 16,
      color: DIM_COLOR,
      align_h: hmUI.align.CENTER_H,
    })
    const cancelTap = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: btnMargin, y: btnY,
      w: SCREEN_WIDTH - btnMargin * 2, h: 48,
      color: 0x00000000, alpha: 0,
    })
    cancelTap.addEventListener(hmUI.event.CLICK_UP, () => {
      this.cancelled = true
      hmApp.goBack()
    })
  }

  _setStatus(text) {
    if (this.widgets.status) {
      this.widgets.status.setProperty(hmUI.prop.TEXT, text)
    }
  }

  _setProgress(done, total) {
    if (this.widgets.progress) {
      this.widgets.progress.setProperty(hmUI.prop.TEXT, done + ' / ' + total)
    }
    if (this.widgets.progressBar && total > 0) {
      const filled = Math.floor((done / total) * this.barW)
      this.widgets.progressBar.setProperty(hmUI.prop.W, filled)
    }
  }

  _showDone(count) {
    this.widgets.status.setProperty(hmUI.prop.COLOR, SUCCESS)
    this.widgets.status.setProperty(hmUI.prop.TEXT, 'Sync complete')
    this.widgets.progress.setProperty(hmUI.prop.COLOR, SUCCESS)
    this.widgets.progress.setProperty(hmUI.prop.TEXT, count + ' files')
    this.widgets.progressBar.setProperty(hmUI.prop.W, this.barW)
    this.widgets.progressBar.setProperty(hmUI.prop.COLOR, SUCCESS)

    if (this.widgets.cancelBtn) {
      this.widgets.cancelBtn.setProperty(hmUI.prop.COLOR, 0x238636)
    }

    // Update cancel button label to "Done"
    // (We can't change text of a different widget after creation, so we redraw)
    const btnY = SCREEN_HEIGHT - 80
    const btnMargin = 48
    hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: btnMargin, y: btnY,
      w: SCREEN_WIDTH - btnMargin * 2, h: 48,
      color: 0x238636,
      radius: 10,
    })
    hmUI.createWidget(hmUI.widget.TEXT, {
      x: btnMargin, y: btnY + 14,
      w: SCREEN_WIDTH - btnMargin * 2, h: 24,
      text: 'Done',
      text_size: 16,
      color: 0xFFFFFF,
      align_h: hmUI.align.CENTER_H,
    })
    const doneTap = hmUI.createWidget(hmUI.widget.FILL_RECT, {
      x: btnMargin, y: btnY,
      w: SCREEN_WIDTH - btnMargin * 2, h: 48,
      color: 0x00000000, alpha: 0,
    })
    doneTap.addEventListener(hmUI.event.CLICK_UP, () => hmApp.goBack())
  }

  _showError(msg) {
    this.widgets.status.setProperty(hmUI.prop.COLOR, ERROR_COLOR)
    this.widgets.status.setProperty(hmUI.prop.TEXT, msg)
    this.widgets.progress.setProperty(hmUI.prop.TEXT, 'Failed')
    this.widgets.progress.setProperty(hmUI.prop.COLOR, ERROR_COLOR)
  }

  async _startSync() {
    try {
      // Step 1: Get file list from phone
      this._setStatus('Fetching file list…')
      const listResp = await messageBuilder.request({ action: 'get_file_list' }, {})

      if (this.cancelled) return
      if (listResp.error) {
        this._showError(listResp.error === 'not_authenticated'
          ? 'Not logged in. Open Zepp app.'
          : listResp.error === 'no_repo_selected'
          ? 'No repo selected. Open Zepp app.'
          : listResp.error)
        return
      }

      const files = (listResp.files || []).filter(f => f.type === 'file')
      if (files.length === 0) {
        this._setStatus('No markdown files found')
        this._setProgress(0, 0)
        return
      }

      // Save file index (all nodes including dirs) to config
      config.set('fileIndex', listResp.files)
      config.set('lastSyncBranch', listResp.branch)

      // Step 2: Download each file
      let done = 0
      this._setProgress(0, files.length)

      for (const file of files) {
        if (this.cancelled) return

        this._setStatus(file.name)
        this._setProgress(done, files.length)

        try {
          const fileResp = await messageBuilder.request({
            action: 'get_file',
            path: file.path,
          }, {})

          if (!this.cancelled && !fileResp.error) {
            writeNoteFile(file.path, fileResp.content)
          }
        } catch (e) {
          // Log but continue syncing remaining files
          console.log('Failed to sync ' + file.path + ': ' + e)
        }

        done++
        this._setProgress(done, files.length)
      }

      // Step 3: Save sync timestamp
      config.set('lastSync', Date.now())

      if (!this.cancelled) {
        this._showDone(done)
      }
    } catch (e) {
      if (!this.cancelled) {
        this._showError(String(e))
      }
    }
  }
}

// ─── Page lifecycle ────────────────────────────────────────────────────────────

Page({
  onInit() {
    try {
      new SyncScreen().init()
    } catch (e) {
      console.log('SyncScreen error: ' + e)
    }
  },

  onDestroy() {
    hmApp.setScreenKeep(false)
  },
})
