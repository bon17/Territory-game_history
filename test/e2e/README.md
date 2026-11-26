# 브라우저 시험 (Playwright)

서버 없이 Playwright가 `http://game.local/`(Firebase 시험은 `http://127.0.0.1:5555/`) 요청을 저장소 파일로 바로 응답한다.
모든 스크립트: `node <스크립트> <저장소 경로> <스크린샷 폴더>`

| 스크립트 | 내용 | 걸리는 시간 |
|---|---|---|
| `full_game.js` | 학생이 고르기 · 가상 학생 6모둠 + 학생 탭 1대, 연습 + 15문제 끝까지 | 약 3분 |
| `random_teams.js` | 랜덤 배정: 출석번호 입장 → 섞기 → 옮기기 → 내보내기 → 시작 | 약 30초 |
| `offline.js` | 오프라인 진행: 교사가 O/X·걸기 입력으로 한 판 | 약 1분 |
| `rules_and_test_window.js` | 설명 슬라이드 14장 + 테스트 창 | 약 1분 |
| `rep_fallback.js` | 대표가 가만히 있으면 15초 뒤 다른 모둠원이 확정 / 대표 탭이 꺼지면 다음 대표에서 빠짐 | 약 1분 |
| `pretty_urls.js` | Netlify 식 줄인 주소(/host)로 열어도 학생 접속(QR) 주소가 맞는지 | 약 10초 |
| `real_firebase.js` | 실제 Firebase(firebase-config.js)로 한 판 + 보안 규칙 확인, 시험 방은 지움 | 약 2분 |
| `firebase.js` | Firebase 에뮬레이터: 익명 로그인 · 실시간 DB · 보안 규칙(7가지 차단 확인) · 한 판 | 약 2분 |

## Firebase 에뮬레이터 시험

```bash
cd test/e2e && npm init -y && npm install firebase-tools@15.37.0 firebase@10.12.2
```

```bash
cd test/e2e && env -u HTTPS_PROXY -u https_proxy -u GLOBAL_AGENT_HTTPS_PROXY -u npm_config_https_proxy -u JAVA_TOOL_OPTIONS npx firebase emulators:exec --project demo-history --only database,auth "node firebase.js ../.. /tmp/shots"
```

- Java 필요. 클라우드 환경에서는 프록시 변수를 빼야 CLI가 에뮬레이터에 규칙을 올릴 수 있다.
- 데이터베이스 이름은 `demo-history-default-rtdb` 여야 규칙이 적용된다(스크립트에 들어 있음).
- 브라우저의 로컬 네트워크 접근 검사는 스크립트에서 끈다.
