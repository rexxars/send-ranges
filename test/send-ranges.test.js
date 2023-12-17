const fs = require('fs')
const path = require('path')
const pump = require('pump')
const sprom = require('sprom')
const needle = require('needle')
const express = require('express')
const request = require('supertest')
const sendRanges = require('../src')

let server
const fixturePath = path.join(__dirname, 'fixtures', 'text.txt')
const fixtureContent = fs.readFileSync(fixturePath, 'utf8')
const size = fs.statSync(fixturePath).size

const parseResponse = (headers, body) => {
  // Shouldn't make these kind of horrible assumptions on binary/text, headers etc.
  // But this is tests. Controlled environment etc.
  const contentType = headers['content-type']
  const boundary = contentType.slice(contentType.indexOf('boundary=') + 9)

  const content = body.toString()
  const chunks = content
    .split(boundary)
    .map((part) => part.replace(/^-+/, '').trim())
    .map((part) => part.split('\r\n\r\n')[1])
    .filter(Boolean)

  return chunks
}

const getStream = (range) => fs.createReadStream(fixturePath, range)
const getStreamAsync = (range) =>
  new Promise((resolve) => setImmediate(resolve, fs.createReadStream(fixturePath, range)))
const fetchFile = () => ({getStream, size, type: 'text/plain'})
const fetchNothing = () => null
const fetchFileAsync = () => ({getStream: getStreamAsync, size, type: 'text/plain'})
const fetchFileWithoutType = () => ({getStream, size})
const fetchFileWithMetadata = () => ({getStream, size, type: 'text/plain', metadata: {foo: 'bar'}})

const defaultSender = (req, res, next) =>
  pump(getStream({}), res.set({'Content-Length': size, 'Content-Type': 'text/plain'}))

const getApp = (opts = {}) =>
  express().get('/:filename', sendRanges(opts.fetch || fetchFile, opts), defaultSender)

const getListeningApp = (opts) =>
  new Promise((resolve) => {
    server = getApp(opts).listen(0, '127.0.0.1', () => resolve(server.address().port))
  })

const requestRange = async (range, opts = {}) => {
  const port = await getListeningApp(opts)
  const stream = needle.get(`http://127.0.0.1:${port}/somefile.txt`, {
    headers: {Range: range},
  })

  let headers
  stream.on('response', (res) => {
    headers = res.headers
  })

  const body = await sprom.buf(stream)
  const chunks = parseResponse(headers, body)
  const contentLength = parseInt(headers['content-length'], 10)
  return {body, chunks, headers, contentLength}
}

