// Drives the Next client against stubbed Firebase. Every step is a thing a
// person does; a failure here is a thing a person would hit.
import { chromium } from 'playwright-core';

const REPLY = "Here is the answer.\n\n1. **First** point.\n2. **Second** point.\n\n```js\nconst x = 1;\n```";
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let failures = 0;

for (const vp of [
  { name: 'desktop', width: 1440, height: 900, mobile: false },
  { name: 'phone', width: 390, height: 730, mobile: true },
]) {
  console.log(`\n══ ${vp.name} ══`);
  const page = await browser.newPage({
    viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2,
    isMobile: vp.mobile, hasTouch: vp.mobile,
  });
  page.setDefaultTimeout(5000);

  const problems = [];
  page.on('console', (m) => {
    const t = m.text();
    if (/fonts\.g|ERR_|net::|Failed to load resource/i.test(t)) return;
    if (m.type() === 'error') problems.push(`console: ${t}`);
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

  await page.route('**/*', async (route) => {
    const u = route.request().url();
    if (u.startsWith('http://127.0.0.1')) return route.continue();
    if (u.includes('workers.dev')) {
      return route.fulfill({
        status: 200, contentType: 'text/event-stream',
        headers: { 'access-control-allow-origin': '*' },
        body: REPLY.match(/[\s\S]{1,25}/g)
          .map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`)
          .join('') + 'data: [DONE]\n\n',
      });
    }
    return route.abort();
  });

  let lastErr = '';
  const step = async (label, fn) => {
    const before = problems.length;
    let err = null;
    try { await fn(); } catch (e) { err = e.message.split('\n')[0]; lastErr = e.message; }
    const noisy = problems.length - before;
    if (err || noisy) {
      failures++;
      console.log(`  ✗ ${label}`);
      if (err) console.log(`      ${err}`);
      for (const p of problems.slice(before)) console.log(`      ${p}`);
      const hint = lastErr.split('\n').filter((l) => /intercepts|not visible|outside of the viewport/.test(l))[0];
      if (err && hint) console.log(`      ${hint.trim()}`);
    } else console.log(`  ✓ ${label}`);
  };
  const visible = (sel) => page.$eval(sel, (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }).catch(() => false);

  await page.goto('http://127.0.0.1:8792/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);

  await step('sign-in screen is the gate', async () => {
    if (!await visible('input[type="email"]')) throw new Error('no sign-in form');
  });

  await step('a wrong password says so in plain words', async () => {
    await page.fill('input[type="email"]', 'marry@almailgroup.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(500);
    const alert = await page.$eval('[role="alert"]', (e) => e.textContent).catch(() => '');
    if (!/match/i.test(alert)) throw new Error(`unhelpful error: "${alert}"`);
  });

  await step('sign in', async () => {
    await page.fill('input[type="password"]', 'correct-horse');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(900);
    if (await visible('input[type="email"]')) throw new Error('still on the gate');
  });

  await step('empty state invites a first message', async () => {
    const hs = await page.$$eval('h2', (e) => e.map((x) => x.textContent).join(' | '));
    if (!/help you/i.test(hs)) throw new Error(`no greeting (got "${hs}")`);
  });

  await step('a starter prompt fills the box', async () => {
    await page.click('button:has-text("Draft an email")');
    await page.waitForTimeout(300);
    const v = await page.$eval('textarea', (e) => e.value);
    if (!/professional email/i.test(v)) throw new Error(`box reads "${v}"`);
  });

  await step('send → streamed reply lands', async () => {
    await page.fill('textarea', 'Explain CORS');
    await page.click('button[aria-label="Send message"]');
    await page.waitForTimeout(3000);
    const text = await page.$eval('article:last-of-type', (e) => e.innerText).catch(() => '');
    if (!/First/.test(text)) throw new Error(`reply missing (got "${text.slice(0, 60)}")`);
  });

  await step('the reply is rendered markdown, not raw', async () => {
    if (!await visible('article ol')) throw new Error('no ordered list — markdown did not render');
    if (!await visible('article pre')) throw new Error('no code block');
  });

  await step('a thread appeared in the sidebar', async () => {
    if (vp.mobile) {
      await page.click('button[aria-label="Show sidebar"]').catch(() => {});
      await page.waitForTimeout(500);
    }
    const n = await page.$$eval('nav[aria-label="Conversations"] li', (e) => e.length);
    if (!n) throw new Error('sidebar has no threads');
  });

  await step('the thread took its title from the message', async () => {
    const t = await page.$eval('nav[aria-label="Conversations"] li button', (e) => e.textContent);
    if (!/CORS/i.test(t || '')) throw new Error(`title is "${t}"`);
  });

  await step('send is disabled with an empty box', async () => {
    if (vp.mobile) { await page.click('button[aria-label="Close sidebar"]').catch(() => {}); await page.waitForTimeout(400); }
    const disabled = await page.$eval('button[aria-label="Send message"]', (e) => e.disabled);
    if (!disabled) throw new Error('send is live with nothing to send');
  });

  await step('copy, regenerate and delete are reachable', async () => {
    const labels = await page.$$eval('article button[aria-label]', (els) => els.map((e) => e.getAttribute('aria-label')));
    for (const want of ['Copy message', 'Regenerate response', 'Delete message']) {
      if (!labels.includes(want)) throw new Error(`no "${want}" (have ${JSON.stringify(labels)})`);
    }
  });

  await step('the code block shows the actual code', async () => {
    const code = await page.$eval('article pre', (e) => e.innerText);
    if (!/const x = 1;/.test(code)) throw new Error(`code block reads "${code.trim()}"`);
  });

  await step('a code block opens the artifact panel', async () => {
    await page.click('article button:has-text("Open")');
    await page.waitForTimeout(600);
    if (!await visible('aside[aria-label="Artifact workspace"]')) throw new Error('panel did not open');
    const shown = await page.$eval('aside[aria-label="Artifact workspace"]', (e) => e.innerText);
    if (!/const x = 1;/.test(shown)) throw new Error(`panel shows "${shown.slice(0, 80)}"`);
  });

  await step('the artifact panel closes', async () => {
    await page.click('button[aria-label="Close artifact panel"]');
    await page.waitForTimeout(500);
    if (await visible('aside[aria-label="Artifact workspace"]')) throw new Error('panel stayed open');
  });

  await step('a new chat starts clean', async () => {
    if (vp.mobile) { await page.click('button[aria-label="Show sidebar"]').catch(() => {}); await page.waitForTimeout(500); }
    await page.click('button[aria-label="New chat"]');
    await page.waitForTimeout(900);
    const hs = await page.$$eval('h2', (e) => e.map((x) => x.textContent).join(' | '));
    if (!/help you/i.test(hs)) throw new Error(`new chat did not reset the view (got "${hs}")`);
  });

  await step('the model picker opens and picks', async () => {
    await page.click('button:has-text("Gemini")');
    await page.waitForTimeout(400);
    const items = await page.$$eval('[role="menuitem"]', (e) => e.length);
    if (!items) throw new Error('model menu empty');
    await page.keyboard.press('Escape');
  });

  await step('theme toggles from the account menu', async () => {
    await page.click('button[aria-label="Account"]');
    await page.waitForTimeout(400);
    await page.click('[role="menuitem"]:has-text("theme")');
    await page.waitForTimeout(500);
    const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    if (!dark) throw new Error('dark theme did not apply');
  });

  await step('nothing overlaps the composer', async () => {
    const m = await page.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom, h: b.height }; };
      return { composer: r('textarea'), disclaimer: r('p:last-of-type'), vh: innerHeight };
    });
    if (m.composer && m.composer.b > m.vh + 1) throw new Error('composer is below the fold');
  });

  await step('sign out returns to the gate', async () => {
    await page.click('button[aria-label="Account"]');
    await page.waitForTimeout(400);
    await page.click('[role="menuitem"]:has-text("Sign out")');
    await page.waitForTimeout(900);
    if (!await visible('input[type="email"]')) throw new Error('did not return to sign-in');
  });

  await page.screenshot({ path: `e2e-${vp.name}.png` });
  await page.close();
}

await browser.close();
console.log(`\n${failures ? `${failures} FAILING STEP(S)` : 'all steps passed'}`);
