Stack Up Koboogy-R2

GitHub root의 index.html, app.js만 교체하세요. 기존 data.js, style.css, ipa-dictionary.js, audio/ 폴더는 그대로 유지하세요.

변경사항:
- 마이크 스트림을 녹음마다 강제로 끊지 않고 같은 카드/재녹음에서 재사용 (화면 이탈 시에만 종료)
- MediaRecorder start/stop/ondataavailable/FileReader 흐름
- 저장 완료 전 재녹음 방지, 새 녹음 성공 전까지 기존 녹음 보존
- IPA 사전은 변형문장 IPA 자동 생성 버튼을 누를 때 로드

테스트: iPhone 홈 화면 웹앱에서 3초 녹음 → 중지 → 재생 → 재녹음 3회. iPhone 실기기 테스트는 별도 필요합니다.
