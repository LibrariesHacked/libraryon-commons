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
  sitePath,
  mediaURL
} from '../src/lib/site.mjs';
import { preservedLinks, decodeProtectedEmail } from '../src/lib/markdown.mjs';
import { templateFor } from '../src/lib/templates.mjs';
import { splitContentModules, unlinkedResources } from '../src/lib/content-modules.mjs';
import { createMarkdownProcessor } from '@astrojs/markdown-remark';
import remarkDirective from 'remark-directive';
import { contentDirectives } from '../src/lib/content-directives.mjs';
import { transformImportedMarkup } from '../scripts/archive/legacy-markup.mjs';
import { load } from 'cheerio';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import astroConfig from '../astro.config.mjs';
import { normalizeListSpacing } from '../src/lib/markdown-format.mjs';
import { normalizeLinkedCards } from '../scripts/normalize-content.mjs';

test('carousel and filter mechanics use maintained engines and native browser primitives', () => {
  const home = readFileSync(new URL('../src/templates/HomeTemplate.astro', import.meta.url), 'utf8');
  assert.ok(home.includes("from 'embla-carousel'"));
  assert.ok(home.includes("from 'embla-carousel-autoplay'"));
  assert.ok(!home.includes('setInterval('));
  assert.ok(!home.includes('requestAnimationFrame('));
  const directory = readFileSync(new URL('../src/pages/libraries/index.astro', import.meta.url), 'utf8');
  assert.equal((directory.match(/popover="auto"/g) || []).length, 2);
  assert.ok(directory.includes('popovertarget="Services-panel"'));
  assert.ok(directory.includes('popovertarget="Distance-panel"'));
  assert.ok(directory.includes("from '@floating-ui/dom'"));
  assert.ok(!directory.includes('const togglePanel'));
  assert.ok(!directory.includes("document.addEventListener('mousedown'"));
  assert.ok(!directory.includes("document.addEventListener('keydown'"));
});

test('Markdown list markers normalize without changing nested structure or code', () => {
  const source = '-   Parent\n    -   Child\n        continuation\n\n```md\n-   Keep code\n```\n';
  const normalized = normalizeListSpacing(source);
  assert.ok(normalized.startsWith('- Parent\n  - Child\n    continuation'));
  assert.ok(normalized.includes('-   Keep code'));
  assert.equal(normalizeListSpacing(normalized), normalized);
  const link = normalizeLinkedCards(':::card\n\n### Read together\n\n[Explore](/reading)\n\n:::');
  assert.equal(link.linked, 1);
  assert.ok(link.source.startsWith(':::card{href="/reading"}'));
  assert.ok(!link.source.includes('[Explore]'));
  assert.equal(normalizeLinkedCards(link.source).linked, 0);
});

test('linked Markdown cards use the common body, heading and Lucide arrow structure', async () => {
  const processor = await createMarkdownProcessor({ remarkPlugins: [remarkDirective, contentDirectives] });
  const document = load((await processor.render('::::cards\n\n:::card{href="/reading"}\n\n![Reading](/photo.jpg)\n\n### Reading together\n\nA description.\n\n:::\n\n::::')).code);
  assert.equal(document('a.content-card[href="/reading"] > img').length, 1);
  assert.equal(document('a.content-card > .content-card-body > .content-card-heading').length, 1);
  assert.equal(document('.content-card-heading .content-card-arrow path').length, 2);
  assert.equal(document('a.content-card a').length, 0);
});

test('Markdown component source changes are included in the content-cache fingerprint', () => {
  const hash = createHash('sha256');
  for (const file of ['content-directives.mjs', 'markdown.mjs', 'site.mjs'])
    hash.update(readFileSync(new URL(`../src/lib/${file}`, import.meta.url))).update('\0');
  const options = astroConfig.markdown.processor.options.rehypePlugins.find(([plugin]) => plugin === preservedLinks)[1];
  assert.equal(options.rendererDigest, hash.digest('hex'));
});

