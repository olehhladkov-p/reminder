import { defineConfig } from 'drizzle-kit'

const connectionString = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('drizzle.config.ts: set DATABASE_URL_DIRECT (or DATABASE_URL) in the environment')
}

export default defineConfig({
  schema: ['./src/schema.ts', './src/authSchema.ts'],
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: connectionString,
  },
})
