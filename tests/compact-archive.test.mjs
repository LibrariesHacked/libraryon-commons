import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { digest } from '../scripts/archive/collect.mjs';
import { compactArchive, isTemplateAsset } from '../scripts/archive/compact.mjs';

test('compact evidence preserves raw content, data and template assets without browser captures', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'libraryon-compact-'));
  try {
    for (const directory of ['archive/content', 'archive/data', 'archive/objects'])
      await mkdir(path.join(root, directory), { recursive: true });
    const page = {
      canonical: 'https://libraryon.org/libraries/example/library',
      html: '<main>Template content</main>'
    };
    const rows = [];
    for (const [file, url, contentType, body] of [
      ['page', page.canonical, 'text/html', '<html>Original template</html>'],
      ['css', 'https://libraryon.org/_next/style.css', 'text/css', 'body { color: black; }'],
      ['image', 'https://libraryon.org/image.jpg', 'image/jpeg', 'duplicate image'],
      ['api', 'https://libraryon.org/cms/api/libraries', 'application/json', '{}']
    ]) {
      await writeFile(path.join(root, 'archive/objects', file), body);
      rows.push({ url, contentType, file: `objects/${file}`, sha256: digest(body), status: 200 });
    }
    const datasets = {
      'libraries.json': {
        data: [{ id: 1, attributes: { name: 'Library', openingTimes: { monday: [] } } }],
        complete: true
      },
      'authorities.json': { data: [], complete: true }
    };
    for (const [file, data] of Object.entries(datasets))
      await writeFile(path.join(root, 'archive/data', file), JSON.stringify(data));
    await writeFile(
      path.join(root, 'archive/content/pages.json'),
      JSON.stringify([{ file: 'content/page.json' }])
    );
    await writeFile(path.join(root, 'archive/content/page.json'), JSON.stringify(page));
    await writeFile(
      path.join(root, 'archive/manifest.jsonl'),
      rows.map((row) => JSON.stringify(row)).join('\n')
    );
    const result = await compactArchive({ root });
    const decode = async (name) =>
      JSON.parse(gunzipSync(await readFile(path.join(root, 'preservation', name))));
    assert.deepEqual(await decode('content.json.gz'), [page]);
    assert.deepEqual(await decode('data.json.gz'), datasets);
    const templates = await decode('templates.json.gz');
    assert.equal(templates.length, 2);
    assert.equal(
      Buffer.from(templates[0].body, 'base64').toString(),
      '<html>Original template</html>'
    );
    assert.equal(result.bundles.length, 3);
    for (const bundle of result.bundles)
      assert.equal(
        digest(await readFile(path.join(root, 'preservation', bundle.file))),
        bundle.sha256
      );
    assert.equal(
      await readFile(path.join(root, 'archive/objects/image'), 'utf8'),
      'duplicate image'
    );
    await writeFile(
      path.join(root, 'archive/data/libraries.json'),
      JSON.stringify({ ...datasets['libraries.json'], complete: false })
    );
    await assert.rejects(compactArchive({ root }), /Incomplete source dataset: libraries.json/);
    await writeFile(
      path.join(root, 'archive/data/libraries.json'),
      JSON.stringify(datasets['libraries.json'])
    );
    await writeFile(path.join(root, 'archive/objects/page'), 'corrupted');
    await assert.rejects(compactArchive({ root }), /Checksum mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('template evidence excludes remote scripts and repeated image/API responses', () => {
  const row = {
    status: 200,
    contentType: 'application/javascript',
    url: 'https://libraryon.org/_next/script.js'
  };
  assert.equal(isTemplateAsset(row), true);
  assert.equal(isTemplateAsset({ ...row, url: 'https://example.com/tracker.js' }), false);
  assert.equal(isTemplateAsset({ ...row, contentType: 'application/json' }), false);
  assert.equal(isTemplateAsset({ ...row, status: 404 }), false);
});
