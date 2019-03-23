/* eslint-disable no-console, no-sync */
const fs = require('fs')
const path = require('path')
const express = require('express')
const sendRanges = require('../')
const app = express()

const filePath = path.join(__dirname, 'somefile.txt')

const retrieveFile = request => {
  const filename = request.params.filename
  if (filename !== 'somefile.txt') {
    // We are using promises, so throwing errors will trigger the error middleware
    throw new Error('File not found')
  }

  const getStream = range => fs.createReadStream(filePath, range)
  const size = fs.statSync(filePath).size
  const type = 'text/plain'

  // Note that promises are also allowed
  return {getStream, size, type}
}

app.get('/:filename', sendRanges(retrieveFile), (req, res) => {
  // If we got here, this was not a range request
  res.sendFile(filePath)
})

app.listen(3000, () => {
  console.log('Example app listening on port 3000!')
})
