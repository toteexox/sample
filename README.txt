Stack Up PWA 최신 버전 확인용 (2026-10-27)

이 ZIP은 기존 분리형 파일의 index.html / app.js만 변경한 진단 버전입니다.
변경 내용
- index.html: CSS/JS 로드 URL에 v=1027pwa3 부여해 이전 HTTP 캐시와 구별
- index.html 하단: 임시 앱 버전 배지 추가
- app.js: 로드 성공 시 배지 텍스트를 "HTML + JS 1027-PWA3"로 변경
- 실제 녹음 로직, Firebase 저장, IPA, 번역, 미션 조건은 변경하지 않음

업로드: 두 파일을 GitHub Pages 저장소 루트에 덮어쓰기. 나머지 파일(data.js, style.css,
ipa-dictionary.js, manifest.json, audio/, stackup.png)은 그대로 유지.

검증 순서
1. Pages 배포가 완료된 후 Safari에서 index.html을 새로 열어 하단 배지가
   "HTML + JS 1027-PWA3"인지 확인.
2. iPhone 홈 화면에 이미 추가한 Stack Up 앱 아이콘을 제거 (웹사이트의 Firebase 데이터는
   서버에 있지만, 앱 내 로컬 임시 녹음/캐시·저장되지 않은 내용은 사라질 수 있습니다).
3. Safari에서 정확히 현재 Pages URL을 열고 [공유] → [홈 화면에 추가] →
   [웹 앱으로 열기] 켬 → [추가]로 재설치.
4. 홈 화면 앱에서 하단 배지가 "HTML + JS 1027-PWA3"인지 확인.
   - 배지가 없음: 오래된 HTML 또는 다른 URL을 열고 있는 것.
   - "HTML ... JS 확인 중": 새 HTML이나 구 JS/로딩 오류 가능성.
   - "HTML + JS ...": 최신 JS 실행됨. 녹음 진단 메시지에서 기본/WAV/오디오 수치 확인.
5. 재설치 후에도 오류가 있으면 오류 팝업의 정확한 문구를 확인하세요.

권한 요청 창이 나타나지 않는 것만으로 마이크가 차단되었다고 결론낼 수 없습니다.
주황색 마이크 아이콘이 켜지면 iPhone이 마이크 사용을 감지하고 있다는 뜻입니다.
"manifest.json"의 start_url이 이전 *.html 파일을 향하고 있다면 설치 시작 주소도
잘못될 수 있습니다. 그런 경우 현재 index.html 시작 주소로 맞춘 후 재설치해야 합니다.

진단 종료 후 버전 배지는 제거해도 됩니다.
