import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';

test('CMS edits use pull requests and preserved records have ownership rules', () => {
  const config = parse(
    readFileSync(new URL('../public/admin/config.yml', import.meta.url), 'utf8'),
  );
  assert.equal(config.publish_mode, 'editorial_workflow');
  assert.equal(config.media_folder, 'public/uploads/community');
  assert.equal(config.public_folder, '/uploads/community');
  assert.ok(existsSync(new URL('../public/uploads/community/.gitkeep', import.meta.url)));

  const owners = new Set(
    readFileSync(new URL('../.github/CODEOWNERS', import.meta.url), 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const [pattern, owner] = line.split(/\s+/);
        assert.equal(owner, '@DaveBathnes');
        return pattern.replace(/^\//, '');
      }),
  );
  const original = JSON.parse(
    readFileSync(new URL('../migration/source-articles.json', import.meta.url), 'utf8'),
  );
  for (const article of original.articles)
    assert.ok(owners.has(article.file), `Missing owner rule for ${article.file}`);
  for (const path of [
    'src/content/faqs/**',
    'src/content/resources/**',
    'public/uploads/archive/**',
    'migration/**',
    'preservation/**',
  ])
    assert.ok(owners.has(path), `Missing owner rule for ${path}`);

  const workflow = parse(
    readFileSync(new URL('../.github/workflows/validate.yml', import.meta.url), 'utf8'),
  );
  assert.ok(Object.hasOwn(workflow.on, 'pull_request'));
  assert.ok(workflow.on.push.branches.includes('main'));
  const commands = workflow.jobs['tests-and-build'].steps
    .map((step) => step.run)
    .filter(Boolean);
  assert.ok(commands.includes('npm test'));
  assert.ok(commands.includes('npm run build'));
});