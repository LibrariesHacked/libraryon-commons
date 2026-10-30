import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';

const root = new URL('../src/styles/', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');
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
];

test('stylesheet entry imports foundations, shared components and page rules in order', () => {
  const entry = postcss.parse(read('global.css'));
  assert.ok(
    entry.nodes.every(
      (node) => node.type === 'atrule' && node.name === 'import',
    ),
  );
  const imports = entry.nodes.map((node) =>
    node.params.replace(/^["']|["']$/g, ''),
  );
  assert.deepEqual(
    imports.slice(2),
    modules.map((file) => `./${file}`),
  );
  for (const folder of ['foundations', 'components', 'pages']) {
    const files = readdirSync(new URL(`${folder}/`, root))
      .filter((file) => file.endsWith('.css'))
      .map((file) => `${folder}/${file}`);
    assert.deepEqual(
      files.sort(),
      modules.filter((file) => file.startsWith(`${folder}/`)).sort(),
    );
  }
});

test('selective Open Props imports supply every adopted token without a reset or theme', () => {
  const tokens = postcss.parse(read('foundations/tokens.css'));
  const imports = tokens.nodes
    .filter((node) => node.type === 'atrule' && node.name === 'import')
    .map((node) => node.params.replace(/^["']|["']$/g, ''));
  assert.deepEqual(imports, [
    'open-props/sizes',
    'open-props/borders',
    'open-props/fonts',
    'open-props/aspects',
    'open-props/easings',
    'open-props/zindex',
  ]);
  const available = new Map();
  for (const file of [
    'sizes',
    'borders',
    'fonts',
    'aspects',
    'easings',
    'zindex',
  ]) {
    postcss
      .parse(
        readFileSync(
          new URL(import.meta.resolve(`open-props/${file}`)),
          'utf8',
        ),
      )
      .walkDecls((declaration) =>
        available.set(declaration.prop, declaration.value),
      );
  }
  let uses = 0;
  for (const file of modules) {
    postcss.parse(read(file)).walkDecls((declaration) => {
      for (const match of declaration.value.matchAll(
        /var\((--(?:size-\d+|border-size-\d+|font-size-\d+|font-weight-\d+|font-lineheight-\d+|ratio-[a-z]+|ease-\d+|layer-\d+))\)/g,
      )) {
        assert.ok(available.has(match[1]), `${file}: undefined ${match[1]}`);
        uses += 1;
      }
    });
  }
  assert.ok(uses >= 100, `${uses} Open Props references are used`);
  assert.equal(available.get('--size-4'), '1.25rem');
  assert.equal(available.get('--size-6'), '1.75rem');
  const brand = new Map();
  tokens.walkDecls((declaration) =>
    brand.set(declaration.prop, declaration.value),
  );
  assert.equal(brand.get('--brand-primary'), '#671e7d');
  assert.equal(brand.get('--card-radius'), '4px');
  assert.equal(brand.get('--card-padding'), 'var(--size-4)');
});

test('site and CMS previews continue to consume the same complete stylesheet entry', () => {
  const site = readFileSync(
    new URL('../src/layouts/SiteLayout.astro', import.meta.url),
    'utf8',
  );
  const admin = readFileSync(
    new URL('../src/pages/admin/index.astro', import.meta.url),
    'utf8',
  );
  assert.ok(site.includes("import '../styles/global.css'"));
  assert.ok(
    admin.includes(
      "import previewStyles from '../../styles/global.css?inline'",
    ),
  );
  assert.ok(
    admin.includes('registerPreviewStyle(previewStyles, { raw: true })'),
  );
  for (const file of modules)
    assert.doesNotThrow(() =>
      postcss.parse(read(file), { from: path.join('src/styles', file) }),
    );
});
