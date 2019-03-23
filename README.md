# send-ranges

[![npm version](http://img.shields.io/npm/v/send-ranges.svg?style=flat-square)](http://browsenpm.org/package/send-ranges)[![Build Status](http://img.shields.io/travis/rexxars/send-ranges/master.svg?style=flat-square)](https://travis-ci.org/rexxars/send-ranges)

Express middleware for handling HTTP range requests. Requires node 8 or higher.

## Installation

```
npm install --save send-ranges
```

## Usage

```js
const path = require('path')
const fse = require('fs-extra')
const express = require('express')
const sendRanges = require('send-ranges')
const app = express()

const mp3Path = path.join(__dirname, 'mp3s')

async function retrieveFile(request) {
  const filename = request.params.filename
  if (!/\.mp3$/.test(filename)) {
    return null // Falsey values will call the next handler in line
  }

  const filePath = path.join(mp3Path, filename)
  const getStream = range => fs.createReadStream(filePath, range)
  const type = 'audio/mpeg'
  const stats = await fse.stat(filePath)

  return {getStream, type, size: stats.size}
}

app.get('/:filename', sendRanges(retrieveFile), (req, res) => {
  // If we got here, this was not a range request, or the `retrieveFile` handler
  // returned a falsey value
  res.sendFile(path.join(mp3Path, req.params.filename))
})

app.listen(3000, () => {
  console.log('Example app listening on port 3000!')
})
```

## Options

Exported function accept an `options` config object that will be passed to
`range-parser`. In addition that, this `options` object accept some
`send-ranges` specific ones:

### Pre-send hook

You can pass a `beforeSend` function as an option. This is handy if you want to:

* Handle the response sending yourself
* Use metadata fetched in the file retriever to set headers on the response
* Validate and possibly cancel the response before it is sent

The `retrieveFile` function can return an additional `metadata` property which will be passed to the
`beforeSend` function. Here's an example:

```js
async function retrieveFile(request) {
  const file = await someObjectStore.getFile(request.path)
  const size = file.size
  const metadata = file.metadata
  const type = metadata.contentType
  const getStream = range => file.createReadStream(range)
  return {getStream, size, metadata, type}
}

async function beforeSend(info, cb) {
  const {request, response, metadata, sourceStream} = info
  response.set('Last-Modified', new Date(metadata.updated).toUTCString())
  cb()
}

app.get('/*', sendRanges(retrieveFile, {beforeSend}))
```

### Maximum number of ranges

By default, up to two ranges are allowed. The limit can be adjusted with the `maxRanges` option:

```js
sendRanges(retrieveFile, {maxRanges: 4})
```

### intersectRanges

Optional function that allow to modify the list of ranges to be returned. This
can be used for example if the data is not fully available because your file has
holes in it. It will be called with an object with the same `metadata` field
used for the `beforeSend()` optional function, and a `ranges` field with the
list of ranges.

## License

MIT © [Espen Hovlandsdal](https://espen.codes/)
