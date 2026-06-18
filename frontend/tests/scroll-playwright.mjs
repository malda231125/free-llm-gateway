import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  chromiumSandbox: false,
  args: [
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--no-sandbox',
  ],
});

try {
  for (const viewport of [
    { name: 'desktop', width: 1280, height: 800 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    await page.setContent(`
      <main style="height:100vh;display:flex;flex-direction:column">
        <section id="messages" style="height:360px;overflow-y:auto;border:1px solid #ccc">
          <div id="content"></div>
          <div id="bottom"></div>
        </section>
        <button id="jump" hidden>latest</button>
      </main>
      <script>
        function isNearBottom(target, threshold = 96) {
          return Math.max(0, target.scrollHeight - target.scrollTop - target.clientHeight) <= threshold;
        }
        const messages = document.querySelector('#messages');
        const content = document.querySelector('#content');
        const bottom = document.querySelector('#bottom');
        const jump = document.querySelector('#jump');
        let stickToBottom = true;
        let lastTouchY = null;

        function syncIntent() {
          stickToBottom = isNearBottom(messages);
          jump.hidden = stickToBottom;
        }

        function scrollToLatest() {
          bottom.scrollIntoView({ behavior: 'auto', block: 'end' });
          stickToBottom = true;
          jump.hidden = true;
        }

        function pauseAutoScroll() {
          stickToBottom = false;
          jump.hidden = false;
        }

        function onWheel(event) {
          if (event.deltaY < 0) pauseAutoScroll();
        }

        function onTouchStart(event) {
          lastTouchY = event.touches[0]?.clientY ?? null;
        }

        function onTouchMove(event) {
          const nextY = event.touches[0]?.clientY ?? null;
          if (nextY !== null && lastTouchY !== null && nextY > lastTouchY + 4) pauseAutoScroll();
          lastTouchY = nextY;
        }

        function appendChunk(text) {
          const p = document.createElement('p');
          p.textContent = text;
          p.style.margin = '0';
          p.style.minHeight = '32px';
          content.appendChild(p);
          if (stickToBottom) scrollToLatest();
          else jump.hidden = false;
        }

        messages.addEventListener('scroll', syncIntent);
        messages.addEventListener('wheel', onWheel);
        messages.addEventListener('touchstart', onTouchStart);
        messages.addEventListener('touchmove', onTouchMove);
        jump.addEventListener('click', scrollToLatest);
        window.testApi = { appendChunk, messages, jump };
      </script>
    `);

    await page.waitForFunction(() => window.testApi);
    await page.evaluate(() => {
      for (let i = 0; i < 30; i += 1) window.testApi.appendChunk('initial ' + i);
    });
    const bottomScrollTop = await page.evaluate(() => window.testApi.messages.scrollTop);

    await page.evaluate(() => {
      window.testApi.messages.scrollTop = 120;
      window.testApi.messages.dispatchEvent(new Event('scroll'));
    });
    const readingScrollTop = await page.evaluate(() => window.testApi.messages.scrollTop);
    await page.evaluate(() => {
      for (let i = 0; i < 10; i += 1) window.testApi.appendChunk('stream ' + i);
    });
    const afterStreamScrollTop = await page.evaluate(() => window.testApi.messages.scrollTop);
    const jumpVisible = await page.evaluate(() => !window.testApi.jump.hidden);

    assert.equal(afterStreamScrollTop, readingScrollTop, `${viewport.name}: stream should not force scroll while reading`);
    assert.equal(jumpVisible, true, `${viewport.name}: latest button should appear while reading`);

    await page.evaluate(() => {
      window.testApi.messages.scrollTop = window.testApi.messages.scrollHeight;
      window.testApi.messages.dispatchEvent(new Event('scroll'));
      window.testApi.messages.dispatchEvent(new WheelEvent('wheel', { deltaY: -120 }));
    });
    const userIntentScrollTop = await page.evaluate(() => window.testApi.messages.scrollTop);
    await page.evaluate(() => {
      for (let i = 0; i < 10; i += 1) window.testApi.appendChunk('user intent stream ' + i);
    });
    const afterUserIntentScrollTop = await page.evaluate(() => window.testApi.messages.scrollTop);
    assert.equal(afterUserIntentScrollTop, userIntentScrollTop, `${viewport.name}: upward user scroll intent should stop auto-scroll immediately`);

    await page.click('#jump');
    const afterJumpScrollTop = await page.evaluate(() => window.testApi.messages.scrollTop);
    assert.ok(afterJumpScrollTop > bottomScrollTop, `${viewport.name}: latest button should scroll down`);

    await page.screenshot({ path: `test-results/scroll-${viewport.name}.png`, fullPage: true });

    await page.close();
  }
} finally {
  await browser.close();
}
