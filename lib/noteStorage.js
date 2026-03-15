/**
 * Helpers for reading and writing note files on the watch filesystem.
 * Uses UTF-16 encoding required by hmFS.
 */

/**
 * Write markdown content to a local watch file for the given note path.
 * Returns true on success, false on failure.
 */
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
