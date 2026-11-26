// Netlify 처럼 .html 을 뺀 주소(/host, /play)로 열어도 학생 접속 주소(QR)가 맞는지
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = process.argv[2];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.tsv': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg' };
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext();
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url()); if (u.hostname !== 'game.local') return r.abort();
    let p = decodeURIComponent(u.pathname);
    if (p === '/') p = '/index.html';
    else if (!path.extname(p)) p += '.html'; // /host → host.html (Netlify 의 줄인 주소)
    const f = path.join(ROOT, p);
    return fs.existsSync(f) && fs.statSync(f).isFile() ? r.fulfill({ body: fs.readFileSync(f), contentType: MIME[path.extname(f)] }) : r.fulfill({ status: 404, body: '' });
  });
  const errors = [];
  const host = await ctx.newPage(); host.on('pageerror', e => errors.push(e.message));
  await host.goto('http://game.local/host?demo&auto');
  await host.waitForSelector('#lobby:not(.hidden)');
  const url = (await host.textContent('#joinUrl')).trim();
  const code = (await host.textContent('#roomCode')).trim();
  console.log('교사 화면 주소: /host  →  학생 접속 주소:', url);
  const kid = await ctx.newPage(); kid.on('pageerror', e => errors.push(e.message));
  await kid.goto(url);
  await kid.waitForSelector('.pickteam', { timeout: 10000 });
  await kid.click('.pickteam >> nth=0'); await kid.click('#nums button >> nth=0'); await kid.click('#join');
  await host.waitForTimeout(600);
  const n = await host.$$eval('#lobby .pchip', a => a.length);
  console.log('학생이 그 주소로 들어와 대기 화면에 보임:', n === 1 ? '예 ✓' : `아니요 (${n})`, '| 방', code);
  console.log('errors', errors.length ? errors : 'none');
  await b.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
