import test from 'node:test';
import assert from 'node:assert/strict';
import {
  libraries,
  authorities,
  searchRecords,
  libraryPath,
  authorityByLibrary
} from '../src/lib/directory.mjs';
import { matchesLibrary, isLibraryOpenAt, resolveQueryLocation } from '../src/lib/search.mjs';
import {
  safeURL,
  articleTitle,
  articleImage,
  canonicalInternalPath,
  isOriginalContent,
  isPublishedPage,
  sitePath
} from '../src/lib/site.mjs';
import { preservedLinks, decodeProtectedEmail } from '../src/lib/markdown.mjs';
import { templateFor } from '../src/lib/templates.mjs';

test('directory routes preserve every library with unique URLs and authority relationships', () => {
  assert.equal(searchRecords.length, libraries.length);
  assert.equal(new Set(searchRecords.map((record) => record.url)).size, libraries.length);
  for (const library of libraries) {
    const authority = authorityByLibrary.get(library.id);
    assert.ok(libraryPath(library).startsWith(`/libraries/${authority?.slug || 'unassigned'}/`));
  }
  assert.equal(new Set(authorities.map((authority) => authority.slug)).size, authorities.length);
});

test('directory search matches place, authority, postcode spacing and combined filters', () => {
  const record = {
    name: 'Cherry Hinton Library',
    address: 'Cambridge',
    postcode: 'CB1 9HZ',
    authority: 'cambridgeshire',
    authorityName: 'Cambridgeshire',
    country: 'England',
    services: ['Books', 'Free Wi-Fi', 'Computers'],
    accessibility: ['wheelchair-access', 'step-free-access'],
    hours: {
      monday: [['09:00', '17:00']]
    },
    closed: false,
    latitude: 52.189,
    longitude: 0.175
  };
  for (const query of ['cherry hinton', 'cambridge', 'CB19HZ', 'CB1 9HZ'])
    assert.ok(matchesLibrary(record, { query }));
  assert.ok(matchesLibrary(record, { authority: 'cambridgeshire', country: 'England' }));
  assert.ok(!matchesLibrary(record, { authority: 'other' }));
  assert.ok(!matchesLibrary(record, { query: 'nowhere' }));
  assert.ok(
    matchesLibrary({ ...record, address: 'High Street', town: 'Cambridge' }, { query: 'cambridge' })
  );
  assert.ok(
    matchesLibrary(record, {
      services: ['Books', 'Free Wi-Fi'],
      accessibility: ['wheelchair-access']
    })
  );
  assert.ok(!matchesLibrary(record, { services: ['Books', 'Makerspace'] }));
  assert.ok(!matchesLibrary(record, { accessibility: ['lift-access'] }));
  const mondayMorning = new Date(2026, 9, 26, 10, 30);
  const mondayEvening = new Date(2026, 9, 26, 19, 0);
  assert.equal(isLibraryOpenAt(record, mondayMorning), true);
  assert.equal(isLibraryOpenAt(record, mondayEvening), false);
  assert.ok(matchesLibrary(record, { openNow: true, now: mondayMorning }));
  assert.ok(!matchesLibrary(record, { openNow: true, now: mondayEvening }));
  assert.ok(!matchesLibrary({ ...record, closed: true }, { openNow: true, now: mondayMorning }));
  assert.ok(
    matchesLibrary(record, {
      location: { latitude: 52.2, longitude: 0.14 },
      distance: 5
    })
  );
  assert.ok(
    !matchesLibrary(record, {
      location: { latitude: 51.5, longitude: -0.1 },
      distance: 5
    })
  );
  const resolved = resolveQueryLocation([record], 'CB19HZ');
  assert.equal(resolved.latitude, 52.189);
  assert.equal(resolved.longitude, 0.175);
});

test('editorial types choose explicit templates without rewriting source metadata', () => {
  for (const kind of [
    'article',
    'collection',
    'case-study',
    'conference',
    'grant',
    'legal',
    'landing'
  ]) {
    assert.equal(templateFor({ data: { kind, path: '/example' } }), kind);
  }
  assert.equal(templateFor({ data: { kind: 'page', path: '/grants/round-1' } }), 'grant');
  assert.equal(templateFor({ data: { kind: 'page', path: '/legal/privacy-notice' } }), 'legal');
  assert.equal(templateFor({ data: { kind: 'page', path: '/' } }), 'home');
});

