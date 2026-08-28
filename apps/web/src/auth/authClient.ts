import { magicLinkClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'
import { API_BASE_URL } from '../config.js'

export const authClient = createAuthClient({
  baseURL: API_BASE_URL,
  basePath: '/v1/auth',
  plugins: [magicLinkClient()],
})
