// 한 판 통째로: TV(가상 학생 6모둠×4) + 실제 학생 탭 1개(1모둠 1번)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ROOT = process.argv[2];
const OUT = process.argv[3];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.tsv': 'text/plain; charset=utf-8', '.png': 'image/png' };

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
  const host = await ctx.newPage();
  await host.setViewportSize({ width: 1600, height: 900 });
  host.on('pageerror', e => errors.push('host: ' + e.message));
  await host.goto('http://game.local/host.html?bots&fast&auto');
  await host.waitForSelector('#lobby:not(.hidden)', { timeout: 15000 });
  const code = await host.textContent('#roomCode');
  console.log('room', code);

  const kid = await ctx.newPage();
  await kid.setViewportSize({ width: 1280, height: 800 }); // 갤럭시탭 가로
  kid.on('pageerror', e => errors.push('kid: ' + e.message));
  await kid.goto(`http://game.local/play.html?room=${code}&fast`);
  await kid.waitForSelector('.pickteam');
  await kid.screenshot({ path: `${OUT}/k0_pick.png` });
  await kid.click('.pickteam >> nth=0');
  await kid.click('#nums button >> nth=0');
  await kid.click('#join');
  await kid.waitForTimeout(500);
  await host.screenshot({ path: `${OUT}/h0_lobby.png` });
  await kid.screenshot({ path: `${OUT}/k1_lobby.png` });
  await host.click('#btnStart');

  const state = () => host.evaluate(c => JSON.parse(localStorage.getItem('tg:rooms/' + c + '/state')), code);
  const shot = {};
  const snap = async (name, both = true) => {
    if (shot[name]) return; shot[name] = 1;
    await host.screenshot({ path: `${OUT}/h_${name}.png` });
    if (both) await kid.screenshot({ path: `${OUT}/k_${name}.png` });
  };
  let answered = -1, bidDone = -1, guard = 0;
  while (guard++ < 2000) {
    const s = await state();
    if (!s) { await host.waitForTimeout(100); continue; }
    if (s.phase === 'final') { await host.waitForTimeout(800); await snap('final'); break; }
    if (s.phase === 'question') {
      if (answered !== s.round) {
        answered = s.round;
        await kid.waitForTimeout(300);
        if (s.round === 2 || s.round === 0) await snap('question' + s.round);
        if (await kid.$('#ans')) { await kid.fill('#ans', '대류ㄱ봉소ㅐ령'); }
        else if (await kid.$('.opt')) await kid.click('.opt >> nth=0');
        await kid.click('#send').catch(() => {});
        await kid.waitForTimeout(200);
        if (s.round === 2) await kid.screenshot({ path: `${OUT}/k_submitted.png` });
      }
    } else if (s.phase === 'reveal') {
      await host.waitForTimeout(400);
      if (s.round === 2) await snap('reveal2');
      await host.click('#btnNext');
    } else if (s.phase === 'bid') {
      if (bidDone !== s.round) {
        bidDone = s.round;
        await kid.waitForTimeout(400);
        const legal = await kid.$$('svg#pmap g.cell.legal');
        if (legal.length) { await legal[0].dispatchEvent('click'); }
        await kid.waitForTimeout(200);
        if (await kid.$('#confirm')) {
          await kid.click('#plus').catch(() => {});
          await snap('bid_rep' + s.round);
          await kid.click('#confirm');
        } else if (s.round === 2) await snap('bid_member');
      }
    } else if (s.phase === 'resolve') {
      if (s.reveal && s.reveal.stage === 'win' && s.round >= 1) await snap('resolve_win', false);
      if (s.reveal && s.reveal.stage === 'bags' && s.round >= 1) await snap('resolve_bags', false);
    } else if (s.phase === 'resolved') {
      if (s.round === 1) await snap('resolved1');
      if (s.round === 8) await snap('mid8', false);
      await host.click('#btnNext');
      await host.waitForTimeout(300);
    }
    await host.waitForTimeout(120);
  }
  const s = await state();
  console.log('final phase', s.phase, 'round', s.round, JSON.stringify(s.final && s.final.map(f => [f.team, f.total])));
  await kid.setViewportSize({ width: 800, height: 1280 }); // 세로
  await kid.waitForTimeout(300);
  await kid.screenshot({ path: `${OUT}/k_final_portrait.png` });
  console.log('errors', errors.length ? errors : 'none');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
