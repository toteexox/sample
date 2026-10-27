Stack Up - Koboogy 녹음 엔진 직접 이식 (KOBOOGY-R1)

GitHub 저장소에 index.html, app.js 두 파일만 덮어쓰세요.
기존 style.css, ipa-dictionary.js, data.js, manifest.json, audio/ 등은 건드리지 않습니다.

주요 변경:
- Stack Up의 동시 WAV 백업(AudioContext/ScriptProcessor) 및 복잡한 녹음 세션 엔진 제거
- Koboogy와 같은 getUserMedia -> MediaRecorder(stream) -> start() -> ondataavailable -> onstop -> FileReader.readAsDataURL 사용
- 시작/중지/재녹음/내녹음듣기 버튼은 Stack Up의 기존 UI와 연결
- 녹음 후 영어 공개 및 기존 성취도 단계 유지, 카드별 녹음 sessionAudioCache 저장
- 회원 성취도 및 Firestore 관련 로직과 data.js 미변경
- 캐시 방지 파일 버전: KOBOOGY-R1

테스트: 홈 화면 웹앱에서 같은 카드 5초 녹음->중지->듣기->재녹음 3회 테스트.
JavaScript 구문 검사는 통과하였으나 iPhone 실제 녹음 성공은 검증하지 못했습니다.
