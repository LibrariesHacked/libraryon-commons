import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allowed,
  references,
  paginationComplete,
  collectionRequestURL,
  objectPath,
  editorialURL,
  pageContent
} from '../scripts/archive/collect.mjs';

test('scope excludes CMS administration and unrelated hosts', () => {
  assert.equal(allowed('https://libraryon.org/cms/admin', true), false);
  assert.equal(allowed('https://libraryon.org/cms/api/libraries'), false);
  assert.equal(allowed('https://libraryon.org/cms/api/libraries', true), true);
  assert.equal(allowed('https://libraryon.org/cms/%61dmin', true), false);
  assert.equal(allowed('https://example.com/image.jpg'), false);
  assert.equal(allowed('https://libraryon.lon1.digitaloceanspaces.com/image.jpg'), true);
  assert.equal(allowed('https://lon1.digitaloceanspaces.com/libraryon/slides.pdf'), true);
  assert.equal(allowed('https://lon1.digitaloceanspaces.com/another-bucket/file.pdf'), false);
});

test('asset discovery handles HTML, srcset, styles and nested CSS dependencies', () => {
  const html =
    '<link href="/style.css"><img src="/one.jpg" srcset="/two.jpg 2x, /three.jpg 3x"><a href="/another-page">Page</a><a href="/file.pdf">PDF</a><style>body{background:url(/bg.png)}</style>';
  const found = references(html, 'https://libraryon.org/', 'text/html');
  for (const name of ['style.css', 'one.jpg', 'two.jpg', 'three.jpg', 'file.pdf', 'bg.png'])
    assert.ok(found.includes(`https://libraryon.org/${name}`));
  assert.ok(!found.includes('https://libraryon.org/another-page'));
  assert.deepEqual(
    references(
      '@font-face{src:url("./font.woff2")}',
      'https://libraryon.org/css/main.css',
      'text/css'
    ),
    ['https://libraryon.org/css/font.woff2']
  );
  assert.deepEqual(
    references('svg{clip-path:url(#clip)}', 'https://libraryon.org/style.css', 'text/css'),
    []
  );
});

test('pagination checks totals and unique IDs rather than assuming success', () => {
  assert.equal(paginationComplete([{ id: 1 }, { id: 2 }], { total: 2 }), true);
  assert.equal(paginationComplete([{ id: 1 }, { id: 1 }], { total: 2 }), false);
  assert.equal(paginationComplete([{ id: 1 }], { total: 2 }), false);
});

test('library API captures nested event tags and occurrences without recursive cycles', () => {
  const url = collectionRequestURL('libraries', 5);
  assert.equal(url.pathname, '/cms/api/libraries');
  assert.equal(url.searchParams.get('pagination[page]'), '5');
  assert.equal(url.searchParams.get('pagination[pageSize]'), '100');
  assert.equal(url.searchParams.get('populate'), '*');
  assert.equal(url.searchParams.get('populate[events][populate][tags]'), '*');
  assert.equal(url.searchParams.get('populate[events][populate][occurrences]'), '*');
  assert.equal(url.searchParams.get('populate[events][populate][library]'), null);
});

test('query variants get distinct stable object names', () => {
  assert.equal(objectPath('https://libraryon.org/'), objectPath('https://libraryon.org/'));
  assert.notEqual(
    objectPath('https://libraryon.org/?page=1'),
    objectPath('https://libraryon.org/?page=2')
  );
});

test('unique-page discovery excludes generated library records and static assets', () => {
  assert.equal(editorialURL('/about/pressplay#slides'), 'https://libraryon.org/about/pressplay');
  assert.equal(
    editorialURL('/grants/case-study?utm_source=nav'),
    'https://libraryon.org/grants/case-study'
  );
  for (const value of [
    '/libraries/authority/library',
    '/libraries/authority',
    '/events/example',
    '/cdn-cgi/l/email-protection',
    '/slides.pdf',
    'https://example.com/'
  ])
    assert.equal(editorialURL(value), null);
});

test('CMS export retains rich content, image credits, slide and recording links', () => {
  const html =
    '<title>Press Play</title><link rel="canonical" href="https://libraryon.org/about/pressplay"><main><h1>Conference</h1><svg><title>Social icon</title></svg><figure><img src="/photo.jpg" alt="Speaker"><figcaption>Photo credit</figcaption></figure><a href="https://lon1.digitaloceanspaces.com/libraryon/slides.pdf">Slides</a><a href="https://youtu.be/example">Recording</a><iframe src="https://example.com/embed"></iframe><script>tracker()</script></main>';
  const record = pageContent(html, 'https://libraryon.org/about/pressplay');
  assert.equal(record.title, 'Press Play');
  assert.equal(record.images[0].url, 'https://libraryon.org/photo.jpg');
  assert.equal(record.links.length, 2);
  assert.equal(record.embeds.length, 1);
  assert.ok(record.html.includes('Photo credit'));
  assert.ok(!record.html.includes('tracker()'));
  assert.ok(
    references(html, record.source, 'text/html').includes(
      'https://lon1.digitaloceanspaces.com/libraryon/slides.pdf'
    )
  );
});

test('image discovery keeps original images behind thumbnails and both storage URL formats', () => {
  const image = 'https://lon1.digitaloceanspaces.com/libraryon/original.jpg';
  const thumbnail = `/\u005fnext/image?url=${encodeURIComponent(image)}&w=640&q=75`;
  const html = `<img src="${thumbnail}">`;
  const found = references(html, 'https://libraryon.org/', 'text/html');
  assert.ok(found.includes(image));
  assert.ok(
    references(
      JSON.stringify({ url: image }),
      'https://libraryon.org/',
      'application/json'
    ).includes(image)
  );
  assert.deepEqual(
    references('a{clip-path:url(%23clip)}', 'https://libraryon.org/style.css', 'text/css'),
    []
  );
  assert.ok(
    references(
      '<img src="lon1.digitaloceanspaces.com/libraryon/photo.jpg">',
      'https://libraryon.org/',
      'text/html'
    ).includes('https://lon1.digitaloceanspaces.com/libraryon/photo.jpg')
  );
});
