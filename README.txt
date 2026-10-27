Stack Up 분리형 (2026-10-27)

구성
- index.html : 화면 마크업
- style.css : 화면 스타일
- app.js : Firebase, 학습, 녹음, 줍줍 등 기존 사이트 로직
- ipa-dictionary.js : CMU 미국식 IPA 변환 사전 (기존 HTML 내부의 데이터를 분리함)
- data.js : 교재 문장/타임코드/IPA 원본 (수정하지 않음)

설치
같은 폴더에 5개 파일을 모두 업로드하세요. 기존 audio/ 폴더 등은 그대로 둡니다.
GitHub Pages에서 index.html을 시작 파일로 사용합니다.
CSS/JS를 분리했으므로 파일 하나만 열거나 배포하면 기능이 작동하지 않습니다.

모바일 녹음 개선
- 매 녹음마다 새 getUserMedia 스트림을 얻어 이전 세션 재사용을 피함
- Koboogy처럼 MediaRecorder.start() + ondataavailable + onstop 기본 흐름
- 웹 오디오 PCM 백업을 동시 수집하여 MediaRecorder의 결과가 0바이트면 WAV로 복구
- 녹음 종료 후 모든 마이크 트랙 해제, 다음 녹음 버튼은 종료 완료 이후 복구
- 재생 중인 HTML audio를 정리한 다음에 새 마이크를 염

주의
- 실제 iOS Safari 실기기 테스트는 아직 수행하지 못했습니다.
- 녹음 자체는 HTTPS 환경에서만 지원됩니다.
- 기존 회원정보는 Firebase에 있으며 data.js 파일은 변경하지 않았습니다.
- 배포 서버에 더 최신 data.js가 있다면 ZIP에 들어 있는 data.js로 덮어쓰지 말고 기존 파일을 유지하세요.
- 재녹음 오류가 또 나오면 오류창에 표시되는 기본 바이트/WAV 백업 바이트/오디오 상태를 알려주세요.
- 파일을 배포할 때 index.html, style.css, app.js, ipa-dictionary.js, data.js가 모두 같은 경로에 있어야 합니다.