describe('send-ranges', () => {
  afterEach((done) => {
    const close = server ? server.close.bind(server) : setImmediate
    server = null
    close(done)
  })

  test('throws on missing/invalid `getStream`', () => {
    expect(() => sendRanges()).toThrowErrorMatchingSnapshot()
    expect(() => sendRanges('moop')).toThrowErrorMatchingSnapshot()
  })

  test('throws on missing/invalid `beforeSend`', () => {
    expect(() => sendRanges(fetchFile, {beforeSend: null})).toThrowErrorMatchingSnapshot()
    expect(() => sendRanges(fetchFile, {beforeSend: 'moop'})).toThrowErrorMatchingSnapshot()
  })

  test('defers to next handler in chain on no range header', (done) => {
    request(getApp())
      .get('/somefile.txt')
      .expect('Content-Type', /text\/plain/)
      .expect('Content-Length', `${size}`)
      .expect(200, fixtureContent)
      .end(done)
  })

  test('defers to next handler if fetcher returns falsey value', (done) => {
    request(getApp({fetch: fetchNothing}))
      .get('/somefile.txt')
      .set('Range', 'bytes=0-60')
      .expect('Content-Type', /text\/plain/)
      .expect('Content-Length', `${size}`)
      .expect(200, fixtureContent)
      .end(done)
  })

  test('sends 400 on malformed range header', (done) => {
    request(getApp())
      .get('/somefile.txt')
      .set('Range', 'foo')
      .expect('Content-Type', /text\/plain/)
      .expect(400, 'Malformed `range` header')
      .end(done)
  })

  test('sends 400 on unsatisfiable range header (unit)', (done) => {
    request(getApp())
      .get('/somefile.txt')
      .set('Range', 'pages=0-100')
      .expect('Content-Type', /text\/plain/)
      .expect(416, 'Range not satisfiable')
      .end(done)
  })

  test('sends 400 on unsatisfiable range header (invalid numbers)', (done) => {
    request(getApp())
      .get('/somefile.txt')
      .set('Range', 'bytes=moo-mooo')
      .expect('Content-Type', /text\/plain/)
      .expect(416, 'Range not satisfiable')
      .end(done)
  })

  test('sends 400 on unsatisfiable range header (start > end)', (done) => {
    request(getApp())
      .get('/somefile.txt')
      .set('Range', 'bytes=3000-1000')
      .expect('Content-Type', /text\/plain/)
      .expect(416, 'Range not satisfiable')
      .end(done)
  })

  test('sends 400 on unsatisfiable range header (start < 0)', (done) => {
    request(getApp())
      .get('/somefile.txt')
      .set('Range', 'bytes=a0-500000000')
      .expect('Content-Type', /text\/plain/)
      .expect(416, 'Range not satisfiable')
      .end(done)
  })

  test('sends 400 on too many ranges specified', (done) => {
    request(getApp())
      .get('/somefile.txt')
      .set('Range', 'bytes=0-50,100-150,200-250')
      .expect('Content-Type', /text\/plain/)
      .expect(400, 'Too many ranges specified. Max: 2. Range: bytes=0-50,100-150,200-250')
      .end(done)
  })

  test('sends 400 on too many ranges specified (configured)', (done) => {
    request(getApp({maxRanges: 3}))
      .get('/somefile.txt')
      .set('Range', 'bytes=0-50,100-150,200-250,300-350')
      .expect('Content-Type', /text\/plain/)
      .expect(400, 'Too many ranges specified. Max: 3. Range: bytes=0-50,100-150,200-250,300-350')
      .end(done)
  })

  test('sends single-chunk response on single range', (done) => {
    request(getApp())
      .get('/somefile.txt')
      .set('Range', 'bytes=0-60')
      .expect('Content-Type', /text\/plain/)
      .expect(206, 'The "Range" header field on a GET request modifies the method')
      .end(done)
  })

  test('sends single-chunk response on single range (async)', (done) => {
    request(getApp({fetch: fetchFileAsync}))
      .get('/somefile.txt')
      .set('Range', 'bytes=0-60')
      .expect('Content-Type', /text\/plain/)
      .expect(206, 'The "Range" header field on a GET request modifies the method')
      .end(done)
  })

  test('sends single-chunk response on single range (head)', (done) => {
    request(getApp())
      .head('/somefile.txt')
      .set('Range', 'bytes=0-60')
      .expect('Content-Type', /text\/plain/)
      .expect(206)
      .end(done)
  })

  test('sends single-chunk response on single range (tail)', (done) => {
    request(getApp())
      .get('/somefile.txt')
      .set('Range', 'bytes=-24')
      .expect('Content-Type', /text\/plain/)
      .expect(206, '(Not Modified) response.')
      .end(done)
  })

  test('sends single-chunk response on single range (tail, open)', (done) => {
    request(getApp())
      .get('/somefile.txt')
      .set('Range', 'bytes=2156-')
      .expect('Content-Type', /text\/plain/)
      .expect(206, '(Not Modified) response.')
      .end(done)
  })

  test('sends single-chunk response on single range (tail, open, no dash)', (done) => {
    request(getApp())
      .get('/somefile.txt')
      .set('Range', 'bytes=2156')
      .expect('Content-Type', /text\/plain/)
      .expect(206, '(Not Modified) response.')
      .end(done)
  })

  test('sends multi-chunk response on multi-range (specific ranges)', async () => {
    const {headers, body, chunks, contentLength} = await requestRange('bytes=0-10,15-25')
    expect(body).toHaveLength(contentLength)
    expect(headers['content-type']).toContain('multipart/byteranges; boundary=')
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toEqual('The "Range"')
    expect(chunks[1]).toEqual('der field o')
  })

  test('sends multi-chunk response on multi-range (first and last)', async () => {
    const {headers, body, chunks, contentLength} = await requestRange('bytes=0-10,-10')
    expect(body).toHaveLength(contentLength)
    expect(headers['content-type']).toContain('multipart/byteranges; boundary=')
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toEqual('The "Range"')
    expect(chunks[1]).toEqual(' response.')
  })

  test('sends multi-chunk response on multi-range (specific, tail)', async () => {
    const {headers, body, chunks, contentLength} = await requestRange('bytes=0-0,2156-')
    expect(body).toHaveLength(contentLength)
    expect(headers['content-type']).toContain('multipart/byteranges; boundary=')
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toEqual('T')
    expect(chunks[1]).toEqual('(Not Modified) response.')
  })

  test('sends multi-chunk response on multi-range (specific ranges)', async () => {
    const opts = {fetch: fetchFileAsync}
    const {headers, body, chunks, contentLength} = await requestRange('bytes=0-10,15-25', opts)
    expect(body).toHaveLength(contentLength)
    expect(headers['content-type']).toContain('multipart/byteranges; boundary=')
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toEqual('The "Range"')
    expect(chunks[1]).toEqual('der field o')
  })

  // todo: weak etag, last-modified
  test('sends 304 on range & valid if-range', (done) => {
    const eTag = '"foo"'
    const fetchFileWithEtag = () => ({...fetchFile(), eTag: eTag})
    const app = getApp({fetch: fetchFileWithEtag})

    request(app)
      .get('/somefile.txt')
      .set('Range', 'bytes=0-50')
      .set('If-Range', eTag)
      .expect('ETag', eTag)
      .expect(304)
      .end(done)
  })

  test('calls error handler on fetch fail', (done) => {
    const error = new Error('Some error')
    const app = getApp({fetch: () => Promise.reject(error)})
    app.use((err, req, res, next) => {
      expect(err).toEqual(error)
      res.status(404).json({error: 'File not found'})
    })

    request(app)
      .get('/somefile.txt')
      .set('Range', 'bytes=0-100')
      .expect('Content-Type', /application\/json/)
      .expect(404, {error: 'File not found'})
      .end(done)
  })

  test('sets type to octet-stream if no type given', () =>
    request(getApp({fetch: fetchFileWithoutType}))
      .get('/somefile.txt')
      .set('Range', 'bytes=5-26')
      .expect('Content-Type', /application\/octet-stream/)
      .expect(206)
      .then((res) => expect(res.body.toString('utf8')).toEqual('Range" header field on')))

  test('can pass `beforeSend` function, receives metadata, can set headers', () => {
    const beforeSend = (info, cb) => {
      info.response.set('X-Foo', 'some-value')
      expect(info.metadata).toMatchObject({foo: 'bar'})
      setImmediate(cb)
    }
    return request(getApp({beforeSend, fetch: fetchFileWithMetadata}))
      .get('/somefile.txt')
      .set('Range', 'bytes=5-26')
      .expect(206, 'Range" header field on')
      .then((res) => expect(res.headers).toHaveProperty('x-foo', 'some-value'))
  })

  test('calls error handler on `beforeSend` fail', (done) => {
    const error = new Error('Some error')
    const beforeSend = (info, cb) => setImmediate(cb, error)
    const app = getApp({beforeSend})
    app.use((err, req, res, next) => {
      expect(err).toEqual(error)
      res.status(500).json({error: 'Some error'})
    })

    request(app)
      .get('/somefile.txt')
      .set('Range', 'bytes=0-100')
      .expect('Content-Type', /application\/json/)
      .expect(500, {error: 'Some error'})
      .end(done)
  })

  test('can pass `intersectRanges` function', () => {
    const intersectRanges = ({metadata, ranges}) => {
      expect(metadata).toMatchObject({foo: 'bar'})
      return ranges
    }
    return request(getApp({intersectRanges, fetch: fetchFileWithMetadata}))
      .get('/somefile.txt')
      .set('Range', 'bytes=5-26')
      .expect(206, 'Range" header field on')
  })
})
