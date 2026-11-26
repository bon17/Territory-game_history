# HANDOFF: 역사 섬 땅따먹기 (중2 역사 기말 복습 게임)

다음 대화는 이 파일만 읽고 이어서 작업하면 됩니다.

## 기본 정보
- 저장소 `bon17/Territory-game_history`, 브랜치 `claude/hopeful-goodall-p71769` (작업 내용은 모두 푸시함)
- 미리보기(비공개 Artifact): https://claude.ai/artifact/DfyQQttJgWDce8a5AA5ZsC
- 사용자: 중2 역사 교사. 해요체 한국어로 짧고 쉽게 설명하는 걸 좋아함
- 원래 계획안: 게임 3종(점수판 퀴즈 · 땅따먹기 · 부루마블) 중 **2번 땅따먹기**를 만드는 중

## 파일 구성
| 파일 | 역할 |
|---|---|
| `index.html` | 메인 (수업 시작 · 게임 설명 · 학생 입장 · 테스트 버튼) |
| `host.html` + `js/host.js` | 교사 TV 화면 (진행 상태는 이 화면만 바꿈) |
| `play.html` + `js/play.js` | 학생 탭 (갤럭시탭, 1인 1대) |
| `rules.html` | 규칙 설명 슬라이드 11장 (대기 화면에서 겹쳐 띄움) |
| `test.html` | 교사 화면 + 학생 탭 1~3대를 한 화면에서 시험 (데모 모드 강제) |
| `js/rules.js` `js/hexmap.js` `js/grade.js` | 규칙 · 지도 · 채점 (node 테스트 가능) |
| `js/common.js` | 모둠 정보, 지도 그리기, 캐릭터, 효과음 |
| `js/backend.js` + `firebase-config.js` | 데모(localStorage+BroadcastChannel) / Firebase 자동 전환 |
| `questions/문제은행_초안.tsv` | 문제 66개 (스프레드시트 붙여넣기 형식) |
| `images/` | 캐릭터 · 표정 · 아이콘 · 타일 · 소품 · 배경 (`images/README.txt`) |
| `tools/slice_sprites.py` `tools/make_tiles.py` | 그림 자르기 · 타일 색 입히기 |
| `땅따먹기_설계서.md` | 규칙·화면 상세 설계 |

## 정한 것 (규칙)
- 40분, 문제 15~16개 + 연습 라운드(점수 없음). 마지막 문제는 '상'
- 라운드: 문제 → 정답 공개 → **코인** 받기 → 맞닿은 칸에 **몰래 걸기** → 한 칸씩 공개
- 코인 = 모둠 정답 비율 × 5(반올림) + 전원 정답 2 + 반 전체 70% 이상이면 모두 3
- 가장 많이 건 모둠이 획득, 건 코인은 사라짐. 빈 칸 동점이면 땅 점수 낮은 모둠, 남의 땅은 주인 수비보다 **많아야** 빼앗음
- 보물 칸 3점, 요새·출발 칸은 못 빼앗음. 최종 = 땅 + 가장 큰 이어진 땅 +5 + 비밀 미션
- 모둠원 전원 투표, 대표(번호 순서로 교대)가 확정
- **배신·동맹·탈락은 넣지 않음** (사용자가 싫어함)
- 모둠 정하기: 학생이 고르기 / 랜덤 배정(출석번호 입장 → 교사가 섞기). 대기 화면에서 교사가 학생 칩을 눌러 옮기기·내보내기
- 디자인: 귀엽고 가벼운 "역사 섬" 보드게임. 글꼴 Jua + Pretendard, **명조체 금지**
- 문제은행: 판서 정리 중심. 제외 범위는 설계서와 아래 참고
  - 제외: 미국 남북 전쟁, 중국·일본 외 아시아, 독소 불가침·진주만·노르망디, 국제 연맹·로카르노·켈로그-브리앙, 대서양 헌장·얄타, 3·1·5·4·국공 합작·간디, EU·NAFTA·APEC, WTO·FTA·세계화
