import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  cleanContent,
  extractSessions,
  pageID,
  resourceKind,
  writeManaged,
  pruneSessions,
  contentTitle,
  extractUpdatedDate
} from '../scripts/archive/import.mjs';

test('Markdown conversion preserves meaningful content, captions, tables and local media', () => {
  const html =
    '<h1>Collections</h1><p>Useful <strong>content</strong>.</p><figure><img src="https://libraryon.org/photo.jpg" alt="A library"><figcaption>Photo credit</figcaption></figure><table><thead><tr><th>Title</th></tr></thead><tbody><tr><td>Document</td></tr></tbody></table><a href="/file.pdf">Slides</a><script>alert(1)</script><footer>Duplicate footer</footer>';
  const body = cleanContent(html, 'https://libraryon.org/', (url) =>
    url.endsWith('photo.jpg')
      ? '/uploads/photo.jpg'
      : url.endsWith('file.pdf')
        ? '/uploads/slides.pdf'
        : url
  );
  for (const text of [
    '# Collections',
    '**content**',
    'Photo credit',
    '/uploads/photo.jpg',
    '/uploads/slides.pdf',
    'Document'
  ])
    assert.ok(body.includes(text));
  assert.ok(!body.includes('alert(1)'));
  assert.ok(!body.includes('Duplicate footer'));
});

test('block cards become linked Markdown headings and empty overlays get accessible labels', () => {
  const html =
    '<a aria-label="View details for Business support" href="/work-and-skills/business-support"><div><img src="/business.jpg" alt="A library business centre"><div><h3>Business support in libraries</h3><p>Advice to start and grow a business.</p></div></div></a><a href="/libraries/example"></a><p>View</p><p>1/5</p><p>12345</p>';
  const body = cleanContent(html, 'https://libraryon.org/work-and-skills', (url) => new URL(url).pathname);
  assert.ok(body.includes('![A library business centre](/business.jpg)'));
  assert.ok(body.includes('### [Business support in libraries](/work-and-skills/business-support)'));
  assert.ok(body.includes('Advice to start and grow a business.'));
  assert.ok(!body.includes('[](/libraries/example)'));
  assert.ok(!/^\[$/m.test(body));
  assert.ok(!body.includes('View'));
  assert.ok(!body.includes('1/5'));
  assert.ok(!body.includes('12345'));
  assert.ok(!body.includes('\n\n\n'));
});

test('block card links, map controls, empty overlays and spacing produce readable Markdown', () => {
  const html =
    '<label><input type="checkbox"><span><p>Libraries</p><p>Events</p></span></label><a href="/libraries/authority"><div><span>Greenwich</span></div></a><a href="/libraries/authority/library" aria-label="View details for Central Library"></a><a href="/libraries/card"><div><img src="/central.jpg" alt="A library"><div><h3>Central Library</h3><p>Books, events and services.</p></div></div></a><a href="/libraries/image"><div><img src="/library.jpg" alt="Library"></div></a><button aria-controls="Services-panel" aria-expanded="false">Services</button><button aria-controls="Distance-panel" aria-expanded="false">Distance</button><button>Show more</button><button>List view</button><button>Map view</button><div><button aria-label="Previous slide">Previous</button><span>1/5</span><button aria-label="Next slide">Next</button></div><p>1/5</p><p>12345</p>';
  const body = cleanContent(html, 'https://libraryon.org/libraries');
  assert.ok(body.includes('[Greenwich](https://libraryon.org/libraries/authority)'));
  assert.ok(
    body.includes('[View details for Central Library](https://libraryon.org/libraries/authority/library)')
  );
  assert.ok(body.includes('### [Central Library](https://libraryon.org/libraries/card)'));
  assert.ok(body.includes('![A library](https://libraryon.org/central.jpg)'));
  assert.ok(
    body.includes('[![Library](https://libraryon.org/library.jpg)](https://libraryon.org/libraries/image)')
  );
  assert.ok(body.includes('Books, events and services.'));
  for (const control of ['Libraries', 'Events', 'Services', 'Distance', 'Show more', 'List view', 'Map view', '1/5', '12345'])
    assert.ok(!body.includes(control), `unexpected control text: ${control}`);
  assert.ok(!/^\[$/m.test(body));
  assert.ok(!body.includes('\n\n\n'));
});

test('headings and quote blocks normalize source line breaks and whitespace-only gaps', () => {
  const html = '<h2>Reading recommendations from<br>Wakefield Libraries</h2><blockquote><p>First paragraph.</p><p>Second paragraph.</p></blockquote>';
  const body = cleanContent(html, 'https://libraryon.org/circus');
  assert.ok(body.includes('## Reading recommendations from Wakefield Libraries'));
  assert.ok(body.includes('> First paragraph.\n\n> Second paragraph.'));
  assert.ok(!/\n[ \t]+\n/.test(body));
});

test('sessions keep each card associated with its own slide and recording links', () => {
  const html =
    '<h2>Data sessions</h2><article><h3>Library data in practice</h3><p>Useful methods from the speakers.</p><a href="/one.pdf">View slides PDF</a><a href="https://youtu.be/one">View recording</a></article><article><h3>Making collections accessible</h3><p>Useful approaches for library collections.</p><a href="/two.pdf">View slides PDF</a></article>';
  const sessions = extractSessions(html, 'https://libraryon.org/about/pressplay');
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].links.length, 2);
  assert.equal(sessions[1].links[0].url, 'https://libraryon.org/two.pdf');
  assert.equal(sessions[0].theme, 'Data sessions');
});

