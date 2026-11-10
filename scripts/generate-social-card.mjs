import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const root = process.cwd()
const fontWoff2 = fs
  .readFileSync(
    path.join(root, 'node_modules/@fontsource-variable/lexend/files/lexend-latin-wght-normal.woff2')
  )
  .toString('base64')

const wordmarkSvg = fs.readFileSync(path.join(root, 'public/brand/wordmark.svg'), 'utf8')

// Create HTML for a refined, elegant social share card
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
@font-face {
  font-family: 'Lexend Variable';
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url(data:font/woff2;base64,${fontWoff2}) format('woff2');
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  width: 1200px;
  height: 630px;
  overflow: hidden;
  font-family: 'Lexend Variable', -apple-system, BlinkMacSystemFont, sans-serif;
  color: #1e1a28;
  background-color: #fdfbfc;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 68px 80px 60px 80px;
  -webkit-font-smoothing: antialiased;
}

/* Subtle, painterly ambient library warmth */
.ambient-glow-plum {
  position: absolute;
  top: -160px;
  right: -100px;
  width: 720px;
  height: 720px;
  background: radial-gradient(circle, rgba(245, 230, 248, 0.85) 0%, rgba(251, 242, 244, 0.45) 50%, rgba(253, 251, 252, 0) 72%);
  pointer-events: none;
  z-index: 0;
}

.ambient-glow-rose {
  position: absolute;
  bottom: -180px;
  left: -80px;
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, rgba(251, 240, 233, 0.7) 0%, rgba(248, 237, 241, 0.35) 50%, rgba(253, 251, 252, 0) 70%);
  pointer-events: none;
  z-index: 0;
}

/* Subtle watermark of the open book icon in the background */
.top-accent-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 5px;
  background: linear-gradient(90deg, #671e7d 0%, #cc808d 55%, #cc8a6c 100%);
  z-index: 10;
}

.card-border {
  position: absolute;
  inset: 0;
  border: 1px solid rgba(103, 30, 125, 0.08);
  pointer-events: none;
  z-index: 10;
}

.watermark-book {
  position: absolute;
  right: 50px;
  top: 50%;
  transform: translateY(-50%);
  width: 480px;
  height: 480px;
  opacity: 0.055;
  color: #671e7d;
  pointer-events: none;
  z-index: 0;
}

.content-top {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand-wrapper {
  display: flex;
  align-items: center;
  transform: scale(1.18);
  transform-origin: left center;
}

.pill-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
  background: #f5e6f8;
  color: #420454;
  border-radius: 999px;
  font-size: 14.5px;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.pill-eyebrow::before {
  content: "";
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #671e7d;
}

.content-main {
  position: relative;
  z-index: 1;
  max-width: 900px;
  margin-top: 10px;
}

.headline {
  font-size: 50px;
  font-weight: 600;
  line-height: 1.18;
  color: #1e1a28;
  letter-spacing: -0.025em;
  margin-bottom: 22px;
}

.headline-accent {
  color: #671e7d;
}

.description {
  font-size: 23px;
  line-height: 1.45;
  color: #615f68;
  font-weight: 350;
  max-width: 820px;
}

.content-footer {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding-top: 24px;
  border-top: 1px solid rgba(103, 30, 125, 0.1);
}

.pills-group {
  display: flex;
  gap: 12px;
  align-items: center;
}

.chip {
  padding: 8px 18px;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
}

.chip-plum {
  background: #f5e6f8;
  color: #420454;
}

.chip-rose {
  background: #f8edf1;
  color: #77364b;
}

.chip-apricot {
  background: #fbf0e9;
  color: #8c4728;
}

.domain-badge {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 17px;
  font-weight: 500;
  color: #420454;
}

.domain-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #cc808d;
}
</style>
</head>
<body>
  <div class="top-accent-bar"></div>
  <div class="card-border"></div>
  <div class="ambient-glow-plum"></div>
  <div class="ambient-glow-rose"></div>

  <!-- Decorative open book vector watermark -->
  <svg class="watermark-book" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 5v16"/>
    <path d="M20.001 19A2 2 0 0 0 22 17V5a2 2 0 0 0-1.999-2L16 3.002A5 5 0 0 0 12 5a5 5 0 0 0-4-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 1.999 2H8a5 5 0 0 1 4 2 5 5 0 0 1 4-2z"/>
  </svg>

  <div class="content-top">
    <div class="brand-wrapper">
      ${wordmarkSvg}
    </div>
    <div class="pill-eyebrow">
      Libraries · Knowledge · Community
    </div>
  </div>

  <div class="content-main">
    <h1 class="headline">
      Your next chapter <span class="headline-accent">starts here.</span>
    </h1>
    <p class="description">
      A community-maintained commons for library stories, knowledge, cultural archives and local library information across the UK.
    </p>
  </div>

  <div class="content-footer">
    <div class="pills-group">
      <span class="chip chip-plum">Local library directory</span>
      <span class="chip chip-rose">Stories &amp; knowledge</span>
      <span class="chip chip-apricot">Cultural archives</span>
    </div>
    <div class="domain-badge">
      <span class="domain-dot"></span>
      librarycommons.org.uk
    </div>
  </div>
</body>
</html>`

async function generate() {
  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1
  })
  await page.setContent(html, { waitUntil: 'networkidle' })
  const outputPath = path.join(root, 'public/brand/social-card.png')
  await page.screenshot({
    path: outputPath,
    type: 'png'
  })
  await browser.close()
  console.log(`Social card successfully generated at ${outputPath}`)
}

generate().catch(console.error)
