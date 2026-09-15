/**
 * Minimal PNG reader — no dependencies (Node's own zlib does the inflating).
 *
 * Why this exists: the logo rasters in `docs/logo/` are committed *binaries*, and
 * "the file exists and is not empty" is not a check. Decoding them lets the
 * checker assert what the artwork actually renders as:
 *
 *   - the two eyes are still SEPARATE at 16px (a 2px gap that a font/AA change
 *     could silently weld shut, which is exactly the size a favicon lives at)
 *   - the pupil pixel really is ink and the dome around it really is jade
 *   - the knockout variant really has holes (alpha 0) rather than white paint
 *
 * None of that is provable from the SVG source, and none of it is reviewable by
 * eye on every commit. PNG is a simple format — signature, IHDR, IDAT (zlib),
 * five row filters — so reading it is ~60 lines, cheaper than a dependency.
 *
 * Scope on purpose: 8-bit non-interlaced images (grayscale / RGB / +alpha),
 * which is what a Chromium screenshot produces. Anything else throws instead of
 * returning a wrong picture.
 */
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 }

/** Decode a PNG file into `{ width, height, channels, data }` (8-bit RGBA-order). */
export function readPng(file) {
  const buf = readFileSync(file)
  if (buf.length < 8 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG: ' + file)

  let width = 0
  let height = 0
  let colorType = 0
  let bitDepth = 0
  const idat = []

  let off = 8
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      if (data[12] !== 0) throw new Error('interlaced PNG is not supported: ' + file)
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    off += 12 + len
  }

  if (bitDepth !== 8) throw new Error('only 8-bit PNG is supported (got ' + bitDepth + '): ' + file)
  const channels = CHANNELS[colorType]
  if (!channels) throw new Error('unsupported PNG color type ' + colorType + ': ' + file)
  if (!width || !height) throw new Error('PNG has no pixels: ' + file)

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  if (raw.length < (stride + 1) * height) throw new Error('truncated PNG data: ' + file)

  const out = Buffer.alloc(height * stride)
  let p = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[p++]
    const line = raw.subarray(p, p + stride)
    p += stride
    const cur = out.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0 // left
      const b = prev ? prev[i] : 0 // up
      const c = prev && i >= channels ? prev[i - channels] : 0 // up-left
      let v = line[i]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const pa = Math.abs(b - c)
        const pb = Math.abs(a - c)
        const pc = Math.abs(a + b - 2 * c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else if (filter !== 0) {
        throw new Error('unknown PNG row filter ' + filter + ': ' + file)
      }
      cur[i] = v & 0xff
    }
  }

  return {
    width,
    height,
    channels,
    data: out,
    /** RGBA at (x, y); alpha is 255 for formats that carry none. */
    pixel(x, y) {
      const i = y * stride + x * channels
      if (colorType === 6) return [out[i], out[i + 1], out[i + 2], out[i + 3]]
      if (colorType === 2) return [out[i], out[i + 1], out[i + 2], 255]
      if (colorType === 4) return [out[i], out[i], out[i], out[i + 1]]
      return [out[i], out[i], out[i], 255]
    },
  }
}

/** Alpha of the pixel at a point given in 0–64 mark units. */
export function alphaAt(png, x64, y64) {
  const x = Math.min(png.width - 1, Math.max(0, Math.round((x64 / 64) * png.width - 0.5)))
  const y = Math.min(png.height - 1, Math.max(0, Math.round((y64 / 64) * png.height - 0.5)))
  return png.pixel(x, y)[3] / 255
}

/** RGBA at a point given in 0–64 mark units. */
export function colorAt(png, x64, y64) {
  const x = Math.min(png.width - 1, Math.max(0, Math.round((x64 / 64) * png.width - 0.5)))
  const y = Math.min(png.height - 1, Math.max(0, Math.round((y64 / 64) * png.height - 0.5)))
  return png.pixel(x, y)
}

/** Opaque runs (alpha ≥ 0.5) along one row given in 0–64 mark units. */
export function runsAt(png, y64) {
  const y = Math.min(png.height - 1, Math.max(0, Math.round((y64 / 64) * png.height - 0.5)))
  const runs = []
  let start = -1
  for (let x = 0; x < png.width; x++) {
    const on = png.pixel(x, y)[3] >= 128
    if (on && start < 0) start = x
    if (!on && start >= 0) { runs.push([start, x - 1]); start = -1 }
  }
  if (start >= 0) runs.push([start, png.width - 1])
  return runs
}

/** Fraction of pixels with alpha ≥ 0.5. */
export function coverage(png) {
  let n = 0
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) if (png.pixel(x, y)[3] >= 128) n++
  }
  return n / (png.width * png.height)
}

/** Mean per-pixel |left − mirrored right| of alpha, 0–255. The mark is
 *  deliberately mirror-symmetric, so this is a real check on the geometry. */
export function mirrorError(png) {
  let sum = 0
  let n = 0
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      sum += Math.abs(png.pixel(x, y)[3] - png.pixel(png.width - 1 - x, y)[3])
      n++
    }
  }
  return sum / n
}
