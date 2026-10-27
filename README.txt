Stack Up R3 - 꼬부기와 재생 흐름 맞춤 (원인 분리 테스트)

GitHub root의 index.html과 app.js만 덮어쓰세요.
기존 data.js, style.css, ipa-dictionary.js, manifest.json, audio/ 등은 유지하세요.

꼬부기에서 확인된 차이 2개를 수정:
1) 녹음 onstop에서 Blob 구성 후, 재생 전에 마이크 스트림 닫기(꼬부기 스피커 모드).
2) 내 녹음 재생 시 이미 연결한 src는 다시 바꾸지 않고, readyState>=1일 때만 currentTime=0.

재생 오류 발생 시 에러명/미디어 오류 코드/readyState를 화면에 표시합니다.
NotAllowedError: 사용자 제스처/브라우저 권한 쪽.
NotSupportedError 또는 media=4: 녹음 파일 형식/디코딩/소스 문제.
AbortError: 재생 도중 로딩이 취소됨.

테스트: iPhone 홈 화면 앱에서 3초 녹음 -> 저장 -> 내 녹음 듣기 -> 재녹음 3회.
이 버전은 iPhone 실제 기기에서 아직 검증하지 못했습니다.