test('shared URL helpers reject active protocols and retain local asset links', () => {
  assert.equal(safeURL('javascript:alert(1)'), null);
  assert.equal(safeURL('//example.com'), null);
  assert.equal(safeURL('hthttps://example.com'), null);
  assert.equal(safeURL('/uploads/slides.pdf'), '/uploads/slides.pdf');
  assert.equal(sitePath('/libraries/'), '/libraries/');
  assert.equal(sitePath('/reading/reading-in-libraries'), '/reading/reading-in-libraries/');
  assert.equal(sitePath('/directory.json'), '/directory.json');
  assert.equal(canonicalInternalPath('/libraries?query=CB1#results'), '/libraries/?query=CB1#results');
  assert.equal(canonicalInternalPath('/uploads/slides.pdf'), '/uploads/slides.pdf');
});

test('content provenance distinguishes LibraryOn source pages from new Commons pages', () => {
  assert.equal(isOriginalContent({ data: { source_url: 'https://libraryon.org/reading' } }), true);
  assert.equal(isOriginalContent({ data: { source_url: 'https://example.org/source' } }), false);
  assert.equal(isOriginalContent({ data: { content_origin: 'libraryon' } }), true);
  assert.equal(
    isOriginalContent({
      data: { content_origin: 'commons', source_url: 'https://libraryon.org/reading' }
    }),
    false
  );
});

test('pages remain public by default and can be kept in the CMS without publishing', () => {
  assert.equal(isPublishedPage({ data: {} }), true);
  assert.equal(isPublishedPage({ data: { published: true } }), true);
  assert.equal(isPublishedPage({ data: { published: false } }), false);
});

test('article previews use preserved headings and local images', () => {
  const entry = {
    body: '# A collection\n\n![A library](/uploads/photo.jpg)',
    data: { title: 'Search title | LibraryOn' }
  };
  assert.equal(articleTitle(entry), 'A collection');
  assert.deepEqual(articleImage(entry), { url: '/uploads/photo.jpg', alt: 'A library' });
  assert.equal(
    articleTitle({
      body: '# From horseback to Big Top:  \nThe early days of circus',
      data: { title: 'From horseback to Big Top: The early days of circus' }
    }),
    'From horseback to Big Top: The early days of circus'
  );
});

test('Markdown links support subpaths and original obfuscated email without client scripts', () => {
  const key = 72;
  const encoded = Buffer.from([
    key,
    ...Buffer.from('hello@example.org?subject=Library').map((byte) => byte ^ key)
  ]).toString('hex');
  assert.equal(
    decodeProtectedEmail(`/cdn-cgi/l/email-protection#${encoded}`),
    'mailto:hello@example.org?subject=Library'
  );
  const tree = {
    type: 'root',
    children: [
      { type: 'element', properties: { src: '/uploads/photo.jpg' }, children: [] },
      { type: 'element', properties: { href: '/work-and-skills/study-work-spaces' }, children: [] },
      {
        type: 'element',
        properties: { href: `/cdn-cgi/l/email-protection#${encoded}` },
        children: []
      },
      { type: 'element', properties: { href: '/www.equalityadvisoryservice.com/' }, children: [] }
    ]
  };
  preservedLinks({ base: '/libraryon-commons/' })(tree);
  assert.equal(tree.children[0].properties.src, '/libraryon-commons/uploads/photo.jpg');
  assert.equal(
    tree.children[1].properties.href,
    '/libraryon-commons/work-and-skills/study-work-spaces/'
  );
  assert.equal(tree.children[2].properties.href, 'mailto:hello@example.org?subject=Library');
  assert.equal(tree.children[3].properties.href, 'https://www.equalityadvisoryservice.com/');
  const externalImage = {
    type: 'element',
    tagName: 'img',
    properties: { src: 'https://example.com/image.jpg', alt: 'Original event image' }
  };
  preservedLinks()(externalImage);
  assert.equal(externalImage.tagName, 'a');
  assert.equal(externalImage.properties.href, 'https://example.com/image.jpg');
  assert.equal(externalImage.children[0].value, 'Original event image');
});

