import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { parse } from 'yaml'

test('CMS edits use pull requests and preserved records have ownership rules', () => {
  const config = parse(readFileSync(new URL('../public/admin/config.yml', import.meta.url), 'utf8'))
  assert.equal(config.publish_mode, 'editorial_workflow')
  assert.equal(config.media_folder, 'public/uploads/community')
  assert.equal(config.public_folder, '/uploads/community')
  assert.ok(existsSync(new URL('../public/uploads/community/.gitkeep', import.meta.url)))

  const owners = new Set(
    readFileSync(new URL('../.github/CODEOWNERS', import.meta.url), 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const [pattern, owner] = line.split(/\s+/)
        assert.equal(owner, '@DaveBathnes')
        return pattern.replace(/^\//, '')
      })
  )
  const original = JSON.parse(
    readFileSync(new URL('../migration/source-articles.json', import.meta.url), 'utf8')
  )
  for (const article of original.articles) {
    assert.ok(owners.has(article.file), `Missing owner rule for ${article.file}`)
  }
  for (const path of [
    'src/content/faqs/**',
    'src/content/resources/**',
    'public/uploads/archive/**',
    'migration/**',
    'preservation/**'
  ]) {
    assert.ok(owners.has(path), `Missing owner rule for ${path}`)
  }

  const workflow = parse(
    readFileSync(new URL('../.github/workflows/validate.yml', import.meta.url), 'utf8')
  )
  assert.ok(Object.hasOwn(workflow.on, 'pull_request'))
  assert.ok(workflow.on.push.branches.includes('main'))
  const commands = workflow.jobs['tests-and-build'].steps.map((step) => step.run).filter(Boolean)
  assert.ok(commands.includes('npm test'))
  assert.ok(commands.includes('npm run build'))

  const hosting = parse(
    readFileSync(new URL('../.github/workflows/deploy-hosting.yml', import.meta.url), 'utf8')
  )
  assert.ok(hosting.on.push.branches.includes('main'))
  assert.ok(hosting.jobs.build.steps.some((step) => step.run === 'rm -rf dist/admin'))
  assert.ok(
    hosting.jobs.build.steps.some((step) => step.uses === 'actions/upload-pages-artifact@v3')
  )
  assert.equal(hosting.jobs['deploy-pages'].steps.at(-1).uses, 'actions/deploy-pages@v4')
  assert.ok(
    hosting.jobs['deploy-netlify-admin'].steps.some(
      (step) => step.run?.includes('NETLIFY_AUTH_TOKEN') && step.run.includes('netlify-cli@27.16.1')
    )
  )

  const netlify = readFileSync(new URL('../netlify.toml', import.meta.url), 'utf8')
  assert.match(netlify, /publish = "\.deploy\/netlify-admin"/)
  assert.match(netlify, /ignore = "echo 'Netlify builds are handled by GitHub Actions' && exit 0"/)
})