- 단답 채점: 띄어쓰기·대소문자 무시, 자모 끊김(`대류ㄱ봉소ㅐ령`) 허용, 오타 허용 안 함. 교사가 오답을 정답으로 인정 가능

## 남은 일
1. **배포·리허설 (사용자 차례)**: 배포용 zip(사용자에게 보냄) 압축 풀기 → Netlify Drop에 폴더 끌어다 놓기 → 학교 와이파이 + 갤럭시탭으로 리허설
   - Firebase 프로젝트 `history-island-c26b2` 설정 완료, `firebase-config.js`에 넣음
   - **실제 Firebase에서 검증 완료**: 방 만들기·학생 2명·한 판·보안 규칙 7가지 차단·방 삭제 (`test/e2e/real_firebase.js`). 학교 와이파이, 갤럭시탭 브라우저는 아직 미확인
   - 이 저장소 전용 클라우드 환경 `Territory-game_history`를 만듦(Firebase DB·로그인 서버 접속 허용)
2. Netlify 배포 안내 (`README.md`, 안내서 끝에 간단히 있음)
3. 선택: 캐릭터 6마리 단체 그림(메인·설명 첫 장용), 사용자가 그리면 넣기
4. 게임 1(점수판 퀴즈), 게임 3(부루마블)은 아직 시작 안 함

## 오프라인 진행 (완료)
- 게임 화면 [오프라인] 버튼, 대기 화면 "와이파이가 안 되면: 오프라인으로 시작", 방 만들기 실패 시 자동 제안
- 문제: 교사가 모둠별 O/X → 정답 모둠 7코인(전원 정답과 같음), 맞힌 모둠 70% 이상이면 +3
- 걸기: 오른쪽 입력판에서 모둠 → 지도 칸 → 코인 수 → 확정 (by: 'teacher'). 시간이 끝나도 자동으로 넘기지 않음

## 주의할 점
- **이 클라우드 환경**: OpenAI·Firebase 서버 접속 차단, 백그라운드 서버 실행 거부됨, 내장 브라우저 도구 없음
- **시험 방법**: 브라우저 시험 스크립트는 `test/e2e/` (사용법은 `test/e2e/README.md`). Firebase 에뮬레이터 시험은 프록시 변수를 빼고 실행하고, DB 이름은 `demo-history-default-rtdb`. 단위 테스트는 `node test/rules.test.js` (11개)
- Firebase SDK 주소는 `cdn.jsdelivr.net/npm/firebase@10.12.2/firebase-app-compat.js` 형식(중간에 `/compat/` 없음). 예전에 틀려 있던 것을 고침
- Artifact 미리보기에는 **빈 `firebase-config.js`를 그대로 둠**(미리보기 안에서는 외부 접속이 막혀 데모로만 돌아감). 미리보기를 다시 올릴 때 `firebase-config.js`를 `files`에 넣지 말 것
- **Artifact 미리보기 갱신**: 첫 화면은 `index.html`을 변환한 scratchpad의 `game-preview.html`(doctype·html·head·body 제거, 링크에 `target="_blank"`). 다른 파일은 publish의 `files`로 함께 올림. 문제은행은 `questions/bank.tsv` 이름으로 올림(contentType `text/plain`)
- Artifact 안에서는 `alert/confirm/prompt`가 막혀서 교사 화면은 화면 안 창(`choose`/`ask`)만 씀. 새 확인 창도 이것으로
- 사용자가 **작업 도중에 보낸 그림은 파일로 저장되지 않을 수 있음**. 없으면 다시 보내 달라고 요청
- 사용자는 **작업 중간에 쓴 글을 못 보는 경우가 있음**. 프롬프트 등 꼭 전할 내용은 마지막 답변에 쓰거나 파일로 보냄
- Artifact 댓글 답변은 **스레드가 아니라 채팅으로** 달라고 요청받음
- 학생 식별은 기기별 고유 키(`players/{key}: {team, no}`). 모둠은 key가 아니라 `team` 값으로 판단