test('paragraph-based conference sessions do not merge at the theme container', () => {
  const html =
    '<h2>Engagement</h2><div><p><strong>First session title</strong> - Speaker One</p><p><a href="/one.pdf"><strong>View slides PDF</strong></a></p><p><strong>Second session title</strong> - Speaker Two</p><p><a href="/two.pdf"><strong>View slides PDF</strong></a><a href="https://youtu.be/two"><strong>View recording</strong></a></p></div>';
  const sessions = extractSessions(html, 'https://libraryon.org/about/pressplay');
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].title, 'First session title');
  assert.equal(sessions[1].title, 'Second session title');
  assert.deepEqual(
    sessions.map((session) => session.links.length),
    [1, 2]
  );
  assert.ok(sessions.every((session) => session.theme === 'Engagement'));
});

test('stable IDs and resource types distinguish pages, slides and recordings', () => {
  assert.equal(pageID('https://libraryon.org/'), 'home');
  assert.equal(pageID('https://libraryon.org/about/pressplay'), 'about--pressplay');
  assert.equal(resourceKind('https://youtu.be/example'), 'recording');
  assert.equal(resourceKind('https://example.com/slides.pdf', 'View slides PDF'), 'slides');
});

test('blank source titles fall back to the preserved H1 rather than empty CMS metadata', () => {
  const record = {
    canonical: 'https://libraryon.org/special-collections/circus',
    title: '',
    headings: [{ level: 1, text: 'The early days of circus' }]
  };
  assert.equal(contentTitle(record), 'The early days of circus');
  assert.equal(contentTitle({ ...record, title: 'Source metadata' }), 'Source metadata');
  assert.equal(contentTitle({ ...record, title: 'From horseback to Big Top:The early days' }), 'From horseback to Big Top: The early days');
  assert.equal(contentTitle({ ...record, headings: [] }), '/special-collections/circus');
});

