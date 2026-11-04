/** quick screenshot: tsx tools/shot.ts "<query>" WxH out.png [waitMs] [dpr] */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [q = '', size = '1280x720', out = 'qa/tmp/shot.png', wait = '2500', dpr = '1'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const MOCK = readFileSync(new URL('../tests/fixtures/sdk-mock.js', import.meta.url), 'utf8');
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: Number(dpr) });
  const errs: string[] = [];
  p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.route('https://sdk.crazygames.com/**', r => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  await p.goto('http://localhost:4173/' + (q ? '?' + q : ''));
  await p.waitForTimeout(Number(wait));
  await p.screenshot({ path: out });
  if (errs.length) console.log('ERRORS:\n' + errs.join('\n'));
  await b.close();
})();
