/**
 * @fileoverview Automated tests for split deployment workflows (GitHub Pages public site and Netlify CMS bundle).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8')

test('Netlify Decap uses Identity and Git Gateway without repository user access', () => {
  const cms = parse(read('../public/admin/config.yml'))
  assert.equal(cms.backend.name, 'git-gateway')
  assert.equal(cms.backend.branch, 'main')
  assert.equal(cms.backend.repo, undefined)
  assert.equal(cms.publish_mode, 'editorial_workflow')
  assert.ok(
    read('../src/pages/admin/index.astro').includes(
      'identity.netlify.com/v1/netlify-identity-widget.js'
    )
  )
  const layout = read('../src/layouts/SiteLayout.astro')
  assert.ok(
    layout.includes("import.meta.env.CMS_URL || (import.meta.env.DEV ? sitePath('/admin/') : null)")
  )
  assert.ok(layout.includes('{cmsURL && ('))
})

test('split deployment publishes the public Pages site and a CMS-only Netlify bundle', () => {
  const workflow = parse(read('../.github/workflows/deploy-hosting.yml'))
  assert.ok(workflow.on.push.branches.includes('main'))
  assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'))
  const build = workflow.jobs.build
  assert.ok(build.steps.some((step) => step.run === 'npm test'))
  assert.ok(build.steps.some((step) => step.run === 'npm run package:netlify-admin'))
  assert.ok(build.steps.some((step) => step.run === 'rm -rf dist/admin'))
  assert.ok(build.steps.some((step) => step.uses === 'actions/upload-pages-artifact@v3'))
  assert.equal(workflow.jobs['deploy-pages'].steps.at(-1).uses, 'actions/deploy-pages@v4')
  assert.ok(
    workflow.jobs['deploy-netlify-admin'].steps.some(
      (step) => step.run?.includes('NETLIFY_AUTH_TOKEN') && step.run.includes('netlify-cli@27.16.1')
    )
  )
  const netlifyDeploy = workflow.jobs['deploy-netlify-admin'].steps.find(
    (step) => step.name === 'Deploy CMS bundle'
  )
  assert.match(
    netlifyDeploy.run,
    /netlify-cli@27\.16\.1 deploy --no-build --dir=\.deploy\/netlify-admin/
  )

  const netlify = read('../netlify.toml')
  assert.match(netlify, /publish = "\.deploy\/netlify-admin"/)
  assert.match(netlify, /ignore = "echo 'Netlify builds are handled by GitHub Actions' && exit 0"/)

  const pagesBuild = build.steps.find((step) => step.name === 'Build public GitHub Pages site')
  assert.equal(pagesBuild.env.SITE_URL, "${{ vars.SITE_URL || 'https://librarycommons.org.uk/' }}")
  assert.equal(pagesBuild.env.BASE_PATH, "${{ vars.BASE_PATH || '/' }}")
  assert.equal(
    pagesBuild.env.CMS_URL,
    "${{ vars.CMS_URL || 'https://edit.librarycommons.org.uk/' }}"
  )
  const site = JSON.parse(read('../src/data/settings.json'))
  assert.equal(site.site.url, 'https://librarycommons.org.uk/')
  const cname = build.steps.find((step) => step.name === 'Add custom domain file')
  assert.equal(cname.env.PAGES_DOMAIN, "${{ vars.PAGES_DOMAIN || 'librarycommons.org.uk' }}")
})
