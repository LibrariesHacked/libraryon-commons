import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const image = z.object({
  image: z.string(),
  alt: z.string(),
  caption: z.string().optional(),
  credit: z.string().optional()
});

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/pages' }),
  schema: z.object({
    title: z.string().min(1),
    path: z.string().startsWith('/'),
    kind: z.enum([
      'page',
      'article',
      'landing',
      'collection',
      'case-study',
      'grant',
      'conference',
      'legal'
    ]),
    content_origin: z.enum(['libraryon', 'commons']).optional(),
    published: z.boolean().default(true),
    description: z.string().optional(),
    source_url: z.string().optional(),
    attribution: z.string().optional(),
    author: z.string().optional(),
    contributors: z.array(z.string()).default([]),
    published_on: z.coerce.date().optional(),
    updated_on: z.coerce.date().optional(),
    hero: image.optional(),
    gallery: z.array(image).optional(),
    faqs: z
      .array(
        z.object({
          question: z.string().min(1),
          answer: z.string().min(1)
        })
      )
      .default([]),
    resources: z.array(z.string()).default([])
  })
});

const resources = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/resources' }),
  schema: z.object({
    title: z.string().min(1),
    kind: z.enum(['document', 'slides', 'recording', 'link']),
    url: z.string().min(1),
    description: z.string().optional(),
    source_url: z.string().optional(),
    credit: z.string().optional(),
    licence: z.string().optional(),
    updated_on: z.coerce.date().optional()
  })
});

const sessions = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/sessions' }),
  schema: z.object({
    title: z.string().min(1),
    conference: z.string(),
    theme: z.string().optional(),
    order: z.number().default(0),
    description: z.string().optional(),
    speakers: z
      .array(z.object({ name: z.string(), organisation: z.string().optional() }))
      .default([]),
    resources: z.array(z.string()).default([]),
    updated_on: z.coerce.date().optional()
  })
});

const contributors = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './src/content/contributors' }),
  schema: z.object({
    name: z.string(),
    slug: z.string(),
    biography: z.string(),
    image: z.string().optional(),
    image_alt: z.string().optional(),
    organisation: z.string().optional(),
    website: z.string().optional(),
    updated_on: z.coerce.date().optional()
  })
});

export const collections = { pages, resources, sessions, contributors };
