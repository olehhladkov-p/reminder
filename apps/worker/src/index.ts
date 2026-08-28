import { channelRegistry } from './channels.js'
import { db, pool } from './db.js'
import { env } from './env.js'
import { startWorker } from './run.js'

const worker = startWorker({
  db,
  channelRegistry,
  pollIntervalMs: env.POLL_INTERVAL_MS,
  nightlyIntervalMs: env.NIGHTLY_INTERVAL_MS,
  batchSize: env.BATCH_SIZE,
  maxAttempts: env.MAX_ATTEMPTS,
  processingTimeoutMs: env.PROCESSING_TIMEOUT_MS,
  jobRetentionMs: env.JOB_RETENTION_MS,
})

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} received, shutting down`)
  worker.stop()
  await pool.end()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