test('imported embeds, image controls, lists, cards and FAQs render as usable components', () => {
  const text = (value) => ({ type: 'text', value });
  const element = (tagName, children = [], properties = {}) => ({
    type: 'element',
    tagName,
    properties,
    children
  });
  const tree = {
    type: 'root',
    children: [
      element('p', [element('img', [], { src: '/photo.jpg', alt: 'Image' })]),
      text('\n'),
      element('p', [text('View')]),
      text('\n'),
      element('p', [text('A caption describing the archival photograph.')]),
      text('\n'),
      element('p', [
        element(
          'a',
          [text('View iframe')],
          { href: 'https://www.youtube.com/embed/example-video' }
        )
      ]),
      element('h2', [text('Questions about reading in libraries')]),
      element('p', [text('Common questions about libraries.')]),
      element('h3', [text('Can I join for free?')]),
      element('p', [text('Yes, joining is free.')]),
      element('h2', [text('More information')]),
      element('p', [text('[')]),
      element('h3', [text('Find your library')]),
      element('p', [text('Read more')]),
      element('p', [text('](/libraries)[')]),
      element('h3', [text('Browse reading')]),
      element('p', [text('Explore books and more')]),
      element('p', [text('](/reading)')]),
      element('p', [text('• Borrow books')]),
      element('p', [text('• Use a computer')]),
      element('p', [text('View')]),
      element('p', [text('1/5')]),
      element('p', [text('12345')])
    ]
  };

  preservedLinks()(tree);

  const htmlNodes = tree.children.filter(
    (node) => !(node.type === 'text' && !node.value.trim())
  );
  assert.equal(htmlNodes[0].children[0].properties.alt, 'A caption describing the archival photograph.');
  assert.ok(!htmlNodes.some((node) => node.tagName === 'p' && node.children?.[0]?.value === 'View'));
  assert.equal(htmlNodes[2].tagName, 'figure');
  assert.equal(htmlNodes[2].children[0].tagName, 'iframe');
  assert.equal(htmlNodes[2].children[0].properties.title, 'Embedded YouTube video');
  assert.equal(htmlNodes[3].tagName, 'section');
  assert.equal(htmlNodes[3].children[2].children[0].tagName, 'details');
  assert.equal(htmlNodes[5].tagName, 'div');
  assert.equal(htmlNodes[5].children.length, 2);
  assert.equal(htmlNodes[5].children[0].properties.href, '/libraries/');
  assert.equal(htmlNodes[6].tagName, 'ul');
  assert.equal(htmlNodes[6].children[0].tagName, 'li');
  assert.ok(!htmlNodes.some((node) => node.tagName === 'p' && /^(View|1\/5|12345)$/.test(node.children?.[0]?.value || '')));
});

test('testimonials, attributed quotes, feature card grids and library activity lists are grouped semantically', () => {
  const text = (value) => ({ type: 'text', value });
  const element = (tagName, children = [], properties = {}) => ({
    type: 'element',
    tagName,
    properties,
    children
  });
  const tree = {
    type: 'root',
    children: [
      element('p', [element('img', [], { src: '/uploads/tracy.jpg', alt: 'Tracy reading to children' })]),
      element('blockquote', [element('p', [text('Bring your little ones to rhyme time.')])]),
      element('p', [element('strong', [text('Tracy')])]),
      element('p', [element('strong', [text('Children & Youth Librarian, Wiltshire Libraries')])]),
      element('blockquote', [element('p', [text('We love our library.')])]),
      element('p', [text('Alex')]),
      element('p', [text('Customer, Sandwell Libraries')]),
      element('h2', [text('Libraries improve lives')]),
      element('p', [element('img', [], { src: '/uploads/one.jpg', alt: 'Reading group' })]),
      element('h3', [text('Reading options for all ages')]),
      element('p', [element('a', [text('Books and more')], { href: '/reading/reading-in-libraries' })]),
      element('p', [element('img', [], { src: '/uploads/two.jpg', alt: 'Sensory space' })]),
      element('h3', [text('Connection and support for families')]),
      element('p', [element('a', [text('Your community')], { href: '/your-community/children-parents-carers-community' })]),
      element('h2', [text('Your public library is a free, open space where you can:')]),
      element('ul', [element('li', [text('borrow books')]), element('li', [text('learn new skills')])])
    ]
  };

  preservedLinks()(tree);

  const htmlNodes = tree.children.filter(
    (node) => !(node.type === 'text' && !node.value.trim())
  );
  assert.equal(htmlNodes[0].tagName, 'figure');
  assert.deepEqual(htmlNodes[0].properties.className, ['testimonial-card']);
  assert.equal(htmlNodes[0].children[0].children[0].properties.src, '/uploads/tracy.jpg');
  assert.equal(htmlNodes[0].children[1].children[0].tagName, 'blockquote');
  assert.equal(htmlNodes[0].children[1].children[1].tagName, 'figcaption');
  assert.equal(htmlNodes[0].children[1].children[1].children.length, 2);

  assert.equal(htmlNodes[1].tagName, 'figure');
  assert.deepEqual(htmlNodes[1].properties.className, ['testimonial-quote']);
  assert.equal(htmlNodes[1].children[1].tagName, 'figcaption');
  assert.equal(htmlNodes[1].children[1].children.length, 2);

  assert.equal(htmlNodes[3].tagName, 'div');
  assert.deepEqual(htmlNodes[3].properties.className, ['imported-content-card-grid']);
  assert.equal(htmlNodes[3].children.length, 2);

  assert.equal(htmlNodes[4].tagName, 'section');
  assert.deepEqual(htmlNodes[4].properties.className, ['library-can-do-panel']);
  assert.equal(htmlNodes[4].children[1].tagName, 'ul');
  assert.deepEqual(htmlNodes[4].children[1].properties.className, ['library-can-do-list']);
});
