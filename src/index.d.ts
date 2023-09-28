/// <reference types="node" />
import type {NextFunction, Request as ExpressRequest, Response as ExpressResponse} from 'express'
import type {Readable} from 'node:stream'

type Range = {
  start: number
  end: number
}

type StreamFetcher = (range: Range) => Readable | Promise<Readable>

type FileResult<M> = {
  getStream: StreamFetcher
  size: number
  metadata: M
  type?: string
}

type FileFetcher = <M = any>(
  req: Request,
) => FileResult<M> | undefined | null | Promise<FileResult<M> | undefined | null>

interface SendRangesOptions<M = any> {
  beforeSend?: (info: {
    request: ExpressRequest
    response: ExpressResponse
    metadata: M
    sourceStream: Readable
  }) => {}
  maxRanges?: number
  intersectRanges?: (info: {Metadata: M; ranges: Range[]}) => Range[]
}

declare function sendRanges<M = any>(
  fetchStream: FileFetcher,
  opts?: SendRangesOptions<M>,
): (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => Promise<void>

export = sendRanges
