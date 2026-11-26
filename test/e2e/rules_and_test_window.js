// 설명 창 장면별 + 테스트 창(교사+학생 2대) 진행 스크린샷
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2], OUT = process.argv[3];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.tsv': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg' };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.route('**/*', async route => {
    const u = new URL(route.request().url());
    if (u.hostname === 'game.local') {
      const f = path.join(ROOT, decodeURIComponent(u.pathname));
      if (fs.existsSync(f) && fs.statSync(f).isFile()) return route.fulfill({ body: fs.readFileSync(f), contentType: MIME[path.extname(f)] || 'application/octet-stream' });
      return route.fulfill({ status: 404, body: '' });
    }
    if (u.hostname === 'cdnjs.cloudflare.com') return route.continue();
    return route.abort();
  });
  const errors = [];
  const watch = p => { p.on('pageerror', e => errors.push(p.url() + ' ' + e.message)); };

  // 1) 설명 창
  const r = await ctx.newPage(); watch(r);
  await r.setViewportSize({ width: 1600, height: 900 });
  await r.goto('http://game.local/rules.html');
  await r.waitForTimeout(800);
  for (let k = 1; k <= 14; k++) {
    await r.waitForTimeout(700);
    await r.screenshot({ path: `${OUT}/rules_${String(k).padStart(2, '0')}.png` });
    await r.keyboard.press('ArrowRight');
  }

  // 2) 테스트 창
  const t = await ctx.newPage(); watch(t);
  await t.setViewportSize({ width: 1600, height: 1000 });
  await t.goto('http://game.local/test.html');
  await t.click('#go');
  await t.waitForFunction(() => document.querySelectorAll('#kidsBox iframe').length === 2, null, { timeout: 15000 });
  await t.waitForTimeout(1500);
  await t.screenshot({ path: `${OUT}/test_1_lobby.png` });
  const code = (await t.textContent('#room')).replace(/\D/g, '');
  const tv = t.frameLocator('#tvBox iframe');
  const kids = [t.frameLocator('#kidsBox iframe >> nth=0'), t.frameLocator('#kidsBox iframe >> nth=1')];
  await tv.locator('#btnStart').click();
  const state = () => t.evaluate(c => JSON.parse(localStorage.getItem('tg:rooms/' + c + '/state')), code);
  const seen = {};
  for (let guard = 0; guard < 400; guard++) {
    const s = await state();
    const key = s.phase + s.round;
    if (!seen[key]) {
      seen[key] = 1;
      await t.waitForTimeout(500);
      if (s.round <= 1 || s.phase === 'final') await t.screenshot({ path: `${OUT}/test_r${s.round}_${s.phase}.png` });
      if (s.phase === 'question') {
        for (const k of kids) {
          if (await k.locator('.opt').count()) { await k.locator('.opt').first().click(); await k.locator('#send').click(); }
          else if (await k.locator('#ans').count()) { await k.locator('#ans').fill('모름'); await k.locator('#send').click(); }
        }
      }
      if (s.phase === 'bid') {
        for (const k of kids) {
          const legal = k.locator('svg#pmap g.cell.legal');
          if (await legal.count()) await legal.first().dispatchEvent('click');
          if (await k.locator('#confirm').count()) await k.locator('#confirm').click();
        }
        if (s.round <= 1) { await t.waitForTimeout(300); await t.screenshot({ path: `${OUT}/test_r${s.round}_bid_after.png` }); }
      }
      if (s.phase === 'reveal' || s.phase === 'resolved') await tv.locator('#btnNext').click();
      if (s.phase === 'final') break;
      if (s.round >= 3 && s.phase === 'resolved') { /* 3라운드까지만 보고 끝내기 */ }
    }
    if (s.round >= 3 && s.phase === 'question') {
      t.on('dialog', d => d.accept());
      await tv.locator('#btnEnd').click();
    }
    await t.waitForTimeout(200);
  }
  await t.waitForTimeout(1000);
  await t.screenshot({ path: `${OUT}/test_9_final.png` });
  console.log('errors', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
