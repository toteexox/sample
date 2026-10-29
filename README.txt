Stack Up M9 - M8 기준, 기존 녹음 엔진 보존 / 줍줍 및 통계 개선

적용 방법
1. GitHub의 app.js를 이 폴더의 app.js로 교체.
2. 기존 style.css의 맨 마지막에 CSS_맨아래_추가_M9.txt를 복사하여 추가.
3. index.html의 app.js 버전 query(?v=...)를 ?v=m9로 갱신하면 오래된 캐시를 피하는 데 도움이 됩니다.
4. data.js, ipa-dictionary.js, manifest.json, Firebase 데이터는 변경하지 않습니다.
5. M8 이후 별도로 수정한 app.js가 있다면 통째로 덮어쓰기 전 M8_to_M9.patch를 확인해 변경을 병합해 주세요. .patch 파일은 서버 업로드 불필요.

변경 내용
- 2일차 UE에서 성취도 평가 이후, CH + originalEng가 일치하는 과거 줍줍이 있으면 줍줍 선택 팝업 자동 생략 후 다음 카드로 이동. 변형하여 저장된 줍줍도 이력으로 인정.
- IPA: 발음사전 등록 단어의 IPA를 표시, 미등록 영어/숫자/외국어 단어는 원문을 그대로 넣음. 사용자가 직접 입력한 IPA는 우선 보존.
- 학습/줍줍 챕터 선택 버튼을 삭제하고 1~12챕터 전체 통계표 복원.
- 학습/줍줍 각각 MS, MS UE, RC, RC UE, 총합계 순서로 5행씩. 출처가 불명확한 기존 줍줍이 있을 때만 '기타' 행 추가(기존 기록 누락 방지).
- 총합계 전체 행 배경 강조 + 챕터별 그룹 구획, 숫자 클릭 시 목록 이동 보존.

보존 범위
- startRecording, stopRecording, playUserAudio 및 오디오 저장/캐시 코드 변경 없음.
- selectCardScore, evalFromPopup, Firebase 저장/인증, KST 마감, 27일 패널티 집계 변경 없음.
- 학습/줍줍 목록 및 문장 재생 함수 변경 없음(표 화면 UI만 변경).

주의
- iPhone PWA 실기기 동작 확인은 별도 필요.
- IPA 사전이 로드되지 않으면 생성은 실패할 수 있으므로 기존대로 수동 입력 가능.
- 기존 저장된 줍줍 IPA는 자동 갱신하지 않습니다. 문장 편집 또는 재생성 시 새 규칙 적용.
