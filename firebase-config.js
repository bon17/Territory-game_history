/* Firebase 설정값 (웹 앱 등록 때 받은 값).
 * 비밀번호가 아니라 공개되는 주소 정보이고, 실제 보호는 database.rules.json 보안 규칙이 한다.
 * 이 값을 지우면 데모 모드(한 컴퓨터의 창끼리만 연결)로 돌아간다. */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyCKXmv4-AgofSM40pNV7jokYFOrmaP51Zg",
  authDomain: "history-island-c26b2.firebaseapp.com",
  databaseURL: "https://history-island-c26b2-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "history-island-c26b2",
  storageBucket: "history-island-c26b2.firebasestorage.app",
  messagingSenderId: "451215160821",
  appId: "1:451215160821:web:6657344f59b80b76a81cbc"
};
