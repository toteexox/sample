StackUp M4 rollback M4A — 2026-10-28

1. GitHub sample 루트에 index.html / app.js / style.css 덮어쓰기. data.js, ipa-dictionary.js, manifest.json, audio/ 는 유지.
2. 00:00~01:59 (한국시간) 전날 미션 토글 복구.
3. 마이크 ON/OFF 버튼 제거. 녹음 버튼을 누르면 마이크를 요청하며 원래 M4 방식대로 onstop 후 스트림을 종료.
4. M5 예열 로직 제거. M4 자체에도 최초 녹음 무음 가능성은 남아 있으며 이 수정이 문제를 완전히 해결한다고 보장하지 않음.
5. 성취도/임시 녹음 캐시/카드 UI 및 기타 기능 보존.
6. 웹앱에서 실제 녹음 성공 검증 전. 테스트: 전날 미션 토글→녹음→재생→재녹음 및 오늘 미션 비교.
