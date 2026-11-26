# Firebase 설정 안내 (처음 한 번, 약 30분)

학생 갤럭시탭이 TV 화면과 연결되려면 **Firebase**(구글의 무료 실시간 저장소)가 필요해요.
아래 순서대로 따라 하고, 마지막에 나오는 **설정값(firebaseConfig)**을 Claude에게 보내 주세요.

> 화면의 메뉴 이름은 조금 바뀌어 있을 수 있어요. 비슷한 이름을 찾으면 돼요.
> 막히는 화면이 있으면 그 화면을 캡처해서 보내 주세요.

---

## 1단계. 프로젝트 만들기 (5분)
1. 컴퓨터에서 **https://console.firebase.google.com** 에 들어가 학교나 개인 구글 계정으로 로그인해요.
2. **[프로젝트 만들기]**(또는 [프로젝트 추가])를 눌러요.
3. 프로젝트 이름에 `history-island`처럼 영어로 적어요.
4. **Google 애널리틱스**는 필요 없으니 **끄고** [프로젝트 만들기]를 눌러요.
5. 1분쯤 기다렸다가 [계속]을 눌러요.

## 2단계. 익명 로그인 켜기 (3분)
학생이 아이디 없이 들어오게 해 주는 설정이에요. 이름, 이메일 같은 개인정보는 받지 않아요.
1. 왼쪽 메뉴 **빌드(Build) → Authentication**을 눌러요.
2. **[시작하기]**를 눌러요.
3. **로그인 방법(Sign-in method)** 탭에서 **익명(Anonymous)**을 찾아 눌러요.
4. **사용 설정**을 켜고 [저장]을 눌러요.

## 3단계. 실시간 데이터베이스 만들기 (5분)
1. 왼쪽 메뉴 **빌드(Build) → Realtime Database**를 눌러요.
   (이름이 비슷한 **Firestore**가 아니라 **Realtime Database**예요!)
2. **[데이터베이스 만들기]**를 눌러요.
3. 위치는 **싱가포르(asia-southeast1)**를 골라요. 한국에서 가장 가까워요.
4. **잠금 모드로 시작**을 고르고 [사용 설정]을 눌러요.

## 4단계. 보안 규칙 붙여넣기 (3분)
아무나 게임 기록을 바꾸지 못하게 막는 규칙이에요.
1. Realtime Database 화면 위쪽의 **규칙(Rules)** 탭을 눌러요.
2. 안에 있는 글자를 **모두 지우고**, 게임 폴더의 `database.rules.json` 파일 내용을 **전부 복사해서 붙여넣어요**.
3. **[게시]**를 눌러요.

## 5단계. 웹 앱 등록하고 설정값 받기 (5분)
1. 왼쪽 위 **프로젝트 개요** 옆의 **톱니바퀴 → 프로젝트 설정**을 눌러요.
2. 아래쪽 **내 앱** 칸에서 **웹 아이콘 `</>`**를 눌러요.
3. 앱 닉네임에 `history-island-web`처럼 적고 [앱 등록]을 눌러요.
   (Firebase 호스팅 체크는 **하지 않아요**.)
4. 화면에 아래처럼 생긴 글자가 나와요. **이 부분을 통째로 복사해서 Claude에게 보내 주세요.**

```js
const firebaseConfig = {
  apiKey: "AIza....",
  authDomain: "history-island.firebaseapp.com",
  databaseURL: "https://history-island-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "history-island",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "1:...:web:..."
};
```

- `databaseURL` 줄이 없으면, Realtime Database 화면 맨 위에 보이는 `https://...firebasedatabase.app` 주소도 같이 보내 주세요.
- 이 값은 비밀번호가 아니에요. 원래 학생 탭에 그대로 실리는 "주소"예요. 실제 보호는 4단계의 보안 규칙이 해요. 그래서 채팅으로 보내셔도 괜찮아요.

---

## 그다음 (Claude가 할 일 → 선생님이 할 일)
1. Claude가 설정값을 `firebase-config.js`에 넣어 드려요.
2. 게임 폴더를 **https://app.netlify.com/drop** 에 끌어다 놓으면 `○○.netlify.app` 주소가 생겨요.
3. 그 주소를 노트북(TV)에서 열고 **[수업 시작]** → 방 만들기 → 선생님 폰이나 탭 2~3대로 QR을 찍어 리허설해요.

## 무료 요금제로 충분한가요?
네. 무료(Spark) 요금제는 **동시 접속 100개**까지 돼요. 한 반 30명이면 넉넉해요.
게임 한 판에 오가는 데이터도 아주 작아요. 수업이 끝나면 [방 삭제하고 처음으로]를 눌러 그날 기록을 지워 주세요.
