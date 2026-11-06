/**
 * @fileoverview Automated tests for CSS design tokens, Open Props imports, and style conventions.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import postcss from 'postcss'

const root = new URL('../src/styles/', import.meta.url)
const read = (file) => readFileSync(new URL(file, root), 'utf8')
const modules = [
  'foundations/tokens.css',
  'foundations/base.css',
  'components/layout.css',
  'components/forms.css',
  'components/content.css',
  'pages/home.css',
  'pages/editorial.css',
  'pages/directory.css',
  'pages/resources.css',
  'pages/sitemap.css'
]

test('stylesheet entry imports foundations, shared components and page rules in order', () => {
  const entry = postcss.parse(read('global.css'))
  assert.ok(entry.nodes.every((node) => node.type === 'atrule' && node.name === 'import'))
  const imports = entry.nodes.map((node) => node.params.replace(/^["']|["']$/g, ''))
  assert.deepEqual(
    imports.slice(2),
    modules.map((file) => `./${file}`)
  )
  for (const folder of ['foundations', 'components', 'pages']) {
    const files = readdirSync(new URL(`${folder}/`, root))
      .filter((file) => file.endsWith('.css'))
      .map((file) => `${folder}/${file}`)
    assert.deepEqual(files.sort(), modules.filter((file) => file.startsWith(`${folder}/`)).sort())
  }
})

test('selective Open Props imports supply every adopted token without a reset or theme', () => {
  const tokens = postcss.parse(read('foundations/tokens.css'))
  const imports = tokens.nodes
    .filter((node) => node.type === 'atrule' && node.name === 'import')
    .map((node) => node.params.replace(/^["']|["']$/g, ''))
  assert.deepEqual(imports, [
    'open-props/sizes',
    'open-props/borders',
    'open-props/fonts',
    'open-props/aspects',
    'open-props/easings',
    'open-props/zindex'
  ])
  const available = new Map()
  for (const file of ['sizes', 'borders', 'fonts', 'aspects', 'easings', 'zindex']) {
    postcss
      .parse(readFileSync(new URL(import.meta.resolve(`open-props/${file}`)), 'utf8'))
      .walkDecls((declaration) => available.set(declaration.prop, declaration.value))
  }
  let uses = 0
  for (const file of modules) {
    postcss.parse(read(file)).walkDecls((declaration) => {
      for (const match of declaration.value.matchAll(
        /var\((--(?:size-\d+|border-size-\d+|font-size-\d+|font-weight-\d+|font-lineheight-\d+|ratio-[a-z]+|ease-\d+|layer-\d+))\)/g
      )) {
        assert.ok(available.has(match[1]), `${file}: undefined ${match[1]}`)
        uses += 1
      }
    })
  }
  assert.ok(uses >= 100, `${uses} Open Props references are used`)
  assert.equal(available.get('--size-4'), '1.25rem')
  assert.equal(available.get('--size-6'), '1.75rem')
  const brand = new Map()
  tokens.walkDecls((declaration) => brand.set(declaration.prop, declaration.value))
  assert.equal(brand.get('--brand-primary'), '#671e7d')
  assert.equal(brand.get('--card-radius'), '4px')
  assert.equal(brand.get('--card-padding'), 'var(--size-4)')
})

test('site and CMS previews continue to consume the same complete stylesheet entry', () => {
  const site = readFileSync(new URL('../src/layouts/SiteLayout.astro', import.meta.url), 'utf8')
  const admin = readFileSync(new URL('../src/pages/admin/index.astro', import.meta.url), 'utf8')
  assert.ok(site.includes("import '../styles/global.css'"))
  assert.ok(admin.includes("import previewStyles from '../../styles/global.css?inline'"))
  assert.ok(admin.includes('registerPreviewStyle(previewStyles, { raw: true })'))
  for (const file of modules) {
    assert.doesNotThrow(() => postcss.parse(read(file), { from: path.join('src/styles', file) }))
  }
})

test('site styles use shared tokens instead of local color values', () => {
  const localColor = /#[\da-f]{3,8}\b|rgba?\(|\bwhite\b/i
  for (const file of modules.filter((file) => file !== 'foundations/tokens.css')) {
    postcss
      .parse(read(file), { from: path.join('src/styles', file) })
      .walkDecls((declaration) =>
        assert.doesNotMatch(
          declaration.value,
          localColor,
          `${file}: use a palette token for ${declaration.prop}`
        )
      )
  }
})

test('editorial headings and blockquotes use distinct accents', () => {
  const base = postcss.parse(read('foundations/base.css'))
  const openingContent = base.nodes.find(
    (node) => node.type === 'rule' && node.selector === '.prose.original-content > h1 + *'
  )
  assert.ok(openingContent.nodes.some((node) => node.prop === 'margin-top' && node.value === '0'))

  const sectionHeading = base.nodes.find(
    (node) => node.type === 'rule' && node.selector === '.prose > h2'
  )
  const headingValues = new Map(
    sectionHeading.nodes
      .filter((node) => node.type === 'decl')
      .map((node) => [node.prop, node.value])
  )
  assert.equal(headingValues.get('background'), 'var(--surface-tint-rose-pale)')
  assert.equal(headingValues.get('border-right'), '4px solid var(--brand-rose)')

  const blockquote = base.nodes.find(
    (node) => node.type === 'rule' && node.selector === '.prose blockquote'
  )
  const quoteValues = new Map(
    blockquote.nodes.filter((node) => node.type === 'decl').map((node) => [node.prop, node.value])
  )
  assert.equal(quoteValues.get('border-left'), '4px solid var(--brand-rose)')
  assert.equal(quoteValues.has('border-right'), false)

  const content = postcss.parse(read('components/content.css'))
  const sourceNote = content.nodes.find(
    (node) => node.type === 'rule' && node.selector === '.source-note'
  )
  const noteValues = new Map(
    sourceNote.nodes.filter((node) => node.type === 'decl').map((node) => [node.prop, node.value])
  )
  assert.equal(noteValues.get('background'), 'var(--surface-tint-green)')
  assert.equal(noteValues.has('border-top'), false)
})

test('collection component figures are not restyled as article media', () => {
  const editorial = postcss.parse(read('pages/editorial.css'))
  const selectors = editorial.nodes
    .filter((node) => node.type === 'rule' && node.selector.includes('figure'))
    .map((node) => node.selector)
  assert.ok(selectors.length)
  assert.ok(selectors.every((selector) => selector.includes('figure:not([class])')))
  assert.equal(
    selectors.some((selector) => selector.includes('lacemaking')),
    false
  )
})

test('homepage carousel has a distinct light surface and quiet inactive dots', () => {
  const home = postcss.parse(read('pages/home.css'))
  const hero = home.nodes.find(
    (node) => node.type === 'rule' && node.selector === '.hero-with-carousel'
  )
  const heroValues = new Map(
    hero.nodes.filter((node) => node.type === 'decl').map((node) => [node.prop, node.value])
  )
  assert.equal(heroValues.get('background'), 'var(--surface-tint-green)')

  const dot = home.nodes.find(
    (node) => node.type === 'rule' && node.selector === '.hero-carousel-dot'
  )
  const dotValues = new Map(
    dot.nodes.filter((node) => node.type === 'decl').map((node) => [node.prop, node.value])
  )
  assert.equal(dotValues.get('background'), 'var(--surface-tint-rose-pale)')
  assert.equal(dotValues.get('border'), 'var(--border-size-1) solid var(--line-strong)')
})

test('hotspot frames shrink-wrap images so percentage markers align with the artwork', () => {
  const content = postcss.parse(read('components/content.css'))
  const frame = content.nodes.find(
    (node) => node.type === 'rule' && node.selector === '.collection-hotspot-image'
  )
  const image = content.nodes.find(
    (node) => node.type === 'rule' && node.selector === '.collection-hotspot-image img'
  )
  const value = (rule, property) =>
    rule.nodes.find((node) => node.type === 'decl' && node.prop === property)?.value

  assert.equal(value(frame, 'width'), 'fit-content')
  assert.equal(value(frame, 'max-width'), '100%')
  assert.equal(value(image, 'width'), 'auto')
  assert.equal(value(image, 'max-height'), '68vh')
})

test('grey line tokens are not used as filled backgrounds', () => {
  for (const file of modules) {
    postcss
      .parse(read(file), { from: path.join('src/styles', file) })
      .walkDecls(/^background(?:-color)?$/, (declaration) =>
        assert.doesNotMatch(
          declaration.value,
          /var\(--line(?:-strong)?\)/,
          `${file}: use a surface token for backgrounds`
        )
      )
  }
})
