import nextMDX from '@next/mdx'
import * as crypto from 'crypto'
import * as fsWalk from '@nodelib/fs.walk'
import fs from 'fs'
import path from 'path'

import { recmaPlugins } from './src/mdx/recma.mjs'
import { rehypePlugins } from './src/mdx/rehype.mjs'
import { remarkPlugins } from './src/mdx/remark.mjs'
import withSearch from './src/mdx/search.mjs'
import { withSentryConfig } from '@sentry/nextjs'

const withMDX = nextMDX({
  options: {
    remarkPlugins,
    rehypePlugins,
    recmaPlugins,
  },
})

const delimiter = '\0'

function getFilesHash(rootPath) {
  const shasum = crypto.createHash('sha1')

  function processFile(name, content) {
    shasum.update(name)
    // Add delimiter to hash to prevent collisions between files where the join of the name and content is the same
    shasum.update(delimiter)
    shasum.update(content)
    shasum.update(delimiter)
  }

  fsWalk.walkSync(rootPath, { stats: true }).forEach((e) => {
    if (!e.stats.isDirectory()) {
      if (e.path.includes('/node_modules/')) return // ignore node_modules which may contain symlinks
      const content = fs.readFileSync(e.path, 'utf8')
      processFile(e.path, content)
    }
  })

  return shasum.digest('base64')
}

const codeSnippetsDir = path.resolve('./src/code')

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'mdx'],
  basePath: '',
  assetPrefix:
    process.env.NODE_ENV === 'production'
      ? `https://${
          process.env.DASHBOARD_PROXY_DOMAIN ?? process.env.VERCEL_URL
        }`
      : undefined,
  headers: async () => [
    {
      source: '/:path*',
      headers: [
        {
          // config to prevent the browser from rendering the page inside a frame or iframe and avoid clickjacking http://en.wikipedia.org/wiki/Clickjacking
          key: 'X-Frame-Options',
          value: 'SAMEORIGIN',
        },
      ],
    },
  ],
  webpack: (config) => {
    const codeFilesHash = getFilesHash(codeSnippetsDir)
    config.cache.version = config.cache.version + delimiter + codeFilesHash
    return config
  },
  async redirects() {
    return [
      {
        source: '/docs/sandbox-templates/overview',
        destination: '/docs/sandbox-template',
        permanent: true,
      },
      {
        source: '/docs/sandbox-templates',
        destination: '/docs/sandbox-template',
        permanent: true,
      },
    ]
  },
}

export default withSearch(
  withMDX(
    withSentryConfig(
      nextConfig,
      {
        silent: true,
        org: 'e2b',
        project: 'docs',
      },
      {
        widenClientFileUpload: true,
        transpileClientSDK: true,
        tunnelRoute: '/monitoring',
        hideSourceMaps: true,
        disableLogger: true,
      }
    )
  )
)
