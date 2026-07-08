import * as Comlink from 'comlink'
import { codecApi } from './codecApi'
import type { CodecApi, ProcessInput, ProcessResult } from './codec.types'

const workerApi: CodecApi = {
  async processImage(input: ProcessInput): Promise<ProcessResult> {
    const result = await codecApi.processImage(input)
    return Comlink.transfer(result, [result.buffer])
  },
}

Comlink.expose(workerApi)