test('reimport protects editor changes and does not overwrite unknown existing files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'libraryon-import-'));
  try {
    const state = {};
    const conflicts = [];
    await writeManaged(root, 'page.md', 'Original', {}, state, conflicts);
    await writeManaged(root, 'page.md', 'Edited by author', {}, {}, []);
    assert.equal(await readFile(path.join(root, 'page.md'), 'utf8'), 'Original');
    const next = {};
    await writeManaged(root, 'page.md', 'Updated source', state, next, conflicts);
    assert.equal(await readFile(path.join(root, 'page.md'), 'utf8'), 'Updated source');
    assert.equal(
      await writeManaged(root, 'page.md', 'Another update', state, {}, conflicts),
      false
    );
    assert.deepEqual(conflicts, ['page.md']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('refresh mode overwrites tracked Markdown but leaves unknown files protected', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'libraryon-refresh-'));
  try {
    const managed = 'src/content/pages/managed.md';
    const unknown = 'src/content/pages/unknown.md';
    const previous = {};
    const next = {};
    const conflicts = [];
    await writeManaged(root, managed, 'Generated before cleanup', {}, previous, []);
    await writeFile(path.join(root, managed), 'Manual edit');
    assert.equal(
      await writeManaged(root, managed, 'Clean generated Markdown', previous, next, conflicts, {
        force: true
      }),
      true
    );
    assert.equal(await readFile(path.join(root, managed), 'utf8'), 'Clean generated Markdown');
    await writeFile(path.join(root, unknown), 'Unknown manual file');
    assert.equal(
      await writeManaged(root, unknown, 'Generated content', previous, next, conflicts, {
        force: true
      }),
      false
    );
    assert.equal(await readFile(path.join(root, unknown), 'utf8'), 'Unknown manual file');
    assert.deepEqual(conflicts, ['src/content/pages/unknown.md']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('identical generated files retain their modification time and import checksum', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'libraryon-import-'));
  try {
    const filename = path.join(root, 'page.md');
    const next = {};
    await writeManaged(root, 'page.md', 'Unchanged', {}, {}, []);
    await utimes(filename, new Date('2020-01-01'), new Date('2020-01-01'));
    const before = await stat(filename);
    assert.equal(await writeManaged(root, 'page.md', 'Unchanged', {}, next, []), true);
    assert.equal((await stat(filename)).mtimeMs, before.mtimeMs);
    assert.ok(next['page.md']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('obsolete generated sessions are removed only while their checksums match', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'libraryon-sessions-'));
  try {
    const previous = {};
    const obsolete = 'src/content/sessions/obsolete.json';
    const edited = 'src/content/sessions/edited.json';
    const active = 'src/content/sessions/active.json';
    for (const file of [obsolete, edited, active])
      await writeManaged(root, file, 'Original', {}, previous, []);
    await writeManaged(root, edited, 'Author edit', previous, {}, []);
    const next = { ...previous };
    const conflicts = [];
    await pruneSessions(root, previous, next, new Set([active]), conflicts);
    await assert.rejects(readFile(path.join(root, obsolete)), { code: 'ENOENT' });
    assert.equal(await readFile(path.join(root, edited), 'utf8'), 'Author edit');
    assert.equal(await readFile(path.join(root, active), 'utf8'), 'Original');
    assert.deepEqual(conflicts, [edited]);
    assert.equal(next[obsolete], undefined);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('source "Last updated" lines become ISO metadata and leave the body', () => {
  const plain = extractUpdatedDate('# Title\n\nLast updated: 3 June 2026\n\nBody text.\n');
  assert.equal(plain.updated_on, '2026-06-03');
  assert.equal(plain.body, '# Title\n\nBody text.\n');
  const decorated = extractUpdatedDate('Last updated: Friday **31 October 2025.**\n\nBody.\n');
  assert.equal(decorated.updated_on, '2025-10-31');
  const unchanged = extractUpdatedDate('It was last updated on 1 May 2025.\n');
  assert.equal(unchanged.updated_on, undefined);
  assert.equal(unchanged.body, 'It was last updated on 1 May 2025.\n');
});

test('empty bold joins, typed bullets and double line breaks become clean Markdown', () => {
  const body = cleanContent(
    '<p><strong>In 2025</strong><strong>.</strong></p><p>• One</p><p>• Two</p><p>End.<br><br>Next.</p>',
    'https://libraryon.org/x'
  );
  assert.ok(!body.includes('****'));
  assert.ok(body.includes('- One\n- Two'));
  assert.ok(body.includes('End.\n\nNext.'));
});

test('only the first source H1 stays a top-level heading', () => {
  const body = cleanContent('<h1>Title</h1><h1>Section one</h1><h1>Section two</h1>', 'https://libraryon.org/x');
  assert.ok(body.startsWith('# Title'));
  assert.ok(body.includes('## Section one') && body.includes('## Section two'));
});
