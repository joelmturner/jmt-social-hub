import { defineCollection, defineConfig } from '@content-collections/core'
import { z } from 'zod'

// history of posts we've published (Buffer-style); one file per item in content/posted
const postedDestinationSchema = z.object({
  postedAt: z.string(),
  uri: z.string().optional(),
  videoId: z.string().optional(),
})
const posts = defineCollection({
  name: 'posts',
  directory: 'content/posted',
  include: '**/*.md',
  schema: z.object({
    caption: z.string(),
    mediaPath: z.string(),
    createdAt: z.string(),
    mediaType: z.enum(['image', 'video']),
    bluesky: postedDestinationSchema.optional(),
    youtube: postedDestinationSchema.optional(),
    content: z.string().optional(),
  }),
  transform: (document) => ({
    ...document,
    id: document._meta.path,
    createdAt: document.createdAt,
  }),
})

export default defineConfig({
  collections: [posts],
})
