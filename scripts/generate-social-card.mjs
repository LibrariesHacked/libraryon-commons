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

// Clean, straightforward, understated social share card
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
  background-color: #ffffff;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 68px 80px 60px 80px;
  -webkit-font-smoothing: antialiased;
}

.card-border {
  position: absolute;
  inset: 0;
  border: 1px solid #e7e5e9;
  pointer-events: none;
}

.content-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.brand-wrapper {
  display: flex;
  align-items: center;
  transform: scale(1.22);
  transform-origin: left center;
}

.top-domain {
  font-size: 17px;
  font-weight: 450;
  color: #615f68;
  letter-spacing: 0.01em;
}

.content-main {
  max-width: 960px;
  margin-top: 8px;
}

.headline {
  font-size: 48px;
  font-weight: 600;
  line-height: 1.18;
  color: #1e1a28;
  letter-spacing: -0.02em;
  margin-bottom: 20px;
}

.description {
  font-size: 23px;
  line-height: 1.5;
  color: #615f68;
  font-weight: 350;
  max-width: 880px;
}

.content-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 24px;
  border-top: 1px solid #eae8ec;
}

.footer-features {
  display: flex;
  gap: 28px;
  font-size: 15.5px;
  font-weight: 450;
  color: #615f68;
}

.footer-feature {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.footer-feature::before {
  content: "";
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #671e7d;
}

.footer-meta {
  font-size: 15px;
  font-weight: 400;
  color: #77364b;
}
</style>
</head>
<body>
  <div class="card-border"></div>

  <div class="content-top">
    <div class="brand-wrapper">
      ${wordmarkSvg}
    </div>
    <div class="top-domain">
      librarycommons.org.uk
    </div>
  </div>

  <div class="content-main">
    <h1 class="headline">
      An open commons for UK public libraries
    </h1>
    <p class="description">
      Sharing and maintaining library data, community knowledge, sector news, and local public library information across the UK.
    </p>
  </div>

  <div class="content-footer">
    <div class="footer-features">
      <span class="footer-feature">Library directory</span>
      <span class="footer-feature">News &amp; archive</span>
      <span class="footer-feature">Collections</span>
      <span class="footer-feature">Resources</span>
    </div>
    <div class="footer-meta">
      Community-maintained
    </div>
  </div>
</body>
</html>`

async function generate() {
  const launchOptions = {
    headless: true
  }
  if (process.platform === 'win32') {
    launchOptions.channel = 'msedge'
  }
  const browser = await chromium.launch(launchOptions)
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
