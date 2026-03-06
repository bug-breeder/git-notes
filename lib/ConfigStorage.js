/**
 * Simple JSON config storage backed by hmFS on the watch.
 * Stores all data as a single JSON file: config.json
 */
export class ConfigStorage {
  constructor() {
    this.data = {}
    this.filename = 'config.json'
  }

  load() {
    try {
      const [fsStat, statErr] = hmFS.stat(this.filename)
      if (statErr !== 0 || !fsStat || fsStat.size === 0) return

      const buf = new Uint8Array(fsStat.size)
      const fd = hmFS.open(this.filename, hmFS.O_RDONLY)
      hmFS.seek(fd, 0, hmFS.SEEK_SET)
      hmFS.read(fd, buf.buffer, 0, fsStat.size)
      hmFS.close(fd)

      // Decode UTF-16 pairs stored by str2ab
      const u16 = new Uint16Array(buf.buffer)
      let str = ''
      for (let i = 0; i < u16.length; i++) str += String.fromCharCode(u16[i])

      this.data = JSON.parse(str)
    } catch (e) {
      this.data = {}
    }
  }

  _save() {
    try {
      const str = JSON.stringify(this.data)
      // Encode as UTF-16 (2 bytes per char) to match readback
      const buf = new ArrayBuffer(str.length * 2)
      const view = new Uint16Array(buf)
      for (let i = 0; i < str.length; i++) view[i] = str.charCodeAt(i)

      const fd = hmFS.open(this.filename, hmFS.O_CREAT | hmFS.O_RDWR | hmFS.O_TRUNC)
      hmFS.seek(fd, 0, hmFS.SEEK_SET)
      hmFS.write(fd, buf, 0, buf.byteLength)
      hmFS.close(fd)
    } catch (e) {
      // storage write failure - non-fatal
    }
  }

  get(key, defaultValue = null) {
    return key in this.data ? this.data[key] : defaultValue
  }

  set(key, value) {
    this.data[key] = value
    this._save()
  }

  update(updates) {
    Object.assign(this.data, updates)
    this._save()
  }

  remove(key) {
    delete this.data[key]
    this._save()
  }

  wipe() {
    this.data = {}
    this._save()
  }
}
