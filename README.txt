Stack Up M5: 녹음 첫 사용 안정화 및 줍줍 변형문장 TTS 제거

GitHub sample 저장소의 index.html / app.js / style.css 파일만 교체합니다.
data.js, ipa-dictionary.js, manifest.json, audio/ 폴더는 변경하지 마세요.

변경: 마이크 ON 후 약 0.75초 사전 예열(음원 저장 안 함), 스트림 재사용, 첫 녹음 진단 로그, 변형문장 TTS/원문 음원 차단, playFallbackTTS 미정의 오류 해결, 녹음 중지 빨강 및 재생 중지 진초록.

주의: iPhone 홈화면 웹앱 실기기 검증 전입니다. 마이크 ON 시 입력 예열 때문에 최초 버튼 반응이 약간 늦을 수 있습니다.
