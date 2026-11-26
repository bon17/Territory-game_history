// 오프라인 진행: 학생 탭 없이 교사가 O/X와 걸기를 입력해서 한 판 끝까지
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = process.argv[2], OUT = process.argv[3];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.tsv': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg' };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext();
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (u.hostname !== 'game.local') return r.abort();
    const f = path.join(ROOT, decodeURIComponent(u.pathname)); return fs.existsSync(f) && fs.statSync(f).isFile() ? r.fulfill({ body: fs.readFileSync(f), contentType: MIME[path.extname(f)] }) : r.fulfill({ status: 404, body: '' }); });
  const errors = [];
  const host = await ctx.newPage(); host.on('pageerror', e => errors.push(e.message));
  await host.setViewportSize({ width: 1600, height: 900 });
  await host.goto('http://game.local/host.html?demo&auto&teams=4&rounds=5&fast');
  await host.waitForSelector('#lobby:not(.hidden)');
  const code = await host.textContent('#roomCode');
  await host.click('#btnOfflineStart');
  await host.click('.modal .primary');
  const state = () => host.evaluate(c => JSON.parse(localStorage.getItem('tg:rooms/' + c + '/state')), code);
  const seen = {};
  for (let guard = 0; guard < 300; guard++) {
    const s = await state();
    const key = s.phase + s.round;
    if (s.phase === 'final') { await host.waitForTimeout(600); await host.screenshot({ path: `${OUT}/off_final.png` }); break; }
    if (!seen[key]) {
      seen[key] = 1;
      await host.waitForTimeout(400);
      if (s.phase === 'question') {
        // 1·3모둠은 맞힘
        await host.click('[data-mark="0"]'); await host.click('[data-mark="2"]');
        if (s.round === 1) await host.screenshot({ path: `${OUT}/off_q1.png` });
        await host.waitForTimeout(1500); // 시간이 지나도 저절로 넘어가지 않는지
        const still = (await state()).phase;
        if (s.round === 1) console.log('시간 지나도 문제 화면 유지:', still === 'question');
        await host.click('#btnNext');
      } else if (s.phase === 'reveal') {
        if (s.round === 1) { await host.screenshot({ path: `${OUT}/off_reveal1.png` }); console.log('코인(1라운드 공개 후 받기 전):', JSON.stringify(s.coins), '모둠 결과:', JSON.stringify(s.teamResults.map(t => t.coins))); }
        await host.click('#btnNext');
      } else if (s.phase === 'bid') {
        // 입력판에서 모둠마다: 지도 칸 → + → 확정
        for (let i = 0; i < 4; i++) {
          const legal = await host.$$('#map g.cell.legal');
          if (!legal.length) break;
          await legal[0].dispatchEvent('click');
          await host.waitForTimeout(80);
          if (await host.$('#offPlus')) await host.click('#offPlus');
          if (await host.$('#offOk')) await host.click('#offOk');
          await host.waitForTimeout(80);
        }
        if (s.round === 1) await host.screenshot({ path: `${OUT}/off_bid1.png` });
        await host.click('#btnNext');
      } else if (s.phase === 'resolved') {
        if (s.round === 1) await host.screenshot({ path: `${OUT}/off_resolved1.png` });
        await host.click('#btnNext');
      }
    }
    await host.waitForTimeout(150);
  }
  const s = await state();
  console.log('final', s.phase, JSON.stringify((s.final || []).map(f => [f.team, f.total])));
  console.log('errors', errors.length ? errors : 'none');
  await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
