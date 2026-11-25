/* 채점: 자모 분해 비교 + 문제은행 TSV 읽기 (브라우저·node 공용) */
(function (root) {
  const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
  const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  const SPLIT = { ㄲ: 'ㄱㄱ', ㄸ: 'ㄷㄷ', ㅃ: 'ㅂㅂ', ㅆ: 'ㅅㅅ', ㅉ: 'ㅈㅈ', ㄳ: 'ㄱㅅ', ㄵ: 'ㄴㅈ', ㄶ: 'ㄴㅎ', ㄺ: 'ㄹㄱ', ㄻ: 'ㄹㅁ', ㄼ: 'ㄹㅂ', ㄽ: 'ㄹㅅ', ㄾ: 'ㄹㅌ', ㄿ: 'ㄹㅍ', ㅀ: 'ㄹㅎ', ㅄ: 'ㅂㅅ', ㅘ: 'ㅗㅏ', ㅙ: 'ㅗㅐ', ㅚ: 'ㅗㅣ', ㅝ: 'ㅜㅓ', ㅞ: 'ㅜㅔ', ㅟ: 'ㅜㅣ', ㅢ: 'ㅡㅣ' };

  /** 자판 누른 순서로 바꾼 문자열. 띄어쓰기·가운뎃점·문장부호·대소문자 무시 */
  function keys(s) {
    let o = '';
    for (const ch of String(s).normalize('NFC').toLowerCase().replace(/[\s·.,()'"\-~!?]/g, '')) {
      const c = ch.charCodeAt(0) - 0xAC00;
      o += (c >= 0 && c < 11172) ? CHO[(c / 588) | 0] + JUNG[((c % 588) / 28) | 0] + JONG[c % 28] : ch;
    }
    return [...o].map(j => SPLIT[j] || j).join('');
  }

  function isCorrect(q, answer) {
    if (answer == null || answer === '') return false;
    if (q.type === '객관식') return answer === q.answer;
    if (q.type === 'OX') return String(answer).toUpperCase() === q.answer.toUpperCase();
    const k = keys(answer);
    return [q.answer, ...q.accept].some(a => a && keys(a) === k);
  }

  /** 스프레드시트에서 복사한 탭 구분 텍스트 → 문제 배열 */
  function parseBank(text) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    if (lines.length && lines[0].startsWith('번호')) lines.shift();
    const split = s => (s || '').split('|').map(x => x.trim()).filter(Boolean);
    return lines.map(l => {
      const [no, unit, level, type, text, choices, answer, accept, explain, games] = l.split('\t');
      return {
        no: (no || '').trim(), unit: (unit || '').trim(), level: (level || '').trim(), type: (type || '').trim(),
        text: (text || '').trim(), choices: split(choices), answer: (answer || '').trim(),
        accept: split(accept), explain: (explain || '').trim(), games: (games || '').trim()
      };
    }).filter(q => q.text && q.answer);
  }

  const TIME_LIMIT = { 하: 20, 중: 30, 상: 40 };
  const api = { keys, isCorrect, parseBank, TIME_LIMIT };
  if (typeof module !== 'undefined') module.exports = api; else root.Grade = api;
})(this);
