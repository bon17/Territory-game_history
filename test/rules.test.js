// node test/rules.test.js
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const H = require('../js/hexmap.js');
const R = require('../js/rules.js');
const G = require('../js/grade.js');

let n = 0; const t = (name, fn) => { fn(); n++; console.log('✓', name); };

t('지도 37칸, 보물 5·요새 4·시작 6', () => {
  const m = H.buildMap(6); const v = Object.values(m);
  assert.strictEqual(v.length, 37);
  assert.strictEqual(v.filter(c => c.type === 'treasure').length, 5);
  assert.strictEqual(v.filter(c => c.type === 'fort').length, 4);
  assert.strictEqual(v.filter(c => c.type === 'start').length, 6);
});
t('5모둠이면 남는 꼭짓점은 빈 일반 칸', () => {
  const m = H.buildMap(5);
  assert.strictEqual(Object.values(m).filter(c => c.type === 'start').length, 5);
  assert.strictEqual(m['-3,0'].owner, null);
});
t('첫 라운드 걸 수 있는 칸 = 시작 칸 이웃 3칸', () => {
  const m = H.buildMap(6);
  assert.deepStrictEqual(R.legalTargets(m, 0).sort(), ['-1,-2', '0,-2', '1,-3'].sort());
});
t('코인: 정답 비율×5(반올림) + 전원정답 2, 반 70% 이상이면 +3', () => {
  const r = R.coinsFromAnswers([{ team: 0, correct: true }, { team: 0, correct: true }, { team: 1, correct: true }, { team: 1, correct: false }], 2);
  assert.ok(r.coop);                                   // 반 전체 3/4 = 75% ≥ 70%
  assert.strictEqual(r.perTeam[0].coins, 5 + 2 + 3);  // 2/2 = 100%
  assert.strictEqual(r.perTeam[1].coins, 3 + 3);      // 1/2 = 50% → 2.5 → 3
});
t('인원이 달라도 같은 비율이면 같은 코인', () => {
  const team = (t, n, k) => Array.from({ length: n }, (_, i) => ({ team: t, correct: i < k }));
  const r = R.coinsFromAnswers([...team(0, 5, 5), ...team(1, 4, 4), ...team(2, 5, 4), ...team(3, 4, 3)], 4);
  assert.strictEqual(r.perTeam[0].coins, r.perTeam[1].coins); // 모두 정답: 5명 = 4명
  assert.strictEqual(r.perTeam[2].coins, 4 + 3);             // 80% → 4, 반 전체 16/18 → +3
  assert.strictEqual(r.perTeam[3].coins, 4 + 3);             // 75% → 4
});
t('빈 칸 경쟁: 많이 건 모둠, 동점이면 땅 점수 낮은 모둠', () => {
  const m = H.buildMap(2);
  m['0,-2'].owner = 1; // 1모둠이 0모둠 옆에 붙음
  m['1,-2'].owner = 1;
  const res = R.resolveBids(m, { 0: { cell: '1,-3', coins: 2 }, 1: { cell: '1,-3', coins: 2 } }, [5, 5]);
  assert.strictEqual(res.cells['1,-3'].owner, 0); // 0모둠 땅 점수가 더 낮음
  assert.deepStrictEqual(res.coins, [3, 3]);
});
t('빼앗기: 주인 수비보다 많아야 함', () => {
  const m = H.buildMap(2);
  m['1,-3'].owner = 1;
  let res = R.resolveBids(m, { 0: { cell: '1,-3', coins: 3 }, 1: { cell: '1,-3', coins: 3 } }, [5, 5]);
  assert.strictEqual(res.cells['1,-3'].owner, 1);
  res = R.resolveBids(m, { 0: { cell: '1,-3', coins: 4 }, 1: { cell: '1,-3', coins: 3 } }, [5, 5]);
  assert.strictEqual(res.cells['1,-3'].owner, 0);
});
t('요새·시작 칸은 못 빼앗음, 가진 코인보다 많이 못 검', () => {
  const m = H.buildMap(2);
  const fort = Object.values(m).find(c => c.type === 'fort'); fort.owner = 1;
  assert.ok(!R.legalTargets(m, 0).includes(fort.id));
  assert.ok(!R.legalTargets(m, 0).includes('3,-3'));
  const res = R.resolveBids(m, { 0: { cell: '1,-3', coins: 99 } }, [2, 0]);
  assert.deepStrictEqual(res.coins, [0, 0]);
});
t('최종 점수: 보물 3점, 가장 큰 땅 +5, 미션', () => {
  const m = H.buildMap(2);
  ['0,-2', '0,-1', '0,0'].forEach(i => m[i].owner = 0); // 0,0 보물
  const s = R.finalScores(m, 2, ['center', 'land8']);
  const land0 = R.landScore(m, 0);
  assert.strictEqual(s[0].region, 5);
  assert.strictEqual(s[0].mission, 4);
  assert.strictEqual(s[0].total, land0 + 9);
  assert.strictEqual(s[1].total, 1);
});
t('채점: 자모 끊김·띄어쓰기·대소문자', () => {
  const q = { type: '단답', answer: '대륙 봉쇄령', accept: ['대륙봉쇄령'] };
  assert.ok(G.isCorrect(q, '대류ㄱ봉소ㅐ령'));
  assert.ok(G.isCorrect(q, ' 대륙봉쇄령 '));
  assert.ok(!G.isCorrect(q, '대륙 봉쇄'));
  assert.ok(G.isCorrect({ type: '단답', answer: 'NATO', accept: [] }, 'nato'));
  assert.ok(G.isCorrect({ type: 'OX', answer: 'O' }, 'o'));
});
t('문제은행 TSV 66문항 읽기 + 객관식 정답이 보기에 있음', () => {
  const bank = G.parseBank(fs.readFileSync(path.join(__dirname, '../questions/문제은행_초안.tsv'), 'utf8'));
  assert.strictEqual(bank.length, 66);
  bank.filter(q => q.type === '객관식').forEach(q => assert.ok(q.choices.includes(q.answer), q.no));
  const picked = R.pickQuestions(bank, 16);
  assert.strictEqual(picked.length, 16);
  assert.strictEqual(picked[15].level, '상');
});
console.log(`\n${n}개 테스트 통과`);
