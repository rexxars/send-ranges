const pump = require('pump')
const rangeParser = require('range-parser')
const BRS = require('byte-range-stream')
const noopNext = (info, next) => next()

const defaultOptions = {
  beforeSend: noopNext,
  maxRanges: 2
}

module.exports = (fetchStream, opts = {}) => {
  const options = {...defaultOptions, ...opts}

  if (typeof fetchStream !== 'function') {
    throw new Error('`fetchStream` must be a function')
  }

  if (typeof options.beforeSend !== 'function') {
    throw new Error('`options.beforeSend` must be a function')
  }

  return async (req, res, next) => {
    // Always flag that we accept ranges
    res.setHeader('Accept-Ranges', 'bytes')

    // Not a range request? Let the usual middleware handle it
    const {range} = req.headers
    if (!range) {
      next()
      return
    }

    // Fetch the file (if we can)
    let file
    try {
      file = await fetchStream(req)
    } catch (err) {
      next(err)
      return
    }

    // If nothing is returned, call the next middleware in line
    if (!file) {
      next()
      return
    }

    const {getStream, size, type, metadata, eTag, lastModified} = file

    // Parse the range header
    let ranges = rangeParser(size, range, options)

    // Malformed?
    if (ranges === -2) {
      res
        .status(400)
        .type('text')
        .send('Malformed `range` header')
      return
    }

    // Unsatisfiable?
    let isUnsatisfiable = ranges === -1 || ranges.type !== 'bytes'

    const {intersectRanges} = options
    if (!isUnsatisfiable && intersectRanges) {
      ranges = intersectRanges({metadata, ranges})

      isUnsatisfiable = ranges.length === 0
    }

    if (isUnsatisfiable) {
      res
        .status(416)
        .set('Content-Range', `bytes */${size}`)
        .type('text')
        .send('Range not satisfiable')
      return
    }

    // Beyond limit?
    if (ranges.length > options.maxRanges) {
      res
        .status(400)
        .set('Content-Range', `bytes */${size}`)
        .type('text')
        .send(`Too many ranges specified. Max: ${options.maxRanges}. Range: ${range}`)
      return
    }

    // Valid ranges, set appropriate status code
    const ifRange = req.headers['if-range']
    const isNotModified = ifRange && (ifRange === eTag || ifRange === lastModified)
    res.status(isNotModified ? 304 : 206)

    // Prepare headers to set (only apply them after `beforeSend`, in case we run into trouble)
    const isSingleRange = ranges.length === 1
    const sourceStream = isSingleRange
      ? await getStream(ranges[0])
      : new BRS({range, getChunk: getStream, totalSize: size, contentType: type})
    const headers = isSingleRange
      ? {
        'Content-Type': type || 'application/octet-stream',
        'Content-Range': `bytes ${ranges[0].start}-${ranges[0].end}/${size}`,
        'Content-Length': 1 + ranges[0].end - ranges[0].start
      }
      : sourceStream.getHeaders()

    if (eTag) headers['ETag'] = eTag
    if (lastModified) headers['Last-Modified'] = lastModified

    // Allow the user to do pre-response actions, like adding additional headers or even
    // handling the response themselves. The user is responsible for calling next() to
    // continue with the response. Passing an error calls the error handling chain.
    const info = {request: req, response: res, metadata, sourceStream}
    options.beforeSend(info, err => {
      if (err) {
        next(err)
        return
      }

      res.set(headers)

      if (req.method === 'HEAD' || isNotModified) {
        res.end()
        return
      }

      // Stream the response!
      pump(sourceStream, res)
    })
  }
}