test('named Markdown blocks render explicit components and ordinary content stays ordinary', async () => {
  const processor = await createMarkdownProcessor({ remarkPlugins: [remarkDirective, contentDirectives], rehypePlugins: [[preservedLinks, { base: '/commons/' }]], smartypants: false });
  const markdown = ':::testimonial{author="Tracy" role="Librarian" organisation="Wiltshire Libraries" url="/libraries/wiltshire"}\n\n![Reading](/photo.jpg)\n\n> Bring your little ones.\n\n:::\n\n:::quote{author="Alex" role="Customer"}\n\n> We love our library.\n\n:::\n\n::::cards\n\n:::card\n\n![Books](/books.jpg)\n\n### Reading\n\n[Explore](/reading)\n\n:::\n\n::::\n\n:::list-panel\n\n## Activities\n\n- Borrow books\n- Learn skills\n\n:::\n\n::video{src="https://www.youtube.com/embed/example" title="Library film"}';
  const document = load((await processor.render(markdown)).code);
  assert.equal(document('figure.testimonial-card').length, 1);
  assert.equal(document('.testimonial-body blockquote').text().trim(), 'Bring your little ones.');
  assert.equal(document('.quote-author').first().text(), 'Tracy');
  assert.equal(document('.quote-role a').attr('href'), '/commons/libraries/wiltshire/');
  assert.equal(document('figure.testimonial-quote').length, 1);
  assert.equal(document('.imported-content-card-grid > .imported-content-card > img').length, 1);
  assert.equal(document('.library-can-do-panel .library-can-do-list li').length, 2);
  assert.equal(document('.video-embed iframe').attr('title'), 'Library film');
  assert.equal(document('.video-embed-player iframe').attr('loading'), 'lazy');
  assert.equal(document('.video-embed figcaption a').attr('href'), 'https://www.youtube.com/watch?v=example');
  assert.equal(document('.video-embed figcaption a').text(), 'Watch on YouTube');
  const ordinary = (await processor.render('![Photo](/photo.jpg)\n\n> A quote.\n\nTracy\n\nLibrarian, Wiltshire\n\n## Your public library is a free, open space where you can:\n\n- Borrow books\n\n[View iframe](https://www.youtube.com/embed/example)')).code;
  assert.ok(!ordinary.includes('testimonial-card'));
  assert.ok(!ordinary.includes('testimonial-quote'));
  assert.ok(!ordinary.includes('library-can-do-panel'));
  assert.ok(!ordinary.includes('<iframe'));
  await assert.rejects(processor.render(':::quote\n\n> No author.\n\n:::'), /author is required/);
  await assert.rejects(processor.render(':::unknown\n\nText\n\n:::'), /unknown content block/);
  await assert.rejects(processor.render(':::card{href="javascript:alert(1)"}\n\nText\n\n:::'), /links must use/);
});

test('master image resolution preserves suffixes and leaves unrelated URLs alone', () => {
  const aliases = { '/uploads/small.jpg': { url: '/uploads/original.jpg' } };
  assert.equal(mediaURL('/uploads/small.jpg?download=1#detail', aliases), '/uploads/original.jpg?download=1#detail');
  assert.equal(mediaURL('/uploads/other.jpg', aliases), '/uploads/other.jpg');
  assert.equal(mediaURL('https://example.org/photo.jpg', aliases), 'https://example.org/photo.jpg');
  assert.equal(mediaURL(null, aliases), null);
});

test('cached Markdown media resolves original masters at the shared content boundary', () => {
  const old = '/uploads/archive/a-man-and-a-woman-laugh-together-in-a-reading-group-discussion.jpg';
  const master = mediaURL(old);
  assert.notEqual(master, old);
  const html = `<p><a href="${old}#detail"><img src="${old}" alt="Reading group"></a></p>`;
  const blocks = splitContentModules(html);
  assert.ok(blocks[0].html.includes(`src="${master}"`));
  assert.ok(blocks[0].html.includes(`href="${master}#detail"`));
  const prefixed = splitContentModules(html.replaceAll('/uploads/', '/commons/uploads/'), { base: '/commons/' });
  assert.ok(prefixed[0].html.includes(`src="/commons${master}"`));
});

test('content modules use explicit positions once, or follow the page body by default', () => {
  const blocks = splitContentModules('<p>Before</p><p>{{faqs}}</p><h2>After</h2><p>{{faqs}}</p><p>{{resources}}</p>');
  assert.deepEqual(blocks, [
    { type: 'html', html: '<p>Before</p>' },
    { type: 'faqs' },
    { type: 'html', html: '<h2>After</h2>' },
    { type: 'resources' }
  ]);
  assert.deepEqual(splitContentModules('<p>Body</p>').map((block) => block.type), ['html', 'faqs', 'resources']);
  assert.ok(splitContentModules('<pre><code>{{faqs}}</code></pre><p>A {{resources}} example</p>')[0].html.includes('<code>{{faqs}}</code>'));
});

test('FAQ references retain their introduction and anchor without inline answers', () => {
  const html = '<p>Before</p><h2 id="questions">Questions</h2><p>Introduction</p><p>{{faqs}}</p><h2>After</h2>';
  const blocks = splitContentModules(html, { faqHeading: 'Questions' });
  assert.deepEqual(blocks[1], { type: 'faqs', headingId: 'questions', introduction: '<p>Introduction</p>' });
  assert.ok(blocks[0].html.includes('Before'));
  assert.ok(blocks[2].html.includes('After'));
  assert.ok(!JSON.stringify(blocks).includes('{{faqs}}'));
});

test('resource modules include external links but avoid body links, duplicates and unsafe URLs', () => {
  const resources = [
    { url: '/reading', kind: 'link' },
    { url: '/uploads/guide.pdf', kind: 'document' },
    { url: 'https://example.org/video', kind: 'recording' },
    { url: 'https://example.org/video', kind: 'link' },
    { url: 'javascript:alert(1)', kind: 'link' }
  ];
  assert.deepEqual(unlinkedResources('<a href="/reading/">Read</a><a href="/uploads/guide.pdf">Guide</a>', resources), [resources[2]]);
  assert.deepEqual(unlinkedResources('<a href="/reading/">Read</a><a href="/uploads/guide.pdf">Guide</a><div class="faq-answer"><a href="https://example.org/video">Watch</a></div>', resources), []);
});

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

test('legacy migration recognizes imported embeds, image controls, lists, cards and FAQs', () => {
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

  transformImportedMarkup(tree, '');
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

test('legacy migration recognizes testimonials, cards and list groupings', () => {
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

  transformImportedMarkup(tree, '');
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
