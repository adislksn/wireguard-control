import QRCode from 'qrcode'
import { z } from 'zod'

/** Generate QR from a one-time client config supplied by the client (not stored server-side). */
export default defineEventHandler(async (event) => {
  const body = z.object({
    clientConfig: z.string().min(20).max(8000)
  }).parse(await readBody(event))

  if (/PrivateKey\s*=\s*$/m.test(body.clientConfig) === false && !/PrivateKey\s*=/.test(body.clientConfig)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid client config' })
  }

  const dataUrl = await QRCode.toDataURL(body.clientConfig, { margin: 1, width: 320 })
  return { dataUrl }
})
