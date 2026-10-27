// =========================================================================
        // 1. Firebase 설정 및 전역 상태 변수
        // =========================================================================
        const firebaseConfig = {
            apiKey: "AIzaSyDa1T4SCiHKrWjE077VE027eJMfSa4LKcQ", authDomain: "study-koboogy.firebaseapp.com",
            projectId: "study-koboogy", storageBucket: "study-koboogy.firebasestorage.app",
            messagingSenderId: "886555559774", appId: "1:886555559774:web:7eec83679a72d9fedd31cf"
        };
        firebase.initializeApp(firebaseConfig);
        const auth = firebase.auth(); 
        const db = firebase.firestore();
        
        try { db.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch(e) {}

        let currentUserUid = null;
        let userDB = { completedTasks: {}, jubs: [], cardStats: {}, cardMemos: {} };
        let isAdmin = false;
        
	// 💡 [수정2-1] 무조건 한국 시간(KST) 강제 적용
        function getKSTDate() {
            const now = new Date();
            const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
            return new Date(utc + (9 * 3600000));
        }
        let simulatedDate = getKSTDate();
        let lastRenderedDate = simulatedDate.getDate();


        // 리스트 재생 관련
        let globalTempLists = [];
        let isListEngFirst = false;
        let currentListIdx = -1;
        let currentListType = '';
        let currentListTitle = '';
        let currentAudioSpeed = 1.0;
        let selectedListenMode = 'listen'; 
        let configPlaySpeed = 1.0;
        let currentRepeatLimit = 3;
        let currentRepeatCurrent = 0;
        let isPlayingAll = false; 
        let playAllIndex = 0; 
        let playAllList = []; 
        let playAllTimer = null;

        // 툭탁 학습 관련 (꼬부기 최적화 로직 적용)
        let currentDeck = []; 
        let currentCardIndex = 0; 
        let maxReachedIndex = 0; 
        let currentTaskId = null; 
        let currentChStr = ""; 
        let isAnswerRevealed = false; 
        let audioTimer = null; 
        let isTuktakMemoMode = false;
        let isAutoPlayActive = false;
        let autoPlayTimer = null;

        // 꼬부기 녹음 시스템 변수
        let mediaRecorder;
        let audioChunks = [];
        let userAudioUrl = null;
        let globalAudioStream = null; 
        let sessionAudioCache = {}; 

        // 줍줍/메모 모달
        let editingJubId = null;
        let currentMemoKey = "";

        // =========================================================================
        // 2. 인증 및 데이터 관리
        // =========================================================================
        auth.onAuthStateChanged(async (user) => {
            const overlay = document.getElementById('login-overlay');
            if (user) {
                currentUserUid = user.uid;
                const userEmail = user.email || "";
                isAdmin = (userEmail.split('@')[0].toLowerCase() === "raina");
                
                const adminBtn = document.getElementById('admin-panel-btn');
                if (adminBtn) adminBtn.style.display = isAdmin ? 'block' : 'none';

                const cachedData = localStorage.getItem('stackup_cache_' + currentUserUid);
                if (cachedData) {
                    try { userDB = JSON.parse(cachedData); ensureUserDBStructure(); } catch (e) {}
                }

                if (overlay) overlay.classList.remove('active');
                document.body.classList.add('app-loaded');
                
                // 💡 [수정1] 하얀 화면 방지: 데이터를 기다리지 않고 트래커 화면부터 즉시 렌더링
                setTimeout(() => { switchView('tracker'); }, 50);

                db.collection("studyUsers").doc(currentUserUid).get({ source: 'server' })
                .catch(() => db.collection("studyUsers").doc(currentUserUid).get())
                .then(docSnap => {
                    if (docSnap.exists) {
                        userDB = docSnap.data();
                        ensureUserDBStructure();
                    } else {
                        userDB = { completedTasks: {}, jubs: [], cardStats: {}, cardMemos: {}, passwordChanged: false };
                    }
                    if (userDB.passwordChanged !== true) document.getElementById('pw-change-modal').classList.add('active');
                    
                    userDB.lastLoginAt = new Date().toISOString();
                    saveDB(); 
                    updateDateDisplay(); 
                }).catch(e => console.error("백그라운드 데이터 로드 실패:", e));
            } else {
                currentUserUid = null; isAdmin = false;
                userDB = { completedTasks: {}, jubs: [], cardStats: {}, cardMemos: {} };
                document.getElementById('login-spinner').style.display = 'none';
                document.getElementById('login-content').style.display = 'flex';
                if (overlay) overlay.classList.add('active');
                document.body.classList.add('app-loaded');
            }
        });

        function ensureUserDBStructure() {
            if (!userDB.completedTasks) userDB.completedTasks = {};
            if (!Array.isArray(userDB.jubs)) userDB.jubs = [];
            if (!userDB.cardStats) userDB.cardStats = {};
            if (!userDB.cardMemos) userDB.cardMemos = {};
        }

        async function saveDB() {
            if (!currentUserUid) return;
            try { 
                localStorage.setItem('stackup_cache_' + currentUserUid, JSON.stringify(userDB));
                await db.collection("studyUsers").doc(currentUserUid).set(userDB); 
            } catch (e) {}
        }

        function getEmailFromId() {
            let id = document.getElementById('login-id').value.trim();
            return id ? (id.includes('@') ? id : id + "@study.com") : null;
        }

        function handleLogin() {
            const email = getEmailFromId(), pw = document.getElementById('login-pw').value.trim();
            if(!email || !pw) return document.getElementById('auth-error').innerText = "모두 입력해주세요.";
            document.getElementById('login-content').style.display = 'none';
            document.getElementById('login-spinner').style.display = 'block';
            auth.signInWithEmailAndPassword(email, pw).catch(() => { 
                document.getElementById('login-spinner').style.display = 'none';
                document.getElementById('login-content').style.display = 'flex';
                document.getElementById('auth-error').innerText = "정보가 틀렸습니다."; 
            });
        }

        function handleSignup() { alert("회원가입 기능은 관리자에 의해서만 가능합니다. 관리자(Raina)에게 문의하세요."); }
        function signOut() { if(confirm("로그아웃 하시겠습니까?")) auth.signOut(); }

        async function changeInitialPassword() {
            const pw1 = document.getElementById('new-pw-1').value.trim();
            const pw2 = document.getElementById('new-pw-2').value.trim();
            const errEl = document.getElementById('pw-change-error');
            if (pw1.length < 6) { errEl.innerText = "비밀번호는 6자리 이상이어야 합니다."; return; }
            if (pw1 !== pw2) { errEl.innerText = "비밀번호가 일치하지 않습니다."; return; }
            const user = auth.currentUser;
            if (!user) return;
            try {
                errEl.innerText = "변경 중...";
                await user.updatePassword(pw1);
                userDB.passwordChanged = true;
                await saveDB();
                document.getElementById('pw-change-modal').classList.remove('active');
                alert("비밀번호가 안전하게 변경되었습니다!\n본격적으로 스터디를 시작해보세요.");
            } catch (error) {
                if (error.code === 'auth/requires-recent-login') {
                    errEl.innerHTML = "<span style='color:#e03131;'>보안상 새로고침 후에는 변경할 수 없습니다.<br>아래 <b>[로그아웃]</b>을 누르고 <b>다시 로그인한 직후</b>에 변경해주세요!</span>";
                } else if (error.code === 'auth/weak-password') {
                    errEl.innerText = "비밀번호가 너무 약합니다. 더 복잡하게 설정해주세요.";
                } else { errEl.innerText = "오류: " + error.message; }
            }
        }

        // =========================================================================
        // 3. 관리자 전용 제어
        // =========================================================================
        function toggleNewMemberForm() {
            const form = document.getElementById('new-member-form');
            form.style.display = form.style.display === 'none' ? 'flex' : 'none';
        }

        let adminReturnView = 'tracker';
        async function openAdminModal() {
            if (!isAdmin) return alert("관리자만 접근할 수 있습니다.");
            const activeView = document.querySelector('.view-section.active');
            if (activeView && activeView.id !== 'view-admin') adminReturnView = activeView.id.replace('view-', '');
            stopNativeAudio();
            document.querySelectorAll('.view-section, .nav-tab').forEach(el => el.classList.remove('active'));
            document.body.classList.remove('tuktak-mode');
            document.body.classList.add('admin-page-mode');
            document.getElementById('view-admin').classList.add('active');
            window.scrollTo(0, 0);
            await renderAdminUserList();
        }
        function closeAdminModal() {
            document.body.classList.remove('admin-page-mode');
            switchView(['tracker','learn','basket'].includes(adminReturnView) ? adminReturnView : 'tracker');
            window.scrollTo(0, 0);
        }

        async function adminCreateUser() {
            const idInput = document.getElementById('new-user-id').value.trim();
            const pwInput = '123456';
            const errEl = document.getElementById('admin-create-error');
            if (!idInput) { errEl.innerText = "아이디를 입력해주세요."; return; }
            const targetEmail = idInput.includes('@') ? idInput : idInput + "@study.com";
            errEl.innerText = "생성 중...";
            try {
                const tempApp = firebase.initializeApp(firebaseConfig, "SecondaryApp");
                const tempAuth = tempApp.auth();
                const tempDb = tempApp.firestore();
                const cred = await tempAuth.createUserWithEmailAndPassword(targetEmail, pwInput);
                await tempDb.collection("studyUsers").doc(cred.user.uid).set({
                    userId: idInput, completedTasks: {}, jubs: [], cardStats: {}, cardMemos: {}, passwordChanged: false
                });
                await tempApp.delete();
                errEl.innerText = ""; document.getElementById('new-user-id').value = "";
                document.getElementById('new-member-form').style.display = 'none';
                alert(`'${idInput}' 회원이 성공적으로 생성되었습니다!`); renderAdminUserList();
            } catch (err) { errEl.innerText = err.message; }
        }

       async function renderAdminUserList() {
            const listContainer = document.getElementById('admin-user-list');
            listContainer.innerHTML = '<div style="text-align:center; color:#868e96; padding:20px;">목록 불러오는 중...</div>';
            try {
                const snapshot = await db.collection("studyUsers").get();
                listContainer.innerHTML = '';
                if (snapshot.empty) return listContainer.innerHTML = '<div style="text-align:center; color:#868e96; padding:20px;">등록된 회원이 없습니다.</div>';
                let simDateObj = new Date(simulatedDate); simDateObj.setHours(12, 0, 0, 0);
                
                // 전체 문장 개수 사전 계산 (1~12챕터 총 문장 수)
                let totalSentencesCount = 0;
                if (typeof studyData !== 'undefined') {
                    for (let ch = 1; ch <= 12; ch++) {
                        let chStr = ch < 10 ? '0'+ch : ''+ch;
                        const d = studyData[chStr];
                        if (d) {
                            let ms = extractCards(d.mystory ? d.mystory.sentences : [], `MS ${chStr}`, "", chStr);
                            let msue = extractCards(d.useful_mystory ? d.useful_mystory.sentences : [], `MS UE ${chStr}`, "", chStr);
                            let rc = extractCards(d.realconvo ? d.realconvo.chat : [], `RC ${chStr}`, "", chStr);
                            let rcue = extractCards(d.useful_realconvo ? d.useful_realconvo.sentences : [], `RC UE ${chStr}`, "", chStr);
                            totalSentencesCount += (ms.length + msue.length + rc.length + rcue.length);
                        }
                    }
                }
                if (totalSentencesCount === 0) totalSentencesCount = 240;

                // 총 미션 개수 (12챕터 * 5일차 = 60개)
                const totalMissionsCount = 12 * 5;
                
                // 문서 데이터를 배열로 수집
                let usersArray = [];
                snapshot.forEach(doc => {
                    usersArray.push({ uid: doc.id, data: doc.data() });
                });

                // 💡 [요청 반영] 정렬 로직: 관리자(Raina)는 맨 위, 나머지는 알파벳 순(A-Z) 정렬
                usersArray.sort((a, b) => {
                    let nameA = (a.data.userId || (a.data.email ? a.data.email.split('@')[0] : "")).toLowerCase();
                    let nameB = (b.data.userId || (b.data.email ? b.data.email.split('@')[0] : "")).toLowerCase();
                    
                    if (nameA === "raina" || a.uid === currentUserUid && nameA.includes("raina")) return -1;
                    if (nameB === "raina" || b.uid === currentUserUid && nameB.includes("raina")) return 1;
                    
                    return nameA.localeCompare(nameB);
                });

                usersArray.forEach(userItem => {
                    const uid = userItem.uid; const data = userItem.data;
                    let displayName = data.userId || (data.email ? data.email.split('@')[0] : (uid === currentUserUid ? "Raina (관리자)" : `사용자 (${uid.substring(0, 6)})`));
                    let lastLoginStr = "기록 없음";
                    if (data.lastLoginAt) {
                        let d = new Date(data.lastLoginAt);
                        lastLoginStr = `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${d.getMinutes() < 10 ? '0'+d.getMinutes() : d.getMinutes()}`;
                    }
                    
                    const completedMap = data.completedTasks || {};
                    const clearedMissionsCount = Object.keys(completedMap).filter(k => completedMap[k] !== false).length;
                    
                    const cardStatsMap = data.cardStats || {};
                    const learnedSentencesCount = Object.keys(cardStatsMap).length;

                    const learnRate = Math.min(100, Math.round((learnedSentencesCount / totalSentencesCount) * 100));
                    const missionRate = Math.min(100, Math.round((clearedMissionsCount / totalMissionsCount) * 100));

                    const jubsCount = data.jubs ? data.jubs.length : 0;
                    const memosCount = data.cardMemos ? Object.keys(data.cardMemos).length : 0;

                    let totalPenalties = 0;
                    for (let ch = 1; ch <= 12; ch++) {
                        let chStr = ch < 10 ? '0'+ch : ''+ch; let chStartOffset = (ch - 1) * 2;
                        Object.keys(taskOffsets).forEach(dayLabel => {
                            let reqStudyDayCount = chStartOffset + taskOffsets[dayLabel];
                            let missionDate = new Date("2026-10-26T12:00:00"); let addedDays = 0;
                            while (addedDays < reqStudyDayCount) {
                                missionDate.setDate(missionDate.getDate() + 1);
                                if (missionDate.getDay() !== 0 && missionDate.getDay() !== 6) addedDays++;
                            }
                            let deadline = new Date(missionDate); deadline.setDate(deadline.getDate() + 1); deadline.setHours(2, 0, 0, 0);
                            if (simDateObj >= deadline) {
                                let taskId = `CH${chStr}-${dayLabel}`; let isFinished = false;
                                if (completedMap[taskId] && completedMap[taskId] !== false) {
                                    if (new Date(completedMap[taskId]) <= deadline) isFinished = true;
                                }
                                if (!isFinished) totalPenalties++;
                            }
                        });
                    }
                    
                    let item = document.createElement('div');
                    item.style.cssText = "background:#f1f3f5; padding:14px 16px; border-radius:12px; display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;";
                    item.innerHTML = `
                        <div style="flex:1; padding-right:10px;">
                            <div style="font-weight:800; font-size:16px; color:#1e293b; display:flex; align-items:center; gap:6px;">
                                <i class="fas fa-user-circle" style="color:#339af0; font-size:18px;"></i> ${displayName}
                                <span style="font-size:11px; background:#e2e8f0; color:#475569; padding:2px 6px; border-radius:6px; font-weight:600;">최근 로그인: ${lastLoginStr}</span>
                            </div>
                            <div style="font-size:12px; color:#495057; margin-top:8px; display:flex; gap:12px; flex-wrap:wrap; line-height: 1.5;">
                                <span style="color:${totalPenalties > 0 ? '#e03131' : '#2b8a3e'};">⚠️ 패널티: <b>${totalPenalties}회</b></span>
                                <span>📚 학습률: <b style="color:#1d4ed8;">${learnedSentencesCount}/${totalSentencesCount}개 (${learnRate}%)</b></span>
                                <span>🎯 미션 완료율: <b style="color:#2b8a3e;">${clearedMissionsCount}/${totalMissionsCount}개 (${missionRate}%)</b></span>
                                <span>🧺 줍줍: <b style="color:#7950f2;">${jubsCount}개</b></span>
                                <span>📝 메모: <b style="color:#e67700;">${memosCount}개</b></span>
                            </div>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:6px; flex-shrink:0; width:90px;">
                            <button style="width:100%; padding:7px 0; background:#f59f00; color:white; border:none; border-radius:8px; font-weight:700; font-size:12px; cursor:pointer;" onclick="openAdminResetModal('${uid}')">선택초기화</button>
                            <button style="width:100%; padding:7px 0; background:#fa5252; color:white; border:none; border-radius:8px; font-weight:700; font-size:12px; cursor:pointer;" onclick="adminDeleteUser('${uid}')">삭제</button>
                        </div>
                    `;
                    listContainer.appendChild(item);
                });
            } catch (err) {
                console.error('[StackUp] 회원 목록 로딩 실패:', err);
                const code = err && err.code ? err.code : 'unknown';
                const reason = code === 'permission-denied' ? 'Firestore 읽기 권한이 없습니다.' :
                    code === 'unavailable' ? '네트워크 또는 Firestore 연결을 확인해 주세요.' :
                    '회원 목록 처리 중 오류가 발생했습니다.';
                listContainer.textContent = '';
                const msg = document.createElement('div');
                msg.style.cssText = 'text-align:center; color:#e03131; padding:20px; line-height:1.7; overflow-wrap:anywhere;';
                msg.textContent = `${reason} (오류 코드: ${code}) ${err && err.message ? err.message : ''}`;
                listContainer.appendChild(msg);
            }
        }


        // =========================================================================
        // 🔄 데이터 선택 초기화 제어 (개별 & 전체 통합 모달 엔진)
        // =========================================================================
        let targetResetUid = null;
        
        function openAdminResetModal(uid) {
            targetResetUid = uid;
            
            // 모달 열 때 체크박스 기본값 세팅 (미션만 기본 체크)
            document.getElementById('reset-opt-mission').checked = true;
            document.getElementById('reset-opt-stats').checked = false;
            document.getElementById('reset-opt-jubs').checked = false;
            document.getElementById('reset-opt-memos').checked = false;
            
            // 전체 초기화 vs 개별 초기화 UI 분기
            const titleEl = document.getElementById('admin-reset-title');
            if (uid === 'ALL_USERS') {
                titleEl.innerHTML = '⚠️ <span style="color:#e03131;">전체 회원</span> 데이터 초기화';
            } else {
                titleEl.innerHTML = '🔄 특정 회원 데이터 초기화';
            }

            document.getElementById('admin-reset-modal').classList.add('active');
        }
        
        function closeAdminResetModal() {
            targetResetUid = null;
            document.getElementById('admin-reset-modal').classList.remove('active');
        }

        async function executeAdminReset() {
            if (!targetResetUid) return;
            
            const optMission = document.getElementById('reset-opt-mission').checked;
            const optStats = document.getElementById('reset-opt-stats').checked;
            const optJubs = document.getElementById('reset-opt-jubs').checked;
            const optMemos = document.getElementById('reset-opt-memos').checked;

            if (!optMission && !optStats && !optJubs && !optMemos) {
                return alert("초기화할 항목을 1개 이상 선택해주세요.");
            }
            
            const isAll = targetResetUid === 'ALL_USERS';
            const confirmMsg = isAll 
                ? "⚠️ 정말 [모든 회원]의 선택 항목을 일괄 초기화하시겠습니까?\n(이 작업은 절대 되돌릴 수 없습니다!)"
                : "선택한 항목들을 정말 초기화하시겠습니까?\n(이 작업은 되돌릴 수 없습니다.)";
                
            if (!confirm(confirmMsg)) return;

            const executeBtn = document.getElementById('btn-execute-reset');
            const origText = executeBtn.innerText;
            executeBtn.innerText = "초기화 진행 중...";
            executeBtn.disabled = true;

            try {
                if (isAll) {
                    // 전체 회원 일괄 초기화
                    const snapshot = await db.collection("studyUsers").get({ source: 'server' }).catch(() => db.collection("studyUsers").get());
                    const batch = db.batch();
                    
                    snapshot.forEach(doc => {
                        let data = doc.data();
                        let updatePayload = {};
                        if (optMission) {
                            updatePayload.completedTasks = {};
                            Object.keys(data).forEach(key => { if (key.startsWith('progress_')) updatePayload[key] = firebase.firestore.FieldValue.delete(); });
                        }
                        if (optStats) updatePayload.cardStats = {};
                        if (optJubs) updatePayload.jubs = [];
                        if (optMemos) updatePayload.cardMemos = {};
                        
                        batch.update(doc.ref, updatePayload);
                    });
                    await batch.commit();
                    
                } else {
                    // 특정 회원 개별 초기화
                    const docRef = db.collection("studyUsers").doc(targetResetUid);
                    const docSnap = await docRef.get({ source: 'server' }).catch(() => docRef.get());
                    
                    if (docSnap.exists) {
                        let data = docSnap.data();
                        let updatePayload = {};
                        if (optMission) {
                            updatePayload.completedTasks = {};
                            Object.keys(data).forEach(key => { if (key.startsWith('progress_')) updatePayload[key] = firebase.firestore.FieldValue.delete(); });
                        }
                        if (optStats) updatePayload.cardStats = {};
                        if (optJubs) updatePayload.jubs = [];
                        if (optMemos) updatePayload.cardMemos = {};
                        
                        await docRef.update(updatePayload);
                    }
                }

                // 현재 로그인 중인 관리자 본인이 초기화 대상에 포함되었을 경우, 즉시 로컬 메모리 갱신
                if (isAll || targetResetUid === currentUserUid) {
                    if (optMission) {
                        Object.keys(userDB).forEach(key => { if (key.startsWith('progress_')) delete userDB[key]; });
                        userDB.completedTasks = {};
                    }
                    if (optStats) userDB.cardStats = {};
                    if (optJubs) userDB.jubs = [];
                    if (optMemos) userDB.cardMemos = {};
                    
                    localStorage.setItem('stackup_cache_' + currentUserUid, JSON.stringify(userDB));
                    updateDateDisplay(); 
                }

                executeBtn.innerText = origText;
                executeBtn.disabled = false;
                
                alert(isAll ? "🎉 모든 회원의 선택한 항목이 초기화되었습니다!" : "선택한 항목이 깔끔하게 초기화되었습니다.");
                closeAdminResetModal();
                renderAdminUserList();

            } catch (err) {
                executeBtn.innerText = origText;
                executeBtn.disabled = false;
                alert("초기화 중 오류가 발생했습니다: " + err.message); 
            }
        }
        

       
        async function adminDeleteUser(uid) {
            if(uid === currentUserUid) return alert("본인 계정은 삭제할 수 없습니다.");
            if(confirm("이 회원을 완전히 삭제할까요?")) {
                await db.collection("studyUsers").doc(uid).delete(); alert("삭제 완료"); renderAdminUserList();
            }
        }

        // =========================================================================
        // 4. 네비게이션 & UI (탭, 날짜, 공통 로직)
        // =========================================================================
        // 💡 [신규 추가] 해외 접속자도 무조건 한국 시간(KST)을 반환하게 만드는 만능 함수
        function getKSTTimeParts(dateObj) {
            const formatter = new Intl.DateTimeFormat('en-US', { 
                timeZone: 'Asia/Seoul', 
                month: 'numeric', day: 'numeric', 
                hour: 'numeric', minute: 'numeric', hour12: false 
            });
            const parts = formatter.formatToParts(dateObj);
            let m = parts.find(p => p.type === 'month').value;
            let d = parts.find(p => p.type === 'day').value;
            let h = parts.find(p => p.type === 'hour').value;
            let min = parts.find(p => p.type === 'minute').value;
            
            if (min.length === 1) min = '0' + min;
            if (h === '24') h = '00';
            
            return { m, d, h, min };
        }

        function updateDateDisplay() {
            simulatedDate = getKSTDate(); // 💡 매초 한국 시간 동기화

            const options = { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
            const timeString = simulatedDate.toLocaleString('ko-KR', options);
            
            const displayEl = document.getElementById('currentDateDisplay');
            if (displayEl) displayEl.innerText = `📅 ${timeString}`;
            
            if (simulatedDate.getDate() !== lastRenderedDate) {
                lastRenderedDate = simulatedDate.getDate();
                if(document.getElementById('view-tracker').classList.contains('active')) renderTracker();
            }

            // 💡 [수정2-2] 새벽 0시~1시 59분까지만 표시하고, 2시 00분부터 숨김!
            const toggleBtn = document.getElementById('btn-toggle-mission-day');
            if (toggleBtn) {
                const hour = simulatedDate.getHours();
                if (hour >= 0 && hour < 2) { 
                    toggleBtn.style.display = 'block'; 
                } else {
                    toggleBtn.style.display = 'none';
                    if (typeof isYesterdayMissionMode !== 'undefined' && isYesterdayMissionMode) toggleYesterdayMission();
                }
            }

            setTimeout(() => {
                if(document.getElementById('view-tracker').classList.contains('active')) renderTracker();
                if(document.getElementById('view-learn').classList.contains('active')) renderLearnTable();
                if(document.getElementById('view-basket').classList.contains('active')) renderBasketTable();
            }, 100);
        }

        // 1초마다 실시간 시간 갱신
        setInterval(updateDateDisplay, 1000);



        function changeDate(days) {
            if (simulatedDate > new Date("2026-10-25T23:59:59") && days > 0 && !isAdmin) return alert("시작일 이후에는 미래로 넘길 수 없습니다!");
            simulatedDate.setDate(simulatedDate.getDate() + days); updateDateDisplay();
        }
        function resetDate() { simulatedDate = new Date("2026-10-26T12:00:00"); updateDateDisplay(); }

        function switchView(viewName) {
            document.body.classList.remove('admin-page-mode');
            stopNativeAudio();
            const btn = document.getElementById('btn-play-learn');
            if (btn) { btn.innerText = "🎧"; btn.style.background = "#f1f3f5"; btn.style.color = "#495057"; }
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
            document.body.classList.remove('tuktak-mode');
            
            document.getElementById('learn-list-container').style.display = 'none';
            document.getElementById('basket-list-container').style.display = 'none';
            document.querySelectorAll('.stats-table-wrapper').forEach(el => el.style.display = 'block');
            document.querySelectorAll('.schedule-info-box').forEach(el => el.style.display = 'flex');
            
            if(viewName === 'tracker') {
                document.querySelectorAll('.nav-tab')[0].classList.add('active'); document.getElementById('view-tracker').classList.add('active'); renderTracker();
            } else if (viewName === 'learn') {
                document.querySelectorAll('.nav-tab')[1].classList.add('active'); document.getElementById('view-learn').classList.add('active'); renderLearnTable();
            } else if (viewName === 'basket') {
                document.querySelectorAll('.nav-tab')[2].classList.add('active'); document.getElementById('view-basket').classList.add('active'); renderBasketTable();
            }
        }

        // 🔝 창 및 리스트 내부 스크롤 모두 감지하는 TOP 버튼 제어
        window.onscroll = function() { checkScrollTop(); };
        
        function checkScrollTop() {
            const btnTop = document.getElementById('btn-scroll-top');
            if (!btnTop) return;
            
            // 윈도우 스크롤 또는 현재 활성화된 리스트 wrapper의 스크롤 위치 감지
            const winScroll = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
            const activeListWrapper = document.querySelector('.view-section.active .list-wrapper');
            const listScroll = activeListWrapper ? activeListWrapper.scrollTop : 0;

            if (winScroll > 300 || listScroll > 300) {
                btnTop.style.display = 'flex';
            } else {
                btnTop.style.display = 'none';
            }
        }

        // 리스트 스크롤 이벤트도 실시간 감지하도록 연결
        document.addEventListener('scroll', function(e) {
            if (e.target && e.target.classList && e.target.classList.contains('list-wrapper')) {
                checkScrollTop();
            }
        }, true);



        function scrollToTop() { 
            window.scrollTo({ top: 0, behavior: 'smooth' }); 
            // 💡 [핵심 수정2] 화면에 떠 있는 리스트 창이 있다면 그 안의 스크롤도 올림
            const activeWrapper = document.querySelector('.view-section.active .list-wrapper');
            if (activeWrapper) activeWrapper.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function extractCards(items, badgeTitle, audioPath, chStr) {
            let cards = [];
            if (!items) return cards;
            items.forEach(item => {
                if (item.type === "note") return;
                let engText = item.chunks && Array.isArray(item.chunks) ? item.chunks.map(c => c.text).join(" ") : (item.text || "");
                if (item.trans && engText) cards.push({ kor: item.trans, eng: engText, chunks: item.chunks || [], ipa: item.ipa||"", audio: audioPath||"", start: item.start||0, end: item.end||0, originalEng: engText, badge: badgeTitle, ch: chStr });
            });
            return cards;
        }
        function getCardStatus(chStr, originalEng) { return userDB.cardStats[chStr + "_" + originalEng] || null; }
        function pushGlobalList(arr) { globalTempLists.push(arr); return globalTempLists.length - 1; }

        // =========================================================================
        // 5. 트래커 렌더링
        // =========================================================================
        const taskOffsets = { "1일차": 0, "2일차": 1, "3일차": 2, "4일차": 3, "5일차": 5 };
        const taskLabels = {
            "1일차": { icon: "📖", name: "진도", sub: "본문 학습", desc: "본문(MS/RC) 흐름 파악", type: "story" },
            "2일차": { icon: "✍️", name: "확장", sub: "UE 학습", desc: "UE 표현 줍줍&변형", type: "pattern" },
            "3일차": { icon: "🗣️", name: "술술", sub: "본문 인출", desc: "본문 달달 복습(MS/RC)", type: "story" },
            "4일차": { icon: "🔄", name: "각인", sub: "UE 인출", desc: "줍줍&변형 달달 복습", type: "pattern" },
            "5일차": { icon: "🏁", name: "완성", sub: "전체 점검", desc: "본문+줍줍 최종 복습", type: "pattern" }
        };

         function renderTracker() {
            // 💡 [수정2-3] 무조건 한국 시간 기준으로 미션 계산
            const today = getKSTDate(); 
            if (typeof isYesterdayMissionMode !== 'undefined' && isYesterdayMissionMode) {
                today.setDate(today.getDate() - 1);
            }

            let count = 0; 
            let cur = new Date("2026-10-26T12:00:00"); 
            let end = new Date(today);
            cur.setHours(0,0,0,0);
            end.setHours(0,0,0,0);

            while(cur < end) { 
                if(cur.getDay() !== 0 && cur.getDay() !== 6) count++; 
                cur.setDate(cur.getDate() + 1); 
            }
            
            const currentStudyDays = today < new Date("2026-10-26T00:00:00") ? -1 : count;
            const isWeekend = (today.getDay() === 0 || today.getDay() === 6);
            
            const grid = document.getElementById('tracker-grid');
            const todoContainer = document.getElementById('todo-list-container');
            const gridFragment = document.createDocumentFragment();
            const todoFragment = document.createDocumentFragment();
            let todayTasks = [];

            for(let ch=1; ch<=12; ch++) {
                let chStr = ch < 10 ? '0'+ch : ''+ch; let chStartOffset = (ch - 1) * 2;
                let box = document.createElement('div'); box.className = 'chapter-box';
                box.innerHTML = `<div class="chapter-title">Chapter ${chStr}</div>`;
                let taskGrid = document.createElement('div'); taskGrid.className = 'task-grid';

                Object.keys(taskOffsets).forEach(dayLabel => {
                    let reqDays = chStartOffset + taskOffsets[dayLabel];
                    let taskId = `CH${chStr}-${dayLabel}`;
                    let uiInfo = taskLabels[dayLabel];
                    let cell = document.createElement('div'); cell.className = `task-cell ${uiInfo.type}-day`;
                    
                    let completedVal = userDB.completedTasks[taskId];
                    let isCompleted = completedVal !== undefined && completedVal !== false;
                    let isToday = (!isWeekend && reqDays === currentStudyDays);
                    let isMissed = (reqDays < currentStudyDays) && !isCompleted;
                    let isFuture = reqDays > currentStudyDays;

                    cell.innerHTML = `
                        <span class="task-icon" style="font-size:16px; margin-bottom:2px;">${uiInfo.icon}</span>
                        <span style="font-weight:800; font-size:13px; color:inherit;">${uiInfo.name}</span>
                        <span style="font-size:9.5px; color:#868e96; font-weight:600; margin-top:1px;">${uiInfo.sub}</span>
                    `;

                    if (isToday) todayTasks.push({ chStr, dayLabel, uiInfo, isCompleted, completedVal });

                    if (isCompleted) cell.classList.add('completed');
                    else if (isToday) cell.classList.add('active-today');
                    else if (isMissed) cell.classList.add('missed');
                    else cell.style.opacity = '0.45';

                    cell.onclick = () => {
                        if (isFuture) {
                            alert("⏳ 아직 오픈되지 않은 미션입니다.\n지정된 날짜 이후에 학습할 수 있습니다!");
                            return;
                        }
                        // 날짜를 기준으로 자동학습 허용 여부를 다시 판정 (지난 미션은 언제나 허용)
                        startTuktakDaily(chStr, dayLabel);
                    };
                    taskGrid.appendChild(cell);
                });
                box.appendChild(taskGrid); 
                gridFragment.appendChild(box);
            }

            grid.innerHTML = '';
            grid.appendChild(gridFragment);

            todoContainer.innerHTML = '';
            if (isWeekend) todoContainer.innerHTML = `<div class="mission-empty">🏖️ 주말입니다! 자유롭게 학습하세요🔥</div>`;
            else if (todayTasks.length === 0) todoContainer.innerHTML = `<div class="mission-empty">오늘 미션이 없습니다.</div>`;
            else {
                todayTasks.forEach(item => {
                    const cardEl = document.createElement('div'); cardEl.className = `mission-card ${item.isCompleted ? 'completed':''}`;
                    cardEl.onclick = () => startTuktakDaily(item.chStr, item.dayLabel);
                    let completedAtHtml = '';
                    if (item.isCompleted) {
                        if (typeof item.completedVal === 'string') {
                            let d = new Date(item.completedVal);
                            let m = d.getMonth() + 1; let day = d.getDate();
                            let h = d.getHours(); let min = d.getMinutes() < 10 ? '0'+d.getMinutes() : d.getMinutes();
                            completedAtHtml = `<div style="font-size:13px; color:#64748b; margin-top:6px; font-weight:700;">✅ ${m}월 ${day}일 ${h}:${min} 학습 완료</div>`;
                        } else {
                            completedAtHtml = `<div style="font-size:13px; color:#64748b; margin-top:6px; font-weight:700;">✅ 완료됨</div>`;
                        }
                    }

                    let taskId = `CH${item.chStr}-${item.dayLabel}`;
                    let progressIdx = userDB["progress_" + taskId];
                    let isInProgress = progressIdx !== undefined && progressIdx > 0;
                    
                    let btnHtml = '';
                    if (item.isCompleted) {
                        btnHtml = `<div class="play-circle-btn" style="background:#ebfbee; border-color:#8ce99a; color:#2b8a3e; font-size:20px;"><i class="fas fa-check"></i></div>`;
                    } else if (isInProgress) {
                        btnHtml = `<div style="display:flex; align-items:center; gap:6px; padding:10px 16px; background:#fff4e6; color:#f59f00; border-radius:20px; font-size:14px; font-weight:800; white-space:nowrap; transition:all 0.2s;">이어하기 <i class="fas fa-chevron-right"></i></div>`;
                    } else {
                        btnHtml = `<div style="display:flex; align-items:center; gap:6px; padding:10px 16px; background:#eef4ff; color:#339af0; border-radius:20px; font-size:14px; font-weight:800; white-space:nowrap; transition:all 0.2s;">미션 시작 <i class="fas fa-chevron-right"></i></div>`;
                    }

                    cardEl.innerHTML = `
                        <div class="mission-left">
                            <div class="mission-top-row"><span class="day-pill">${item.dayLabel}</span><span class="mission-desc-green">${item.uiInfo.desc}</span></div>
                            <div class="mission-main-title">Chapter ${item.chStr} - ${item.uiInfo.name}</div>
                            ${completedAtHtml}
                        </div>
                        ${btnHtml}`;
                    todoFragment.appendChild(cardEl);
                });
                todoContainer.appendChild(todoFragment);
            }
        }



	function getCardStatus(chStr, eng) { return userDB.cardStats[chStr + "_" + eng] || null; }

        // =========================================================================
        // 6. 학습 / 줍줍 리스트 렌더링
        // =========================================================================
        function renderLearnTable() {
            if (typeof studyData === 'undefined') return;
            const tbody = document.getElementById('learn-table-body'); tbody.innerHTML = '';
            globalTempLists = [];

            document.querySelector('#view-learn .stats-table thead tr').innerHTML = '<th>CH</th><th>파트</th><th>전체</th><th>술술</th><th>버벅</th><th>막힘</th><th>미평가</th>';

            for(let i=1; i<=12; i++) {
                let chStr = i < 10 ? '0'+i : ''+i;
                const d = studyData[chStr]; if(!d) continue;

                let msCards = extractCards(d.mystory ? d.mystory.sentences : [], `MS ${chStr}`, d.mystory ? d.mystory.audio : "", chStr);
                let msueCards = extractCards(d.useful_mystory ? d.useful_mystory.sentences : [], `MS UE ${chStr}`, d.useful_mystory ? d.useful_mystory.audio : "", chStr);
                let rcCards = extractCards(d.realconvo ? d.realconvo.chat : [], `RC ${chStr}`, d.realconvo ? d.realconvo.audio : "", chStr);
                let rcueCards = extractCards(d.useful_realconvo ? d.useful_realconvo.sentences : [], `RC UE ${chStr}`, d.useful_realconvo ? d.useful_realconvo.audio : "", chStr);

                let chAllCards = [...msCards, ...msueCards, ...rcCards, ...rcueCards];
                let chStats = { fluent: [], hesitant: [], stuck: [], untested: [] };
                chAllCards.forEach(c => {
                    let st = getCardStatus(c.ch, c.eng); 
                    if(st === '술술') chStats.fluent.push(c);
                    else if(st === '버벅') chStats.hesitant.push(c);
                    else if(st === '막힘') chStats.stuck.push(c);
                    else chStats.untested.push(c); 
                });

                let tAllIdx = pushGlobalList(chAllCards);
                let fAllIdx = pushGlobalList(chStats.fluent);
                let hAllIdx = pushGlobalList(chStats.hesitant);
                let sAllIdx = pushGlobalList(chStats.stuck);
                let uAllIdx = pushGlobalList(chStats.untested); 

                let trAll = document.createElement('tr');
                trAll.innerHTML = `
                    <td rowspan="5" class="col-ch">${chStr}</td>
                    <td class="col-part" style="background:#f1f3f5; border-radius:6px;">총합</td>
                    <td class="${chAllCards.length>0?'clickable':''}" onclick="showList('learn', 'CH${chStr} 전체', ${tAllIdx})">${chAllCards.length || '-'}</td>
                    <td class="${chStats.fluent.length>0?'clickable num-fluent':''}" onclick="showList('learn', 'CH${chStr} 전체 - 술술', ${fAllIdx})">${chStats.fluent.length || '-'}</td>
                    <td class="${chStats.hesitant.length>0?'clickable num-hesitant':''}" onclick="showList('learn', 'CH${chStr} 전체 - 버벅', ${hAllIdx})">${chStats.hesitant.length || '-'}</td>
                    <td class="${chStats.stuck.length>0?'clickable num-stuck':''}" onclick="showList('learn', 'CH${chStr} 전체 - 막힘', ${sAllIdx})">${chStats.stuck.length || '-'}</td>
                    <td class="${chStats.untested.length>0?'clickable num-untested':''}" onclick="showList('learn', 'CH${chStr} 전체 - 미평가', ${uAllIdx})">${chStats.untested.length || '-'}</td>
                `;
                tbody.appendChild(trAll);

                const parts = [
                    { id: "MS", label: "MS", data: msCards },
                    { id: "MS UE", label: "MS UE", data: msueCards },
                    { id: "RC", label: "RC", data: rcCards },
                    { id: "RC UE", label: "RC UE", data: rcueCards }
                ];

                parts.forEach((part) => {
                    let stats = { fluent: [], hesitant: [], stuck: [], untested: [] };
                    part.data.forEach(c => {
                        let st = getCardStatus(c.ch, c.eng);
                        if(st === '술술') stats.fluent.push(c);
                        else if(st === '버벅') stats.hesitant.push(c);
                        else if(st === '막힘') stats.stuck.push(c);
                        else stats.untested.push(c);
                    });

                    let tIdx = pushGlobalList(part.data); let fIdx = pushGlobalList(stats.fluent);
                    let hIdx = pushGlobalList(stats.hesitant); let sIdx = pushGlobalList(stats.stuck);
                    let uIdx = pushGlobalList(stats.untested);

                    let tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td class="col-part" style="border-top:1px dashed #e9ecef;">${part.label}</td>
                        <td class="${part.data.length>0?'clickable':''}" style="border-top:1px dashed #e9ecef;" onclick="showList('learn', 'CH${chStr} ${part.label} 전체', ${tIdx})">${part.data.length || '-'}</td>
                        <td class="${stats.fluent.length>0?'clickable num-fluent':''}" style="border-top:1px dashed #e9ecef;" onclick="showList('learn', 'CH${chStr} ${part.label} - 술술', ${fIdx})">${stats.fluent.length || '-'}</td>
                        <td class="${stats.hesitant.length>0?'clickable num-hesitant':''}" style="border-top:1px dashed #e9ecef;" onclick="showList('learn', 'CH${chStr} ${part.label} - 버벅', ${hIdx})">${stats.hesitant.length || '-'}</td>
                        <td class="${stats.stuck.length>0?'clickable num-stuck':''}" style="border-top:1px dashed #e9ecef;" onclick="showList('learn', 'CH${chStr} ${part.label} - 막힘', ${sIdx})">${stats.stuck.length || '-'}</td>
                        <td class="${stats.untested.length>0?'clickable num-untested':''}" style="border-top:1px dashed #e9ecef;" onclick="showList('learn', 'CH${chStr} ${part.label} - 미평가', ${uIdx})">${stats.untested.length || '-'}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        }


        function renderBasketTable() {
            const tbody = document.getElementById('basket-table-body'); tbody.innerHTML = '';
            globalTempLists = [];

            document.querySelector('#view-basket .stats-table thead tr').innerHTML = '<th>CH</th><th>전체</th><th>술술</th><th>버벅</th><th>막힘</th><th>미평가</th>';

            for(let i=1; i<=12; i++) {
                let chStr = i < 10 ? '0'+i : ''+i;
                let jubs = userDB.jubs.filter(j => j.ch === chStr);
                if(jubs.length === 0) {
                    tbody.innerHTML += `<tr><td class="col-ch">${chStr}</td><td>-</td><td>-</td><td>-</td><td>-</td><td>-</td></tr>`;
                    continue;
                }

                let basketCards = jubs.map(j => ({
                    kor: j.kor, eng: j.eng, ipa: j.ipa||"", audio: j.audio||"", start: j.start||0, end: j.end||0,
                    originalEng: j.originalEng, badge: j.section, ch: chStr, jubId: j.id
                }));

                let bStats = { total: basketCards, fluent: [], hesitant: [], stuck: [], untested: [] };
                basketCards.forEach(c => {
                    let st = getCardStatus(c.ch, c.eng); 
                    if(st === '술술') bStats.fluent.push(c);
                    else if(st === '버벅') bStats.hesitant.push(c);
                    else if(st === '막힘') bStats.stuck.push(c);
                    else bStats.untested.push(c); 
                });

                let tIdx = pushGlobalList(bStats.total); let fIdx = pushGlobalList(bStats.fluent);
                let hIdx = pushGlobalList(bStats.hesitant); let sIdx = pushGlobalList(bStats.stuck);
                let uIdx = pushGlobalList(bStats.untested);

                let tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="col-ch">${chStr}</td>
                    <td class="${bStats.total.length>0?'clickable':''}" onclick="showList('basket', 'CH${chStr} 담은 문장 전체', ${tIdx})">${bStats.total.length || '-'}</td>
                    <td class="${bStats.fluent.length>0?'clickable num-fluent':''}" onclick="showList('basket', 'CH${chStr} 줍줍 - 술술', ${fIdx})">${bStats.fluent.length || '-'}</td>
                    <td class="${bStats.hesitant.length>0?'clickable num-hesitant':''}" onclick="showList('basket', 'CH${chStr} 줍줍 - 버벅', ${hIdx})">${bStats.hesitant.length || '-'}</td>
                    <td class="${bStats.stuck.length>0?'clickable num-stuck':''}" onclick="showList('basket', 'CH${chStr} 줍줍 - 막힘', ${sIdx})">${bStats.stuck.length || '-'}</td>
                    <td class="${bStats.untested.length>0?'clickable num-untested':''}" onclick="showList('basket', 'CH${chStr} 줍줍 - 미평가', ${uIdx})">${bStats.untested.length || '-'}</td>
                `;
                tbody.appendChild(tr);
            }
        }


        function showList(type, title, listIdx) {
            currentListType = type; currentListIdx = listIdx; currentListTitle = title; 
            const container = document.getElementById(type + '-list-container');
            document.getElementById('learn-list-container').style.display = 'none'; document.getElementById('basket-list-container').style.display = 'none';
            document.querySelectorAll(`#view-${type} .stats-table-wrapper`).forEach(el => el.style.display = 'none');
            document.querySelectorAll(`#view-${type} .schedule-info-box`).forEach(el => el.style.display = 'none');
            container.style.display = 'block';
            document.getElementById(type + '-list-title').innerHTML = `<span style="display:flex; align-items:center; gap:10px;"><button onclick="hideList('${type}')" style="background:none; border:none; font-size:22px; color:#495057; cursor:pointer; padding:0; display:flex; align-items:center;"><i class="fas fa-arrow-left"></i></button>${title} (${globalTempLists[listIdx].length})</span>`;
            isListEngFirst = false; 
            document.querySelectorAll('.lang-toggle-wrapper').forEach(w => { w.classList.remove('eng-first'); w.querySelector('.opt-eng').classList.remove('active'); w.querySelector('.opt-kor').classList.add('active'); });
            stopNativeAudio(); renderListItems(); 
            
            // 💡 [핵심 수정1] 리스트 창 자체의 스크롤을 맨 위로 고정
            const listWrapper = document.getElementById(type + '-list-wrapper');
            if (listWrapper) listWrapper.scrollTop = 0;
            window.scrollTo({top: 0, behavior: 'smooth'}); 
        }




        function hideList(type) {
            stopNativeAudio(); 
            const btn = document.getElementById('btn-play-learn');
            if (btn) { btn.innerText = "🎧"; btn.style.background = "#f1f3f5"; btn.style.color = "#495057"; }
            document.getElementById(type + '-list-container').style.display = 'none';
            document.querySelectorAll(`#view-${type} .stats-table-wrapper`).forEach(el => el.style.display = 'block');
            document.querySelectorAll(`#view-${type} .schedule-info-box`).forEach(el => el.style.display = 'flex');
        }

        function toggleListLang() { 
            isListEngFirst = !isListEngFirst; 
            document.querySelectorAll('.lang-toggle-wrapper').forEach(w => {
                if(isListEngFirst) { w.classList.add('eng-first'); w.querySelector('.opt-eng').classList.add('active'); w.querySelector('.opt-kor').classList.remove('active'); }
                else { w.classList.remove('eng-first'); w.querySelector('.opt-eng').classList.remove('active'); w.querySelector('.opt-kor').classList.add('active'); }
            });
            renderListItems(); 
        }

        function renderListItems() {
            const list = globalTempLists[currentListIdx];
            const wrapper = document.getElementById(currentListType + '-list-wrapper');
            wrapper.innerHTML = '';

            list.forEach((card, index) => {
                let item = document.createElement('div'); 
                item.className = 'jub-item';
                item.style.cursor = 'pointer';
                // 💡 카드 전체 영역 클릭 시 문장 전체 재생
                item.onclick = (e) => playSingleListCard(index, e);

                let html = '<div class="jub-item-text" style="flex:1; padding-right:10px;">';
                
                // 💡 청크가 있으면 청크마다 개별 클릭(playListChunk)이 먹히도록 이벤트 장착
                let displayedEngHtml = "";
                if (card.chunks && Array.isArray(card.chunks) && card.chunks.length > 0 && card.eng === card.originalEng) {
                    displayedEngHtml = card.chunks.map((c, cIdx) => 
                        `<span class="list-chunk-span" onclick="playListChunk(${index}, ${cIdx}, event)" style="padding:2px 4px; border-radius:4px; cursor:pointer; transition:background .15s;" onmouseover="this.style.background='#e7f5ff'" onmouseout="this.style.background='transparent'" title="이 구절만 듣기">${c.text}</span>`
                    ).join(" ");
                } else {
                    displayedEngHtml = card.eng;
                }

               if(isListEngFirst) {
                    html += `<div class="eng text-green">${displayedEngHtml}</div>`;
                    // 💡 스타일 태그 대신 새로 만든 전용 클래스를 입혀줍니다.
                    if(card.ipa) html += `<div class="list-ipa-text">${card.ipa}</div>`;
                    html += `<div class="kor text-gray" style="margin-top:6px;">${card.kor}</div>`;
                } else {
                    html += `<div class="kor text-green" style="font-size:16px;">${card.kor}</div>`;
                    html += `<div class="eng text-gray" style="margin-top:6px;">${displayedEngHtml}</div>`;
                    // 💡 스타일 태그 대신 새로 만든 전용 클래스를 입혀줍니다.
                    if(card.ipa) html += `<div class="list-ipa-text">${card.ipa}</div>`;
                }
                
                const memoKey = card.ch + "_" + card.eng;
                const memoText = userDB.cardMemos && userDB.cardMemos[memoKey] ? userDB.cardMemos[memoKey] : "";
                if (memoText) {
                    html += `<div style="font-size:12px; color:#1864ab; background:#e7f5ff; padding:6px 10px; border-radius:6px; margin-top:8px; display:inline-block;"><i class="fas fa-info-circle"></i> ${memoText}</div>`;
                }

                html += `<div style="font-size:11px; color:#adb5bd; margin-top:6px;"><b>${card.badge}</b></div></div>`;
                
                html += `<div class="item-actions" onclick="event.stopPropagation()">`; // 버튼 영역 클릭 시 카드 전체 재생 이벤트 전파 차단
                html += `<button class="btn-icon-action ${memoText ? 'has-memo' : ''}" data-kor="${card.kor.replace(/"/g, '&quot;')}" onclick="openContextModal('${card.ch}', '${card.eng.replace(/'/g, "\\'")}', this.dataset.kor, event)"><i class="fas fa-info-circle"></i></button>`;
                
                if(currentListType === 'basket' && card.jubId) {
                    html += `<button class="btn-icon-action" onclick="openEditJubFromList('${card.jubId}', event)"><i class="fas fa-pencil-alt"></i></button>`;
                    html += `<button class="btn-remove-jub" onclick="removeJubById('${card.jubId}', event)"><i class="fas fa-trash-can"></i></button>`;
                }
                html += `</div>`;

                item.innerHTML = html; 
                wrapper.appendChild(item);
            });
        }

        // =========================================================================
        // 7. 리스트 연속 재생 및 자동학습
        // =========================================================================
        function setSpeed(speed, e) {
            if(e) e.stopPropagation(); currentAudioSpeed = speed;
            document.querySelectorAll('.speed-btn').forEach(btn => { btn.classList.remove('active'); if (parseFloat(btn.innerText.replace('x', '')) === speed) btn.classList.add('active'); });
            const player = document.getElementById('native-audio-player'); if (player && !player.paused) player.playbackRate = currentAudioSpeed;
        }

        function playAllInList(type) {
            if (type === 'basket') return;
            const btn = document.getElementById('btn-play-learn');
            if (isPlayingAll) { isPlayingAll = false; stopNativeAudio(); if(btn) { btn.innerText = "🎧"; btn.style.background = "#f1f3f5"; btn.style.color = "#495057"; } return; }
            playAllList = globalTempLists[currentListIdx];
            if (!playAllList || playAllList.length === 0) return alert("재생할 문장이 없습니다!");
            document.getElementById('listen-config-modal').classList.add('active');
        }

        function closeListenConfigModal() { document.getElementById('listen-config-modal').classList.remove('active'); }
        function setListenMode(mode) {
            selectedListenMode = mode;
            const btnListen = document.getElementById('mode-btn-listen'); const btnShadow = document.getElementById('mode-btn-shadow');
            if (mode === 'listen') { btnListen.style.borderColor = '#4dabf7'; btnListen.style.background = '#e7f5ff'; btnListen.style.color = '#1d4ed8'; btnShadow.style.borderColor = '#e9ecef'; btnShadow.style.background = '#f8f9fa'; btnShadow.style.color = '#495057'; } 
            else { btnShadow.style.borderColor = '#4dabf7'; btnShadow.style.background = '#e7f5ff'; btnShadow.style.color = '#1d4ed8'; btnListen.style.borderColor = '#e9ecef'; btnListen.style.background = '#f8f9fa'; btnListen.style.color = '#495057'; }
        }
        function setConfigSpeed(speed) {
            configPlaySpeed = speed;
            document.querySelectorAll('#config-speed-group .speed-btn').forEach(btn => { btn.style.background = '#f1f3f5'; btn.style.color = '#495057'; btn.style.fontWeight = '700'; if (parseFloat(btn.innerText.replace('x', '')) === speed) { btn.style.background = '#e7f5ff'; btn.style.color = '#339af0'; btn.style.fontWeight = '800'; } });
        }
        function setConfigRepeat(count) {
            currentRepeatLimit = count;
            document.querySelectorAll('#config-repeat-group .repeat-btn').forEach((btn, idx) => { let btnVal = idx + 1; btn.style.background = '#f1f3f5'; btn.style.color = '#495057'; btn.style.fontWeight = '700'; if (btnVal === count) { btn.style.background = '#e7f5ff'; btn.style.color = '#339af0'; btn.style.fontWeight = '800'; } });
        }
        function startConfiguredPlayAll() {
            closeListenConfigModal(); currentAudioSpeed = configPlaySpeed; currentRepeatCurrent = 0; playAllIndex = 0; isPlayingAll = true;
            const btn = document.getElementById('btn-play-learn'); if(btn) { btn.innerText = "⏹️"; btn.style.background = "#ffe3e3"; btn.style.color = "#e03131"; }
            playNextInList();
        }

        function playNextInList() {
            if(!isPlayingAll) return;
            const btn = document.getElementById('btn-play-learn'); const player = document.getElementById('native-audio-player');
            
            if(playAllIndex >= playAllList.length) {
                if (selectedListenMode === 'listen') { 
                    currentRepeatCurrent++; 
                    if (currentRepeatCurrent < currentRepeatLimit) { 
                        playAllIndex = 0; 
                        
                        // 💡 [핵심 수정3] 2회차 반복 시작 직전에 리스트 스크롤 최상단 복귀!
                        const activeWrapper = document.querySelector('.view-section.active .list-wrapper');
                        if (activeWrapper) activeWrapper.scrollTo({ top: 0, behavior: 'smooth' });
                        
                        playAllTimer = setTimeout(playNextInList, 1000); 
                        return; 
                    } 
                }
                isPlayingAll = false; if (player) player.ontimeupdate = null;
                if(btn) { btn.innerText = "🎧"; btn.style.background = "#f1f3f5"; btn.style.color = "#495057"; } return;
            }
            
            let card = playAllList[playAllIndex];
            const listWrapper = document.getElementById('learn-list-wrapper'); const items = listWrapper.children;
            
            const highlightItem = (idx) => {
                if (items[idx]) {
                    const wrapper = items[idx].closest('.list-wrapper');
                    if (wrapper) {
                        if (idx === 0) wrapper.scrollTo({ top: 0, behavior: 'smooth' });
                        else {
                            const itemRect = items[idx].getBoundingClientRect(); const wrapperRect = wrapper.getBoundingClientRect();
                            const targetScrollTop = wrapper.scrollTop + (itemRect.top - wrapperRect.top) - 95;
                            wrapper.scrollTo({ top: Math.max(0, targetScrollTop), behavior: 'smooth' });
                        }
                    }
                    Array.from(items).forEach(el => { el.style.border = "1px solid #e9ecef"; el.style.boxShadow = "none"; });
                    items[idx].style.border = "2px solid #4dabf7"; items[idx].style.boxShadow = "0 4px 12px rgba(77,171,247,0.2)";
                }
            };
            highlightItem(playAllIndex);

            if (card.audio && card.end > card.start) {
                const isFullList = currentListTitle.endsWith('전체'); const isMsOrRc = card.badge && !card.badge.includes('UE') && (card.badge.startsWith('MS') || card.badge.startsWith('RC'));
                if (selectedListenMode === 'listen' && isFullList && isMsOrRc) {
                    let blockEndIndex = playAllIndex;
                    while (blockEndIndex + 1 < playAllList.length && playAllList[blockEndIndex + 1].badge === card.badge && playAllList[blockEndIndex + 1].audio === card.audio && playAllList[blockEndIndex + 1].start >= playAllList[blockEndIndex].start) { blockEndIndex++; }
                    const startSec = card.start; const endSec = playAllList[blockEndIndex].end;
                    const startContinuousPlay = () => {
                        player.playbackRate = currentAudioSpeed; player.currentTime = startSec;
                        player.ontimeupdate = () => {
                            if (!isPlayingAll || selectedListenMode !== 'listen') { player.ontimeupdate = null; return; }
                            const curTime = player.currentTime;
                            for (let i = playAllIndex; i <= blockEndIndex; i++) {
                                if (curTime >= playAllList[i].start && curTime <= playAllList[i].end) { if (playAllIndex !== i) { playAllIndex = i; highlightItem(playAllIndex); } break; }
                            }
                            if (curTime >= endSec) { player.ontimeupdate = null; player.pause(); playAllIndex = blockEndIndex + 1; playAllTimer = setTimeout(playNextInList, 800); }
                        };
                        player.play().catch(() => { player.ontimeupdate = null; playTTSForList(card.eng); });
                    };
                    if (!player.src.endsWith(encodeURI(card.audio))) { player.src = card.audio; player.load(); player.oncanplay = () => { player.oncanplay = null; startContinuousPlay(); }; } else { startContinuousPlay(); }
                    return; 
                }
                player.ontimeupdate = null; 
                const startSegmentPlay = () => {
                    player.playbackRate = currentAudioSpeed; player.currentTime = card.start;
                    const durationMs = ((card.end - card.start) * 1000) / currentAudioSpeed;
                    const playPromise = player.play();
                    if (playPromise !== undefined) { playPromise.then(() => { playAllTimer = setTimeout(() => { player.pause(); handleRepetitionOrShadowing(durationMs); }, durationMs); }).catch(() => { playTTSForList(card.eng); }); }
                };
                if (!player.src.endsWith(encodeURI(card.audio))) { player.src = card.audio; player.load(); player.oncanplay = () => { player.oncanplay = null; startSegmentPlay(); }; } else { startSegmentPlay(); }
            } else { playTTSForList(card.eng); }
        }

        function handleRepetitionOrShadowing(audioDurationMs) {
            if (selectedListenMode === 'listen') { playAllIndex++; playAllTimer = setTimeout(playNextInList, 800); } 
            else {
                currentRepeatCurrent++; let delayTime = audioDurationMs + 3000; 
                if (currentRepeatCurrent < currentRepeatLimit) { playAllTimer = setTimeout(playNextInList, delayTime); } 
                else { currentRepeatCurrent = 0; playAllIndex++; playAllTimer = setTimeout(playNextInList, delayTime); }
            }
        }

        function playTTSForList(text) {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel(); const utter = new SpeechSynthesisUtterance(text); utter.lang = 'en-US'; utter.rate = currentAudioSpeed * 0.95;
                utter.onend = () => { 
                    if(!isPlayingAll) return; 
                    if (selectedListenMode === 'listen') { playAllIndex++; playAllTimer = setTimeout(playNextInList, 800); } 
                    else {
                        currentRepeatCurrent++; let extraDelay = 3800; 
                        if (currentRepeatCurrent < currentRepeatLimit) { playAllTimer = setTimeout(() => { playTTSForList(text); }, extraDelay); } 
                        else { currentRepeatCurrent = 0; playAllIndex++; playAllTimer = setTimeout(playNextInList, extraDelay); }
                    }
                };
                window.speechSynthesis.speak(utter);
            }
        }


	// 🎧 리스트 내 특정 청크만 골라서 재생하는 함수
        function playListChunk(cardIndex, chunkIdx, e) {
            if (e) e.stopPropagation(); // 💡 청크를 눌렀을 때 문장 전체 재생(부모 카드 click)이 동시에 실행되는 것 방지
            stopNativeAudio();
            
            const card = globalTempLists[currentListIdx][cardIndex];
            if (!card || !card.chunks || !card.chunks[chunkIdx]) return;
            
            const chunk = card.chunks[chunkIdx];
            if (card.audio && chunk.e > chunk.s) {
                const player = document.getElementById('native-audio-player');
                const startChunkPlay = () => {
                    player.playbackRate = currentAudioSpeed; 
                    player.currentTime = chunk.s; 
                    const durationMs = ((chunk.e - chunk.s) * 1000) / currentAudioSpeed;
                    
                    const playPromise = player.play();
                    if (playPromise !== undefined) { 
                        playPromise.then(() => { 
                            if (audioTimer) clearTimeout(audioTimer); 
                            audioTimer = setTimeout(() => { player.pause(); }, durationMs); 
                        }).catch(() => { 
                            playFallbackTTS(chunk.text); 
                        }); 
                    }
                };
                
                if (!player.src.endsWith(encodeURI(card.audio))) { 
                    player.src = card.audio; 
                    player.load(); 
                    player.oncanplay = () => { player.oncanplay = null; startChunkPlay(); }; 
                } else { 
                    startChunkPlay(); 
                }
            } else { 
                playFallbackTTS(chunk.text); 
            }
        }


        function toggleAutoPlayMode() {
            if (isRequiredMissionSession) { showAutoPlayNotice('🎯 미션 중에는 자동학습을 사용할 수 없습니다.'); return; }
            if (!isAutoPlayActive) { chooseAutoSpeed(autoThinkRatio); document.getElementById('auto-settings-modal').classList.add('active'); return; }
            isAutoPlayActive = false; autoPlayGeneration++;
            stopAutoPlayTimer(); stopNativeAudio(); updateAutoPlayAccess();
            showAutoPlayNotice('⏸ 자동학습을 종료했습니다.'); showCard();
        }

        function showAutoPlayNotice(msg) {
            let existing = document.getElementById('autoplay-toast-popup'); if (existing) existing.remove();
            const toast = document.createElement('div'); toast.id = 'autoplay-toast-popup';
            toast.style.cssText = "position:fixed; top:20%; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.85); color:white; padding:16px 24px; border-radius:14px; font-weight:800; font-size:16px; z-index:10000; box-shadow:0 6px 20px rgba(0,0,0,0.2); transition:opacity 0.3s;";
            toast.innerText = msg; document.body.appendChild(toast);
            setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 1700);
        }

        function stopAutoPlayTimer() { if (autoPlayTimer) { clearTimeout(autoPlayTimer); autoPlayTimer = null; } }

        // 💡 [신규 도우미 함수] 변형된 문장이라도 원래 원본 문장의 오디오 길이를 찾아내는 함수
        function getOriginalAudioDuration(chStr, originalEng) {
            if (typeof studyData === 'undefined' || !studyData[chStr]) return 0;
            const d = studyData[chStr];
            let allCards = [];
            if (d.mystory && Array.isArray(d.mystory.sentences)) allCards.push(...d.mystory.sentences);
            if (d.useful_mystory && Array.isArray(d.useful_mystory.sentences)) allCards.push(...d.useful_mystory.sentences);
            if (d.realconvo && Array.isArray(d.realconvo.chat)) allCards.push(...d.realconvo.chat);
            if (d.useful_realconvo && Array.isArray(d.useful_realconvo.sentences)) allCards.push(...d.useful_realconvo.sentences);
            
            const cleanOrig = (originalEng || "").replace(/\s+/g, " ").trim();
            for (let item of allCards) {
                if (item.type === "note") continue;
                let engText = item.chunks && Array.isArray(item.chunks) ? item.chunks.map(c => c.text).join(" ") : (item.text || "");
                if (engText.replace(/\s+/g, " ").trim() === cleanOrig) {
                    if (item.end > item.start) return (item.end - item.start);
                }
            }
            return 0;
        }

        // =========================================================================
        // 8. 툭탁 학습 엔진 (일일 미션 & 버닝모드 + 꼬부기 순정 녹음 시스템)
        // =========================================================================
        let orderedDeck = []; // 💡 랜덤 복원용 원본 덱 보관
        let isRandomMode = false;

        // 미션 완료 표시와 무관하게 실제 한국 날짜와 해당 미션의 예정 날짜를 비교한다.
        // 어제 미션 보기 모드로 입장한 경우에는 지난 미션이므로 자동학습을 허용한다.
        function isActualTodayMission(chStr, dayLabel) {
            if (typeof isYesterdayMissionMode !== 'undefined' && isYesterdayMissionMode) return false;
            const dayOffset = taskOffsets[dayLabel];
            if (dayOffset === undefined) return false;
            const chapterNum = Number(chStr);
            if (!Number.isInteger(chapterNum) || chapterNum < 1 || chapterNum > 12) return false;
            const now = getKSTDate();
            const start = new Date('2026-10-26T12:00:00');
            start.setHours(0, 0, 0, 0);
            const today = new Date(now);
            today.setHours(0, 0, 0, 0);
            if (today < start || now.getDay() === 0 || now.getDay() === 6) return false;
            let elapsedWeekdays = 0;
            for (const d = new Date(start); d < today; d.setDate(d.getDate() + 1)) {
                if (d.getDay() !== 0 && d.getDay() !== 6) elapsedWeekdays++;
            }
            const missionIndex = (chapterNum - 1) * 2 + dayOffset;
            return missionIndex === elapsedWeekdays;
        }

        function startTuktakDaily(chStr, dayLabel) {
            if (typeof studyData === 'undefined') return alert("⚠️ data.js 파일이 없습니다!");
            
            let useDay2FallbackForDay4 = false;

            // 💡 4일차 진입 시 2일차 완료 여부를 확인하여 미완료 시 2일차 카드를 띄워줌
            if (dayLabel === "4일차") {
                const day2TaskId = `CH${chStr}-2일차`;
                const isDay2Completed = userDB.completedTasks[day2TaskId] !== undefined && userDB.completedTasks[day2TaskId] !== false;
                
                if (!isDay2Completed) {
                    alert("💡 2일차 학습이 완료되지 않아, 4일차 미션에서 2일차 카드(UE 줍줍)를 먼저 띄워드립니다.");
                    useDay2FallbackForDay4 = true;
                }
            }

            const chData = studyData[chStr]; let deck = [];

            if (dayLabel === "1일차" || dayLabel === "3일차" || dayLabel === "5일차") {
                if (chData) {
                    if (chData.mystory) deck.push(...extractCards(chData.mystory.sentences, `MS ${chStr}`, chData.mystory.audio, chStr));
                    if (chData.realconvo) deck.push(...extractCards(chData.realconvo.chat, `RC ${chStr}`, chData.realconvo.audio, chStr));
                }
            } 
            if (dayLabel === "2일차" || useDay2FallbackForDay4) {
                if (chData) {
                    if (chData.useful_mystory) deck.push(...extractCards(chData.useful_mystory.sentences, `MS UE ${chStr}`, chData.useful_mystory.audio, chStr));
                    if (chData.useful_realconvo) deck.push(...extractCards(chData.useful_realconvo.sentences, `RC UE ${chStr}`, chData.useful_realconvo.audio, chStr));
                }
            } 
            if ((dayLabel === "4일차" && !useDay2FallbackForDay4) || dayLabel === "5일차") {
                const myJubs = userDB.jubs.filter(j => j.ch === chStr);
                if (dayLabel === "4일차" && myJubs.length === 0) return alert(`장바구니에 담아둔 문장이 없습니다!`);
                const jubCards = myJubs.map(j => ({ kor: j.kor, eng: j.eng, chunks: [], ipa: j.ipa || "", audio: j.audio || "", start: j.start || 0, end: j.end || 0, originalEng: j.originalEng, badge: j.section, ch: chStr }));
                deck.push(...jubCards);
            }

            if (deck.length === 0) return alert("학습할 카드가 없습니다.");
            
            currentTaskId = `CH${chStr}-${dayLabel}`;
            isRequiredMissionSession = isActualTodayMission(chStr, dayLabel); 
            currentChStr = chStr; 
            currentDeck = deck;
            orderedDeck = [];

            const progressKey = "progress_" + currentTaskId;
            currentCardIndex = 0; 
            maxReachedIndex = 0;
            uePromptHandled.clear();

            isRandomMode = false;
            const btnRandom = document.getElementById('btn-random-play');
            if(btnRandom) btnRandom.classList.remove('active');

            if (!userDB.completedTasks[currentTaskId] && userDB[progressKey] !== undefined) {
                let savedIdx = userDB[progressKey];
                if (savedIdx > 0 && savedIdx < deck.length) {
                    if (confirm(`이전에 학습하던 지점이 있습니다 (${savedIdx + 1}번째 문장부터 이어하시겠습니까?)`)) {
                        currentCardIndex = savedIdx; 
                        maxReachedIndex = savedIdx;
                    } else {
                        currentCardIndex = 0; 
                        maxReachedIndex = 0;
                    }
                } else {
                    maxReachedIndex = savedIdx || 0;
                }
            }

            launchTuktakView();
        }


	// 💡 팝업창에서 패스 처리
        function uePromptPass() {
            document.getElementById('ue-prompt-modal').classList.remove('active');
            advanceToNextCard();
        }

        function startBurningMode() {
            const list = globalTempLists[currentListIdx];
            if(!list || list.length === 0) return;
            
            currentTaskId = null;
            isRequiredMissionSession = false;
            currentChStr = list[0].ch; 
            currentDeck = list;
            orderedDeck = [];
            
            isRandomMode = false;
            const btnRandom = document.getElementById('btn-random-play');
            if(btnRandom) btnRandom.classList.remove('active');

            maxReachedIndex = 0; 
            currentCardIndex = 0;
            
            // 💡 [핵심 추가] 버닝모드 진입 시 정답을 무조건 가린 상태(초기화)로 강제 설정
            isAnswerRevealed = false;
            isTuktakMemoMode = false; // 메모 모드도 초기화
            
            // 토글 UI가 있다면 스크립트 모드로 원상복구
            const wrapper = document.getElementById('tuktak-mode-toggle');
            if (wrapper) {
                wrapper.classList.remove('memo-mode');
                const optScript = wrapper.querySelector('.opt-script');
                const optMemo = wrapper.querySelector('.opt-memo');
                if (optScript) optScript.classList.add('active');
                if (optMemo) optMemo.classList.remove('active');
            }

            launchTuktakView();
        }

        // 💡 [신규] 랜덤 모드 토글 함수
        function toggleRandomMode() {
            isRandomMode = !isRandomMode;
            const btn = document.getElementById('btn-random-play');
            
            if (isRandomMode) {
                if (btn) btn.classList.add('active');
                if (orderedDeck.length === 0) orderedDeck = [...currentDeck]; 
                
                // 💡 [핵심 수정4] 덱을 완벽하게 섞고, 화면에 섞였다는 알림을 띄워줌
                let shuffled = [...orderedDeck];
                for (let i = shuffled.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
                }
                currentDeck = shuffled;
                showAutoPlayNotice("🔀 카드를 무작위로 학습합니다.");
            } else {
                if (btn) btn.classList.remove('active');
                if (orderedDeck.length > 0) currentDeck = [...orderedDeck];
                showAutoPlayNotice("➡️ 카드를 순서대로 학습합니다.");
            }
            
            currentCardIndex = 0; maxReachedIndex = 0;
            if (currentTaskId) { userDB["progress_" + currentTaskId] = 0; saveDB(); }
            showCard();
        }

        // 모바일에서는 사용자 제스처가 있는 녹음 버튼에서 마이크를 요청한다.
        async function warmupMicrophone() { return; }

        function toggleTuktakViewMode() {
            isTuktakMemoMode = !isTuktakMemoMode;
            const wrapper = document.getElementById('tuktak-mode-toggle');
            const optScript = wrapper.querySelector('.opt-script');
            const optMemo = wrapper.querySelector('.opt-memo');
            if (isTuktakMemoMode) { wrapper.classList.add('memo-mode'); optScript.classList.remove('active'); optMemo.classList.add('active'); } 
            else { wrapper.classList.remove('memo-mode'); optMemo.classList.remove('active'); optScript.classList.add('active'); }
            showCard();
        }

        function launchTuktakView() {
            stopNativeAudio();
            
            document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
            document.getElementById('view-tuktak').classList.add('active');
            document.body.classList.add('tuktak-mode');

            const bottomControls = document.getElementById('bottom-app-controls');
            if (bottomControls) bottomControls.style.display = 'none';
            const pdfBtn = document.getElementById('pdf-download-btn');
            if (pdfBtn) pdfBtn.style.display = 'none';

            // 🔥 [핵심 원인 제거] 툭탁 모드에 들어갈 때는 무조건 화면 맨 위(top: 0)로 강제 스크롤!
            window.scrollTo({ top: 0, behavior: 'instant' });

            if (isRequiredMissionSession) { isAutoPlayActive = false; autoPlayGeneration++; stopAutoPlayTimer(); }
            updateAutoPlayAccess();
            // 모바일: 화면 진입 시 마이크 권한을 요청하지 않음 (사용자 녹음 버튼에서만 요청)
            showCard();
        }


        // 🎯 툭탁 단계: record → score → UE(2일차만) → review
        let ueChoicePending = false;
        let uePromptHandled = new Set();
        function isUeDay2() {
            const card = currentDeck[currentCardIndex];
            return !!(currentTaskId && currentTaskId.includes('2일차') && card && card.badge.includes('UE'));
        }
        function showCardStep(step) {
            ['action-speak','score-controls','user-record-controls'].forEach(id => {
                document.getElementById(id).style.display = 'none';
            });
            const target = { record:'action-speak', score:'score-controls', review:'user-record-controls' }[step];
            if (target) document.getElementById(target).style.display = step === 'review' ? 'flex' : 'flex';
            document.getElementById('card-nav-buttons').style.display = (step === 'review' || step === 'score') ? 'flex' : 'none';
        }
        function showReviewStep() {
            isAnswerRevealed = true;
            document.getElementById('eng-half').classList.add('revealed');
            document.getElementById('eng-half').onclick = null;
            showCardStep('review'); updateJubButtonState();
        }
        function selectCardScore(status) {
            const card = currentDeck[currentCardIndex], key = card.ch + '_' + card.eng;
            userDB.cardStats[key] = status;
            if (currentTaskId) {
                maxReachedIndex = Math.max(maxReachedIndex, currentCardIndex + 1);
                userDB['progress_' + currentTaskId] = maxReachedIndex;
            }
            saveDB();
            const badge = document.getElementById('tuktak-status');
            badge.style.display = 'block'; badge.innerText = status;
            const colors = { '술술':['#d3f9d8','#2b8a3e'], '버벅':['#fff3bf','#f59f00'], '막힘':['#ffe3e3','#e03131'] };
            [badge.style.background,badge.style.color] = colors[status];
            showReviewStep();
        }
        function showCard() {
            stopNativeAudio(); stopAutoPlayTimer(); ueChoicePending = false;
            showCardStep('record');
            if (currentCardIndex >= currentDeck.length) { finishTuktak(); return; }

            const card = currentDeck[currentCardIndex];
            const cardKey = card.ch + "_" + card.eng; 

            document.getElementById('tuktak-badge').innerText = card.badge;
            document.getElementById('tuktak-counter').innerText = `${currentCardIndex + 1} / ${currentDeck.length}`;

            const korEl = document.getElementById('tuktak-kor');
            if (isTuktakMemoMode) {
                const savedMemo = userDB.cardMemos && userDB.cardMemos[cardKey] ? userDB.cardMemos[cardKey] : "";
                if (savedMemo) korEl.innerHTML = `<span style="color:#495057; font-size:22px; font-weight:700; line-height:1.45; display:block; text-align:center;">${savedMemo}</span>`;
                else korEl.innerText = card.kor;
            } else { korEl.innerText = card.kor; }
            
            const engContainer = document.getElementById('tuktak-eng');
            engContainer.innerHTML = '';
            
            if (card.chunks && card.chunks.length > 0 && card.eng === card.originalEng) {
                card.chunks.forEach((c, idx) => {
                    let span = document.createElement('span'); span.className = 'chunk-span'; span.innerText = c.text + " ";
                    span.onclick = (e) => playChunk(idx, e);
                    engContainer.appendChild(span);
                });
            } else { engContainer.innerText = card.eng; }
            
            const ipaEl = document.getElementById('tuktak-ipa');
            if (card.ipa) { ipaEl.innerHTML = `🎧 ${card.ipa}`; } else { ipaEl.innerHTML = `🎧 음성 듣기`; }
            ipaEl.style.display = 'inline-block';
            
            // 💡 성취도 배지: 술술 / 버벅 / 막힘 / 미평가 (줍줍 패스는 성취도가 아님)
            const prevStatus = userDB.cardStats[cardKey];
            const statusBadge = document.getElementById('tuktak-status');
            const statusColors = {
                '술술': ['#d3f9d8', '#2b8a3e'], '버벅': ['#fff3bf', '#f59f00'],
                '막힘': ['#ffe3e3', '#e03131'], '미평가': ['#e9ecef', '#868e96']
            };
            const status = ['술술', '버벅', '막힘'].includes(prevStatus) ? prevStatus : '미평가';
            statusBadge.style.display = 'block'; statusBadge.innerText = status;
            [statusBadge.style.background, statusBadge.style.color] = statusColors[status];

            if (sessionAudioCache[cardKey]) {
                userAudioUrl = sessionAudioCache[cardKey];
                const player = document.getElementById('user-audio-player');
                if (player) player.src = userAudioUrl;
            } else {
                userAudioUrl = null;
            }

            let isPastCard = currentCardIndex < maxReachedIndex;

            // 💡 [수정됨] 과거 평가 기록과 상관없이, '이번 미션/학습 세션에서 이미 푼 카드'만 열어둡니다.
            if (isPastCard) {
                isAnswerRevealed = true;
                document.getElementById('eng-half').classList.add('revealed');
                document.getElementById('eng-half').onclick = null;
                
                document.getElementById('action-speak').style.display = 'none';
                document.getElementById('user-record-controls').style.display = 'flex';
                document.getElementById('card-nav-buttons').style.display = 'flex';
            } else {
                isAnswerRevealed = false;
                document.getElementById('eng-half').classList.remove('revealed');
                document.getElementById('eng-half').onclick = revealAnswerWithoutRecording;
                
                const btnSpeak = document.getElementById('btn-speak-record');
                btnSpeak.innerHTML = '🎤 녹음 시작하기'; btnSpeak.style.background = '#5ba4ff'; btnSpeak.onclick = startRecording;

                document.getElementById('action-speak').style.display = 'flex'; 
                document.getElementById('user-record-controls').style.display = 'none';
                document.getElementById('card-nav-buttons').style.display = 'none';
            }

            showCardStep(isPastCard ? 'review' : 'record');
            const speedControls = document.getElementById('card-speed-controls');
            if (speedControls) {
                if (card.eng !== card.originalEng || !card.audio) speedControls.style.display = 'none';
                else speedControls.style.display = 'flex';
            }
            
            updateJubButtonState();
        }

        function revealAnswerWithoutRecording(e) {
            if (isAnswerRevealed) return;
            isAnswerRevealed = true;
            document.getElementById('eng-half').classList.add('revealed');
            document.getElementById('eng-half').onclick = null;
            if (!isAutoPlayActive) showCardStep('score');
            if (currentTaskId) {
                maxReachedIndex = Math.max(maxReachedIndex, currentCardIndex + 1);
                userDB['progress_' + currentTaskId] = maxReachedIndex;
                saveDB();
            }
        }

        function showAutoPlayNotice(msg) {
            let existing = document.getElementById('autoplay-toast-popup'); if (existing) existing.remove();
            const toast = document.createElement('div'); toast.id = 'autoplay-toast-popup';
            toast.style.cssText = "position:fixed; top:20%; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.85); color:white; padding:16px 24px; border-radius:14px; font-weight:800; font-size:16px; z-index:10000; box-shadow:0 6px 20px rgba(0,0,0,0.2); transition:opacity 0.3s;";
            toast.innerText = msg; document.body.appendChild(toast);
            setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 1700);
        }

        function stopAutoPlayTimer() { if (autoPlayTimer) { clearTimeout(autoPlayTimer); autoPlayTimer = null; } }

        // 🤖 자동학습: 녹음/성취도/미션 진도를 변경하지 않는 자유복습 전용 루프
        let isRequiredMissionSession = false; // 오늘 날짜의 미션은 완료 여부와 무관하게 자동학습 제한
        let autoThinkRatio = 1.5;
        let autoPlayGeneration = 0;
        function chooseAutoSpeed(value) {
            autoThinkRatio = Number(value);
            document.querySelectorAll('.auto-speed-choice').forEach(btn => btn.classList.toggle('selected', Number(btn.dataset.speed) === autoThinkRatio));
        }
        function closeAutoSettings() { document.getElementById('auto-settings-modal').classList.remove('active'); }
        function startAutoStudy() {
            closeAutoSettings();
            if (isRequiredMissionSession || isAutoPlayActive || !currentDeck.length) return;
            isAutoPlayActive = true; autoPlayGeneration++;
            stopAutoPlayTimer(); stopNativeAudio(); updateAutoPlayAccess();
            showAutoPlayNotice('🤖 자동학습을 시작합니다.'); runAutoPlayCycle();
        }
        function setAutoThinkRatio(value) {
            autoThinkRatio = Number(value);
            if (isAutoPlayActive) { autoPlayGeneration++; stopAutoPlayTimer(); stopNativeAudio(); runAutoPlayCycle(); }
        }
        function updateAutoPlayAccess() {
            const btn = document.getElementById('btn-auto-play');
            const setting = document.getElementById('auto-think-ratio');
            const mission = isRequiredMissionSession;
            if (mission && isAutoPlayActive) { isAutoPlayActive = false; autoPlayGeneration++; stopAutoPlayTimer(); stopNativeAudio(); }
            if (btn) { btn.disabled = mission; btn.classList.toggle('active', isAutoPlayActive); btn.style.opacity = mission ? '0.35' : '1'; btn.style.cursor = mission ? 'not-allowed' : 'pointer'; btn.title = mission ? '일일 미션에서는 자동학습을 사용할 수 없습니다.' : '자동학습 모드'; }
            if (setting) { setting.disabled = mission; setting.style.opacity = mission ? '0.35' : '1'; }
        }
        function runAutoPlayCycle() {
            if (!isAutoPlayActive || isRequiredMissionSession) return;
            stopAutoPlayTimer(); stopNativeAudio();
            if (currentCardIndex >= currentDeck.length) { isAutoPlayActive = false; updateAutoPlayAccess(); showAutoPlayNotice('🤖 자동학습을 완료했습니다.'); return; }
            const generation = ++autoPlayGeneration;
            const card = currentDeck[currentCardIndex];
            if (!card) return;
            isAnswerRevealed = false;
            const engHalf = document.getElementById('eng-half');
            engHalf.classList.remove('revealed'); engHalf.onclick = null;
            ['action-speak','score-controls','user-record-controls','card-nav-buttons'].forEach(id => document.getElementById(id).style.display = 'none');
            const originalDuration = getOriginalAudioDuration(card.ch, card.originalEng);
            const audioDuration = (card.audio && card.end > card.start && card.eng === card.originalEng) ? card.end - card.start : (originalDuration || Math.max(2, (card.eng || '').split(/\s+/).length / 2.5));
            const thinkSeconds = Math.min(24, Math.max(5, audioDuration * autoThinkRatio + 2));
            const isCurrent = () => isAutoPlayActive && !isRequiredMissionSession && generation === autoPlayGeneration;
            autoPlayTimer = setTimeout(() => {
                if (!isCurrent()) return;
                isAnswerRevealed = true; engHalf.classList.add('revealed');
                playNativeAudio();
                const audioMs = audioDuration * 1000 / Math.max(0.2, currentAudioSpeed);
                autoPlayTimer = setTimeout(() => {
                    if (!isCurrent()) return;
                    stopNativeAudio();
                    if (currentCardIndex + 1 >= currentDeck.length) {
                        isAutoPlayActive = false; updateAutoPlayAccess(); showAutoPlayNotice('🤖 자동학습을 완료했습니다.');
                        showCard();
                    } else {
                        currentCardIndex++; showCard(); runAutoPlayCycle();
                    }
                }, audioMs + 3000);
            }, thinkSeconds * 1000);
        }

        // 🎤 모바일 녹음: Koboogy의 MediaRecorder 기본 흐름 + 독립 세션 + WAV 백업
        // 모든 녹음은 별도 MediaStream을 사용하여 모바일 재녹음 시 입력 세션 꼬임을 방지합니다.
        let recordingBusy = false;
        let recorderFinalizing = false;
        let recordingSessionId = 0;
        let recordingStartedAt = 0;
        let activeRecordingStream = null;
        let wavBackup = null;

        // Safari에서 MediaRecorder가 비어 있는 Blob을 주는 경우에 대비한 무손실 PCM 백업
        function beginWavBackup(stream, context) {
            if (!context) return null;
            try {
                const source = context.createMediaStreamSource(stream);
                const processor = context.createScriptProcessor(4096, 1, 1);
                const buffers = [];
                let sampleCount = 0;
                processor.onaudioprocess = (e) => {
                    const input = e.inputBuffer.getChannelData(0);
                    buffers.push(new Float32Array(input));
                    sampleCount += input.length;
                    e.outputBuffer.getChannelData(0).fill(0); // 스피커에는 출력하지 않음
                };
                source.connect(processor);
                processor.connect(context.destination); // iOS 오디오 프로세싱 유지
                return { context, source, processor, buffers, getSampleCount: () => sampleCount };
            } catch (err) {
                console.warn('WAV 백업 활성화 실패:', err);
                context.close().catch(() => {});
                return null;
            }
        }

        function finishWavBackup(backup) {
            if (!backup) return null;
            try {
                backup.processor.onaudioprocess = null;
                backup.source.disconnect();
                backup.processor.disconnect();
                const frames = backup.getSampleCount();
                if (!frames) return null;
                const rate = backup.context.sampleRate;
                const buffer = new ArrayBuffer(44 + frames * 2);
                const view = new DataView(buffer);
                const put = (p, str) => { for (let i = 0; i < str.length; i++) view.setUint8(p+i,str.charCodeAt(i)); };
                put(0,'RIFF'); view.setUint32(4,36+frames*2,true); put(8,'WAVE');
                put(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true);
                view.setUint16(22,1,true); view.setUint32(24,rate,true);
                view.setUint32(28,rate*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true);
                put(36,'data'); view.setUint32(40,frames*2,true);
                let offset = 44;
                for (const chunk of backup.buffers) {
                    for (let i = 0; i < chunk.length; i++) {
                        const val = Math.max(-1,Math.min(1,chunk[i]));
                        view.setInt16(offset,val < 0 ? val*0x8000 : val*0x7fff,true);
                        offset += 2;
                    }
                }
                return new Blob([buffer], {type:'audio/wav'});
            } catch (err) {
                console.warn('WAV 백업 생성 실패:',err);
                return null;
            } finally {
                backup.context.close().catch(() => {});
            }
        }

        function closeActiveRecordingStream() {
            if (activeRecordingStream) {
                activeRecordingStream.getTracks().forEach(track => track.stop());
                activeRecordingStream = null;
            }
        }

        function resetRecordingButton() {
            const btn = document.getElementById('btn-speak-record');
            if (!btn) return;
            btn.innerText = '🎤 녹음 시작하기';
            btn.style.background = '#5ba4ff';
            btn.onclick = startRecording;
            btn.disabled = false;
        }

        async function startRecording() {
            if (recordingBusy || recorderFinalizing || (mediaRecorder && mediaRecorder.state !== 'inactive')) return;
            const btn = document.getElementById('btn-speak-record');
            const lockedCardIndex = currentCardIndex;
            const card = currentDeck[lockedCardIndex];
            if (!card || !btn) return;
            const sessionId = ++recordingSessionId;
            recordingBusy = true;
            btn.disabled = true;
            btn.innerText = '⏳ 마이크 연결 중...';

            // 마이크를 열기 전에 기존 원어민/내 음성 재생을 정리합니다.
            stopNativeAudio();
            const oldPlayer = document.getElementById('user-audio-player');
            if (oldPlayer) { oldPlayer.pause(); oldPlayer.removeAttribute('src'); oldPlayer.load(); }

            // iOS는 사용자 터치 핸들러 안에서 AudioContext를 생성하는 것이 안정적입니다.
            let backupContext = null;
            try {
                const Ctx = window.AudioContext || window.webkitAudioContext;
                if (Ctx) { backupContext = new Ctx(); backupContext.resume().catch(() => {}); }
                if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
                    throw new Error('SECURE_CONTEXT_OR_UNSUPPORTED');

                // 재녹음마다 새 스트림을 확보. Safari에서 오래 재사용된 입력 스트림을 회피합니다.
                closeActiveRecordingStream();
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                if (sessionId !== recordingSessionId || currentCardIndex !== lockedCardIndex ||
                    !document.getElementById('view-tuktak').classList.contains('active')) {
                    stream.getTracks().forEach(t => t.stop());
                    if (backupContext) backupContext.close().catch(() => {});
                    recordingBusy = false;
                    return;
                }
                activeRecordingStream = stream;
                // Koboogy와 동일하게 브라우저 기본 MIME + start() 사용
                const recorder = new MediaRecorder(stream);
                const chunks = [];
                mediaRecorder = recorder;
                audioChunks = chunks;
                wavBackup = beginWavBackup(stream, backupContext);
                if (!wavBackup && backupContext) backupContext.close().catch(() => {});
                if (wavBackup && wavBackup.context.state === 'suspended') wavBackup.context.resume().catch(() => {});

                recorder.ondataavailable = (e) => {
                    if (e.data && e.data.size > 0) chunks.push(e.data);
                };
                recorder.onstart = () => {
                    if (sessionId !== recordingSessionId || mediaRecorder !== recorder) return;
                    recordingStartedAt = Date.now();
                    btn.innerText = '🛑 녹음 중지';
                    btn.style.background = '#fa5252';
                    btn.onclick = stopRecording;
                    btn.disabled = false;
                    recordingBusy = false;
                };
                recorder.onerror = (e) => {
                    console.error('MediaRecorder 오류:', e.error || e);
                    // 오류 뒤에도 onstop에서 WAV 백업을 우선 확인하도록 유지
                };
                recorder.onstop = () => {
                    // MediaRecorder ondataavailable 이후 데이터를 수집합니다.
                    const nativeType = chunks[0]?.type || recorder.mimeType || 'audio/mp4';
                    const nativeBlob = new Blob(chunks, {type:nativeType});
                    const backupState = wavBackup?.context?.state || '미지원';
                    const backupBlob = finishWavBackup(wavBackup);
                    wavBackup = null;
                    closeActiveRecordingStream();
                    if (mediaRecorder === recorder) mediaRecorder = null;
                    recorderFinalizing = false;
                    recordingBusy = false;
                    if (sessionId !== recordingSessionId) return;
                    resetRecordingButton();

                    // 기본 녹음이 비었다면 PCM -> WAV로 저장하고 정상 루트로 진입합니다.
                    const recovered = nativeBlob.size === 0 && backupBlob && backupBlob.size > 44;
                    const blob = nativeBlob.size ? nativeBlob : (recovered ? backupBlob : null);
                    console.info('모바일 녹음 진단', {
                        nativeBytes:nativeBlob.size, wavBytes:backupBlob?.size || 0,
                        usedWavBackup:!!recovered, durationMs:Date.now()-recordingStartedAt,
                        audioType:blob?.type || 'none'
                    });
                    if (!blob) {
                        alert(`녹음 데이터를 받지 못했습니다.\n진단: 기본 ${nativeBlob.size}B / 백업 ${backupBlob?.size || 0}B / 오디오 ${backupState}\n이 메시지를 알려주시면 원인을 더 좁힐 수 있습니다.`);
                        return;
                    }
                    const key = card.ch + '_' + card.eng;
                    if (sessionAudioCache[key]?.startsWith('blob:')) URL.revokeObjectURL(sessionAudioCache[key]);
                    sessionAudioCache[key] = URL.createObjectURL(blob);
                    if (currentCardIndex !== lockedCardIndex || isAutoPlayActive) return;
                    userAudioUrl = sessionAudioCache[key];
                    const player = document.getElementById('user-audio-player');
                    player.pause(); player.src = userAudioUrl; player.load();
                    isAnswerRevealed = true;
                    document.getElementById('eng-half').classList.add('revealed');
                    document.getElementById('eng-half').onclick = null;
                    showCardStep('score');
                };
                recorder.start();
                btn.innerText = '⏳ 녹음 시작 중...';
            } catch (err) {
                console.error('녹음 시작 오류:',err);
                if (backupContext && !wavBackup) backupContext.close().catch(() => {});
                if (wavBackup) { finishWavBackup(wavBackup); wavBackup=null; }
                closeActiveRecordingStream();
                mediaRecorder = null;
                recordingBusy = false;
                recorderFinalizing = false;
                if (sessionId !== recordingSessionId) return;
                const msg = err.name === 'NotAllowedError' ? '마이크 권한이 거부되었습니다. 브라우저에서 허용해 주세요.' :
                    err.name === 'NotFoundError' ? '사용 가능한 마이크가 없습니다.' :
                    err.message === 'SECURE_CONTEXT_OR_UNSUPPORTED' ? 'HTTPS 주소에서 Safari/Chrome으로 열어 주세요.' :
                    '녹음 시작에 실패했습니다. 마이크 연결을 확인해 주세요.';
                alert(msg);
                resetRecordingButton();
            }
        }

        function stopRecording() {
            if (!mediaRecorder || mediaRecorder.state !== 'recording' || recorderFinalizing) return;
            if (Date.now() - recordingStartedAt < 500) {
                alert('녹음을 시작한 뒤 조금 더 말하고 중지해 주세요.');
                return;
            }
            recorderFinalizing = true;
            const btn = document.getElementById('btn-speak-record');
            if (btn) { btn.disabled = true; btn.innerText = '⏳ 녹음 저장 중...'; }
            try { mediaRecorder.stop(); }
            catch (err) {
                console.error('녹음 종료 오류:',err);
                recorderFinalizing = false;
                if (wavBackup) { finishWavBackup(wavBackup); wavBackup=null; }
                closeActiveRecordingStream();
                mediaRecorder = null;
                recordingBusy = false;
                resetRecordingButton();
            }
        }

        async function playUserAudio() {
            stopNativeAudio();
            const player = document.getElementById('user-audio-player');
            if (!userAudioUrl) { alert('이 카드의 녹음이 없습니다. 재녹음해 주세요.'); return; }
            try { player.pause(); player.src = userAudioUrl; player.volume = 1; player.currentTime = 0; await player.play(); }
            catch (e) { console.error('재생 오류:', e); alert('녹음 재생에 실패했습니다.'); }
        }
        function reRecord() {
            const player = document.getElementById('user-audio-player'); player.pause();
            const card = currentDeck[currentCardIndex], key = card.ch + '_' + card.eng;
            if (sessionAudioCache[key]?.startsWith('blob:')) URL.revokeObjectURL(sessionAudioCache[key]);
            delete sessionAudioCache[key]; userAudioUrl = null;
            isAnswerRevealed = true;
            document.getElementById('eng-half').classList.add('revealed');
            showCardStep('record');
            const btn = document.getElementById('btn-speak-record');
            btn.innerText = '🎤 녹음 시작하기'; btn.style.background = '#5ba4ff'; btn.disabled = false; btn.onclick = startRecording;
            startRecording();
        }

        function evalFromPopup(status) {
            document.getElementById('eval-popup-modal').classList.remove('active');
            selectCardScore(status);
        }

        function prevCard(e) {
            if (e) e.stopPropagation(); stopNativeAudio();
            if (currentCardIndex > 0) { 
                currentCardIndex--; 
                showCard(); 
            }
        }



        function advanceToNextCard() {
            uePromptHandled.add(`${currentTaskId}:${currentCardIndex}`);
            currentCardIndex++; showCard();
        }
        function nextCard(e) {
            if (e) e.stopPropagation(); stopNativeAudio();
            if (mediaRecorder && mediaRecorder.state === 'recording') return;
            if (isUeDay2() && !uePromptHandled.has(`${currentTaskId}:${currentCardIndex}`)) {
                document.getElementById('ue-prompt-modal').classList.add('active'); return;
            }
            advanceToNextCard();
        }

        function finishTuktak() {
            if (currentTaskId) { alert("🎉 일일 미션을 완료했습니다! 트래커에 'O' 표시로 기록됩니다."); userDB.completedTasks[currentTaskId] = new Date().toISOString(); delete userDB["progress_" + currentTaskId]; saveDB(); } 
            else { alert("🔥 버닝 모드 학습을 완료했습니다!"); }
            exitTuktak();
        }

        function exitTuktak() { 
            isRequiredMissionSession = false;
            stopNativeAudio(); isAutoPlayActive = false; autoPlayGeneration++; stopAutoPlayTimer(); updateAutoPlayAccess();
            recordingSessionId++;
            recorderFinalizing = false; recordingBusy = false;
            if (mediaRecorder) { try { mediaRecorder.onstop = null; if (mediaRecorder.state !== 'inactive') mediaRecorder.stop(); } catch (e) {} mediaRecorder = null; }
            if (wavBackup) { finishWavBackup(wavBackup); wavBackup = null; }
            closeActiveRecordingStream();
            const evalModal = document.getElementById('eval-popup-modal'); if (evalModal) evalModal.classList.remove('active');
            const btn = document.getElementById('btn-auto-play'); if (btn) btn.classList.remove('active');
            if (globalAudioStream) { globalAudioStream.getTracks().forEach(t => t.stop()); globalAudioStream = null; }
            Object.values(sessionAudioCache).forEach(url => { if (url?.startsWith('blob:')) URL.revokeObjectURL(url); });
            sessionAudioCache = {}; userAudioUrl = null; ueChoicePending = false;
            const bottomControls = document.getElementById('bottom-app-controls'); if (bottomControls) bottomControls.style.display = 'flex';
            const pdfBtn = document.getElementById('pdf-download-btn'); if (pdfBtn) pdfBtn.style.display = 'inline-block';
            const activeTabIdx = Array.from(document.querySelectorAll('.nav-tab')).findIndex(t => t.classList.contains('active'));
            if(activeTabIdx === 0) switchView('tracker'); else if(activeTabIdx === 1) switchView('learn'); else switchView('basket');
        }

        function updateJubButtonState() {
            const card = currentDeck[currentCardIndex];
            if(!card) return;
            // 💡 줍줍 변형 파생 개수 추적은 원본(originalEng) 사용 유지
            const count = userDB.jubs.filter(j => j.originalEng === card.originalEng).length;
            const badge = document.getElementById('jub-count-badge'); 
            if(badge) { badge.innerText = count; badge.style.background = count > 0 ? '#ff6b6b' : '#adb5bd'; }
            
            const memoKey = card.ch + "_" + card.eng; // 💡 eng로 변경
            const hasMemo = userDB.cardMemos && userDB.cardMemos[memoKey];
            const memoBtn = document.getElementById('btn-card-memo');
            if (memoBtn) { memoBtn.style.color = hasMemo ? '#339af0' : '#495057'; memoBtn.style.opacity = hasMemo ? '1' : '0.5'; }
        }



        // =========================================================================
        // 9. 오디오 제어 (원어민 / TTS / 단일 카드)
        // =========================================================================
        function playNativeAudio(e) {
            if(e) e.stopPropagation(); stopNativeAudio(); const card = currentDeck[currentCardIndex]; if (!card) return;
            const cleanEng = (card.eng || "").replace(/\s+/g, " ").trim(); const cleanOrig = (card.originalEng || "").replace(/\s+/g, " ").trim();
            if (cleanEng !== cleanOrig) { playFallbackTTS(card.eng); return; }
            if (card.audio && card.end > card.start) {
                const player = document.getElementById('native-audio-player');
                const startPlay = () => {
                    player.playbackRate = currentAudioSpeed; player.currentTime = card.start;
                    const durationMs = ((card.end - card.start) * 1000) / currentAudioSpeed;
                    const playPromise = player.play();
                    if (playPromise !== undefined) { playPromise.then(() => { if (audioTimer) clearTimeout(audioTimer); audioTimer = setTimeout(() => { player.pause(); }, durationMs); }).catch((err) => { playFallbackTTS(card.eng); }); }
                };
                if (!player.src.endsWith(encodeURI(card.audio))) { player.src = card.audio; player.load(); player.oncanplay = () => { player.oncanplay = null; startPlay(); }; player.onerror = () => { player.onerror = null; playFallbackTTS(card.eng); }; } else { startPlay(); }
            } else { playFallbackTTS(card.eng); }
        }

        function playChunk(idx, e) {
            if(e) e.stopPropagation(); stopNativeAudio(); const card = currentDeck[currentCardIndex]; if (!card || !card.chunks || !card.chunks[idx]) return;
            const chunk = card.chunks[idx];
            if (card.audio && chunk.e > chunk.s) {
                const player = document.getElementById('native-audio-player');
                const startChunkPlay = () => {
                    player.playbackRate = currentAudioSpeed; player.currentTime = chunk.s; const durationMs = ((chunk.e - chunk.s) * 1000) / currentAudioSpeed;
                    const playPromise = player.play();
                    if (playPromise !== undefined) { playPromise.then(() => { if (audioTimer) clearTimeout(audioTimer); audioTimer = setTimeout(() => { player.pause(); }, durationMs); }).catch(() => { playFallbackTTS(chunk.text); }); }
                };
                if (!player.src.endsWith(encodeURI(card.audio))) { player.src = card.audio; player.load(); player.oncanplay = () => { player.oncanplay = null; startChunkPlay(); }; } else { startChunkPlay(); }
            } else { playFallbackTTS(chunk.text); }
        }

        function stopNativeAudio() {
            const player = document.getElementById('native-audio-player'); const userPlayer = document.getElementById('user-audio-player');
            if (audioTimer) { clearTimeout(audioTimer); audioTimer = null; }
            if (playAllTimer) { clearTimeout(playAllTimer); playAllTimer = null; }
            if (player) { player.pause(); player.playbackRate = 1.0; player.oncanplay = null; player.ontimeupdate = null; }
            if (userPlayer) { userPlayer.pause(); }
            if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            isPlayingAll = false;
        }

        function playSingleListCard(index, e) {
            if (e) e.stopPropagation(); stopNativeAudio();
            const btn = document.getElementById('btn-play-learn');
            if (isPlayingAll && btn) { isPlayingAll = false; btn.innerText = "🎧"; btn.style.background = "#f1f3f5"; btn.style.color = "#495057"; }
            const card = globalTempLists[currentListIdx][index]; if (!card) return;
            const listWrapper = document.getElementById(currentListType + '-list-wrapper'); const items = listWrapper.children;
            Array.from(items).forEach(el => { el.style.border = "1px solid #e9ecef"; el.style.boxShadow = "none"; });
            if (items[index]) { items[index].style.border = "2px solid #4dabf7"; items[index].style.boxShadow = "0 4px 12px rgba(77,171,247,0.2)"; }
            const isModified = (card.originalEng && card.originalEng !== card.eng);
            if (card.audio && card.end > card.start) {
                const player = document.getElementById('native-audio-player'); if (!player.src.endsWith(encodeURI(card.audio))) player.src = card.audio;
                player.playbackRate = currentAudioSpeed; player.currentTime = card.start; const durationMs = ((card.end - card.start) * 1000) / currentAudioSpeed;
                const playPromise = player.play();
                if (playPromise !== undefined) { playPromise.then(() => { audioTimer = setTimeout(() => { player.pause(); }, durationMs); }).catch(() => { if (!(currentListType === 'basket' && isModified)) { playFallbackTTS(card.eng); } }); }
            } else { if (currentListType === 'basket' && isModified) { return; } playFallbackTTS(card.eng); }
        }

        // =========================================================================
        // 10. 장바구니 줍줍 및 컨텍스트 메모 수정
        // =========================================================================
        function openEditModal(e) {
            if(e) e.stopPropagation(); editingJubId = null; const card = currentDeck[currentCardIndex];
            document.getElementById('edit-modal-title').innerText = "🧺 장바구니 담기 (변형)"; document.getElementById('btn-save-jub').innerText = "[장바구니 담기]";
            document.getElementById('edit-kor').value = document.getElementById('tuktak-kor').innerText; document.getElementById('edit-eng').value = document.getElementById('tuktak-eng').innerText; document.getElementById('edit-ipa').value = ""; document.getElementById('edit-ipa').dataset.initialIpa = "";
            const existing = userDB.jubs.filter(j => j.originalEng === card.originalEng); const container = document.getElementById('existing-jubs-list');
            if (existing.length > 0) {
                let html = '<hr style="border:0; border-top:1px dashed #dee2e6; margin:14px 0;"><div style="font-weight:800; font-size:13px; color:#495057; margin-bottom:8px;">💡 이전에 담아둔 문장들</div>';
                existing.forEach(j => { html += `<div style="background:#f1f3f5; border-radius:8px; padding:10px; margin-bottom:6px;"><div style="color:#2b8a3e; font-weight:700; font-size:14px;">${j.eng}</div><div style="color:#868e96; font-size:12px; margin-top:4px;">${j.kor}</div></div>`; });
                container.innerHTML = html;
            } else { container.innerHTML = ''; }
            document.getElementById('jub-generation-status').textContent = '한글 번역은 외부 번역 서비스에 영어 문장이 전송됩니다.'; document.getElementById('btn-generate-jub').textContent = '✨ 한글 / IPA 자동 생성'; document.getElementById('edit-modal').classList.add('active');
        }

        function openEditJubFromList(id, e) {
            if(e) e.stopPropagation(); const jub = userDB.jubs.find(j => j.id === id); if(!jub) return;
            editingJubId = id; document.getElementById('edit-modal-title').innerText = "✏️ 줍줍 문장 수정"; document.getElementById('btn-save-jub').innerText = "[수정 완료]";
            document.getElementById('edit-kor').value = jub.kor; document.getElementById('edit-eng').value = jub.eng; document.getElementById('edit-ipa').value = jub.ipa || ""; document.getElementById('edit-ipa').dataset.initialIpa = jub.ipa || "";
            document.getElementById('existing-jubs-list').innerHTML = ''; document.getElementById('jub-generation-status').textContent = '한글 번역은 외부 번역 서비스에 영어 문장이 전송됩니다.'; document.getElementById('btn-generate-jub').textContent = '✨ 한글 / IPA 자동 생성'; document.getElementById('edit-modal').classList.add('active');
        }

        function markJubGeneratedStale() {
            const status = document.getElementById('jub-generation-status');
            if (status) status.textContent = '영어 문장을 수정했다면 다시 자동 생성해 주세요.';
        }
        // 공개 MyMemory 번역 서비스: 네트워크/CORS/사용량 제한 시 수동 입력 유지.
        async function generateJubDetails() {
            const eng = document.getElementById('edit-eng').value.trim();
            if (!eng) { alert('영어 문장을 먼저 입력해 주세요.'); return; }
            const btn = document.getElementById('btn-generate-jub');
            const status = document.getElementById('jub-generation-status');
            btn.disabled = true; btn.textContent = '⏳ 생성 중...';
            let translated = false, ipaOK = false;
            try {
                const ipa = await getCambridgeUSIPA(eng);
                document.getElementById('edit-ipa').value = ipa;
                document.getElementById('edit-ipa').dataset.initialIpa = ipa;
                ipaOK = !!ipa;
                // MyMemory 무료 공개 서비스에 문장이 전송되므로 비공개 정보 입력은 피하도록 안내.
                const url = 'https://api.mymemory.translated.net/get?langpair=en|ko&q=' + encodeURIComponent(eng);
                const response = await fetch(url, {signal:AbortSignal.timeout(10000)});
                if (!response.ok) throw Error('번역 요청 실패: ' + response.status);
                const data = await response.json();
                const result = (data.responseData?.translatedText || '').trim();
                if (!result || Number(data.responseStatus) >= 400 || /MYMEMORY WARNING/i.test(result)) throw Error('번역 결과를 받을 수 없습니다.');
                // 기본 한글이 이미 있더라도 버튼을 명시적으로 눌렀으므로 번역 결과로 채움.
                document.getElementById('edit-kor').value = result;
                translated = true;
            } catch (err) { console.warn('한글/IPA 자동 생성:', err); }
            finally {
                status.textContent = (translated ? '✅ 한글 생성' : '⚠️ 한글 번역 실패 · 직접 입력해 주세요') + ' / ' + (ipaOK ? '✅ IPA 생성' : '⚠️ IPA 미확인 · 직접 입력해 주세요');
                btn.disabled = false; btn.textContent = '✨ 한글 / IPA 다시 생성';
            }
        }
        function closeEditModal() { document.getElementById('edit-modal').classList.remove('active'); ueChoicePending = false; }

        // CMU Pronouncing Dictionary (미국식 단어 발음 기반, 다의어·연음은 문맥 검토 필요)
        // 미국식 발음사전은 ipa-dictionary.js 에서 로드합니다.
        

        // 💡 변형문장 IPA는 오프라인 미국식 발음사전 기반. 직접 입력한 IPA 우선 적용.
        async function saveEditedJub() {
            const newKor = document.getElementById('edit-kor').value.trim();
            const newEng = document.getElementById('edit-eng').value.replace(/\s+/g, ' ').trim();
            const ipaInput = document.getElementById('edit-ipa');
            const typedIpa = ipaInput.value.trim();
            const manualIpa = !!typedIpa;
            if (!newKor || !newEng) { alert('한글과 영어를 모두 입력해주세요.'); return; }
            const btn = document.getElementById('btn-save-jub'), oldText = btn.innerText;
            btn.disabled = true; btn.innerText = '발음기호 확인 중...';
            let missingIpa = false;
            try {
                if (editingJubId) {
                    const jub = userDB.jubs.find(j => j.id === editingJubId);
                    if (!jub) return;
                    const changed = jub.eng.replace(/\s+/g, ' ').trim() !== newEng;
                    const ipa = manualIpa ? typedIpa : (changed ? await getCambridgeUSIPA(newEng) : typedIpa || jub.ipa || '');
                    missingIpa = !ipa;
                    jub.kor = newKor; jub.eng = newEng; jub.ipa = ipa;
                    if (changed) {
                        if (!jub.section.includes('(변형)')) jub.section += ' (변형)';
                        jub.audio = ''; jub.start = 0; jub.end = 0;
                    }
                    const list = globalTempLists[currentListIdx] || [];
                    const temp = list.find(c => c.jubId === editingJubId);
                    if (temp) Object.assign(temp, { kor:newKor, eng:newEng, ipa, badge:jub.section, audio:jub.audio, start:jub.start, end:jub.end });
                    saveDB(); closeEditModal(); renderListItems(); renderBasketTable();
                } else {
                    const card = currentDeck[currentCardIndex];
                    const original = card.originalEng.replace(/\s+/g, ' ').trim();
                    const changed = original !== newEng;
                    const ipa = manualIpa ? typedIpa : (changed ? await getCambridgeUSIPA(newEng) : card.ipa || '');
                    missingIpa = !ipa;
                    userDB.jubs.push({ id:Date.now().toString(), ch:currentChStr, baseType:card.baseType || 'Unknown',
                        section:card.badge + (changed ? ' (변형)' : ''), kor:newKor, eng:newEng, ipa,
                        audio:changed ? '' : card.audio || '', start:changed ? 0 : card.start || 0,
                        end:changed ? 0 : card.end || 0, originalEng:original });
                    const goNext = ueChoicePending;
                    saveDB(); closeEditModal(); updateJubButtonState();
                    if (goNext) advanceToNextCard();
                }
                if (missingIpa) alert('문장은 저장했지만 발음사전에서 확인되지 않는 단어가 있어 IPA는 비워뒀어요. 필요하면 직접 입력해 주세요.');
            } catch (err) { console.error('줍줍 저장 오류:', err); alert('저장 중 오류가 발생했습니다. 다시 시도해 주세요.'); }
            finally { btn.innerText = oldText; btn.disabled = false; }
        }

        // 💡 CMU 미국식 단어 발음 사전 기반. 미등록 단어가 있으면 잘못된 IPA 대신 빈칸 반환.
        async function getCambridgeUSIPA(sentence) {
            if (/[\u3131-\uD79D]/.test(sentence) || /\d/.test(sentence)) return '';
            const words = (sentence.toLowerCase().match(/[a-z]+(?:['’][a-z]+)*/g) || []).map(w => w.replace('’', "'"));
            if (!words.length) return '';
            const pronunciations = words.map(word => CMU_US_IPA[word]);
            if (pronunciations.some(p => !p)) return '';
            return '/' + pronunciations.join(' ') + '/';
        }

        function removeJubById(id, e) {
            if(e) e.stopPropagation();
            if(confirm("이 문장을 삭제할까요?")) {
                let idx = userDB.jubs.findIndex(j => j.id === id);
                if(idx > -1) { userDB.jubs.splice(idx, 1); saveDB(); renderBasketTable(); hideList('basket'); }
            }
        }

        function openContextModalFromCard(e) {
            if(e) e.stopPropagation();
            const card = currentDeck[currentCardIndex];
            if(!card) return;
            // 💡 eng로 변경 전달
            openContextModal(card.ch, card.eng, card.kor, e);
        }

        function openContextModal(ch, engText, korText, e) {
            if (korText && korText.stopPropagation) {
                e = korText;
                korText = engText; 
            }
            if(e) e.stopPropagation();
            currentMemoKey = ch + "_" + engText; // 💡 engText 사용
            if(!userDB.cardMemos) userDB.cardMemos = {};
            
            const scriptBox = document.getElementById('context-modal-script');
            if (scriptBox) scriptBox.innerText = korText || engText;

            document.getElementById('context-memo-input').value = userDB.cardMemos[currentMemoKey] || "";
            document.getElementById('context-modal').classList.add('active');
        }

        function closeContextModal() { document.getElementById('context-modal').classList.remove('active'); }
        function saveContextMemo() {
            if(!userDB.cardMemos) userDB.cardMemos = {}; const val = document.getElementById('context-memo-input').value.trim();
            if(val) { userDB.cardMemos[currentMemoKey] = val; } else { delete userDB.cardMemos[currentMemoKey]; }
            saveDB(); closeContextModal();
            if(document.getElementById('view-tuktak').classList.contains('active')) { updateJubButtonState(); } else { renderListItems(); }
        }

        // =========================================================================
        // 11. 유틸리티 (PDF 내보내기 및 UE 프롬프트)
        // =========================================================================
        function uePromptYes() {
            const card = currentDeck[currentCardIndex];
            const exists = userDB.jubs.some(j => j.ch === card.ch && j.originalEng === card.originalEng && j.eng === card.originalEng);
            if (!exists) userDB.jubs.push({ id: Date.now().toString(), ch: currentChStr, baseType: card.baseType || 'Unknown', section: card.badge, kor: card.kor, eng: card.originalEng, ipa: card.ipa || '', audio: card.audio || '', start: card.start || 0, end: card.end || 0, originalEng: card.originalEng });
            saveDB(); document.getElementById('ue-prompt-modal').classList.remove('active'); advanceToNextCard();
        }
        function uePromptModify() {
            document.getElementById('ue-prompt-modal').classList.remove('active');
            ueChoicePending = true; openEditModal();
        }

        // 📄 [최종] 헤더 고정 및 하단 중앙 페이지 번호가 포함된 A4 2열 문서 오픈 함수
        function downloadJubsAsA4PDF() {
            if (!userDB.jubs || userDB.jubs.length === 0) {
                alert("다운로드할 줍줍 문장이 없습니다!");
                return;
            }

            const titleText = document.getElementById('basket-list-title').innerText || "나만의 줍줍 문장";
            
            // 줍줍 데이터 기반 2열 테이블 행 생성
            let tableRowsHtml = "";
            userDB.jubs.forEach((item, idx) => {
                // 💡 해당 문장의 상황 메모 찾기
                const memoKey = item.ch + "_" + item.eng;
                const memoText = userDB.cardMemos && userDB.cardMemos[memoKey] ? userDB.cardMemos[memoKey] : "";
                
                let memoHtml = "";
                if (memoText) {
                    memoHtml = `<div class="memo-text">ℹ️ ${memoText}</div>`;
                }

                tableRowsHtml += `
                    <tr>
                        <td class="num-col">${idx + 1}</td>
                        <td class="eng-col">
                            <div class="eng-text">${item.eng || ""}</div>
                            ${item.ipa ? `<div class="ipa-text">${item.ipa}</div>` : ""}
                            <div class="source-text">[출처: ${item.section || 'MS'}]</div>
                        </td>
                        <td class="kor-col">
                            <div class="kor-text">${item.kor || ""}</div>
                            ${memoHtml}
                        </td>
                    </tr>
                `;
            });

            // A4 규격 2열 문서 HTML 생성 (헤더 고정 및 페이지 번호 CSS 추가)
            const htmlContent = `
                <!DOCTYPE html>
                <html lang="ko">
                <head>
                    <meta charset="UTF-8">
                    <title>Stack Up - ${titleText}</title>
                    <style>
                        /* 📄 A4 페이지 설정 및 하단 중앙 페이지 번호 */
                        @page {
                            size: A4;
                            margin: 20mm;
                            @bottom-center {
                                content: counter(page);
                                font-size: 13px;
                                color: #64748b;
                                font-family: 'Pretendard', -apple-system, sans-serif;
                            }
                        }

                        body { font-family: 'Pretendard', -apple-system, sans-serif; padding: 20px; color: #212529; max-width: 900px; margin: 0 auto; background: #fff; }
                        h1 { font-size: 22px; border-bottom: 2px solid #339af0; padding-bottom: 10px; margin-bottom: 20px; color: #1e293b; }
                        
                        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                        th, td { border: 1px solid #cbd5e1; padding: 12px 14px; vertical-align: middle; }
                        
                        /* 📌 테이블 헤더 고정 및 페이지 넘김 시 반복 설정 */
                        thead { display: table-header-group; }
                        th { 
                            position: sticky; 
                            top: 0; 
                            background: #f8f9fa; 
                            font-size: 13px; 
                            color: #495057; 
                            text-align: center; 
                            z-index: 10; 
                        }

                        .num-col { width: 40px; text-align: center; font-weight: bold; color: #64748b; font-size: 13px; background: #f8f9fa; }
                        .eng-col { width: 50%; }
                        .kor-col { width: 45%; }
                        .kor-text { font-weight: 700; color: #2b8a3e; font-size: 15px; }
                        .eng-text { font-weight: 700; color: #1e293b; font-size: 15px; margin-bottom: 4px; }
                        .ipa-text { color: #64748b; font-size: 13px; margin-bottom: 4px; font-style: italic; }
                        .memo-text { color: #64748b; font-size: 13px; margin-top: 6px; font-style: italic; font-weight: 400; line-height: 1.4; }
                        .source-text { color: #adb5bd; font-size: 11px; }
                        
                        tr { page-break-inside: avoid; break-inside: avoid; }
                    </style>
                </head>
                <body>
                    <h1>📄 Stack Up - ${titleText}</h1>
                    <table>
                        <thead>
                            <tr>
                                <th>No</th>
                                <th>🇺🇸 영어 / 발음기호</th>
                                <th>🇰🇷 한글 뜻 / 📝 메모</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRowsHtml}
                        </tbody>
                    </table>
                    <script>
                        window.onload = function() {
                            setTimeout(() => { window.print(); }, 300);
                        }
                    <\/script>
                </body>
                </html>
            `;

            // 새 창을 열어서 문서를 렌더링하고 인쇄/PDF 대화상자 호출
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(htmlContent);
                printWindow.document.close();
            } else {
                alert("팝업 차단이 설정되어 있어 창을 열 수 없습니다. 브라우저의 팝업 차단을 해제해 주세요.");
            }
        }
	
	// 📆 월~일 요일 기준의 진짜 달력 형태로 중첩 과제를 조망하는 함수
        function openScheduleModal() {
            const grid = document.getElementById('schedule-calendar-grid');
            
            // 1. 전체 미션 날짜 매핑 맵 생성 (날짜별로 과제들을 배열로 담음)
            let scheduleMap = {};
            let startDate = new Date("2026-10-26T12:00:00"); // 스터디 시작일 (월요일)

            for(let ch=1; ch<=12; ch++) {
                let chStr = ch < 10 ? '0'+ch : ''+ch;
                let chStartOffset = (ch - 1) * 2;

                Object.keys(taskOffsets).forEach(dayLabel => {
                    let reqDays = chStartOffset + taskOffsets[dayLabel];
                    let uiInfo = taskLabels[dayLabel];

                    let missionDate = new Date(startDate);
                    let addedDays = 0;
                    while (addedDays < reqDays) {
                        missionDate.setDate(missionDate.getDate() + 1);
                        if (missionDate.getDay() !== 0 && missionDate.getDay() !== 6) addedDays++;
                    }

                    // 날짜를 'MM/DD' 키로 변환
                    let dateKey = `${missionDate.getMonth()+1}/${missionDate.getDate()}`;
                    if (!scheduleMap[dateKey]) scheduleMap[dateKey] = [];
                    
                    scheduleMap[dateKey].push({
                        text: `[${uiInfo.name}] CH ${chStr}`,
                        rawDate: missionDate.getTime()
                    });
                });
            }

            // 2. 월~일 기준 테이블 HTML 구조 생성
            let html = '<table style="width:100%; border-collapse:collapse; text-align:left; font-size:12px; table-layout:fixed;">';
            html += '<tr style="background:#f8f9fa; color:#495057; font-weight:800; text-align:center;">' +
                    '<th style="padding:10px; border:1px solid #dee2e6;">월</th>' +
                    '<th style="padding:10px; border:1px solid #dee2e6;">화</th>' +
                    '<th style="padding:10px; border:1px solid #dee2e6;">수</th>' +
                    '<th style="padding:10px; border:1px solid #dee2e6;">목</th>' +
                    '<th style="padding:10px; border:1px solid #dee2e6;">금</th>' +
                    '<th style="padding:10px; border:1px solid #dee2e6; color:#fa5252;">토</th>' +
                    '<th style="padding:10px; border:1px solid #dee2e6; color:#fa5252;">일</th>' +
                    '</tr>';

            // 달력 시작일(10월 26일 월요일)부터 6주간(42일) 렌더링
            let drawDate = new Date("2026-10-26T12:00:00");

            for (let week = 0; week < 6; week++) {
                html += '<tr>';
                for (let day = 1; day <= 7; day++) {
                    let dateKey = `${drawDate.getMonth()+1}/${drawDate.getDate()}`;
                    let dayTasks = scheduleMap[dateKey] || [];
                    
                    let dayOfWeek = drawDate.getDay(); // 0:일, 6:토
                    let isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
                    let bg = isWeekend ? '#fbfbfc' : '#ffffff';
                    let dateColor = isWeekend ? '#fa5252' : '#495057';

                    // 중첩된 과제 배지 생성 (여러 개면 세로로 차곡차곡 쌓임)
                    let taskHtml = dayTasks.map(t => `
                        <div style="margin-top:3px; font-weight:700; color:#1d4ed8; background:#eef4ff; border:1px solid #d0e1fd; padding:3px 5px; border-radius:6px; font-size:11px; word-break:keep-all;">
                            ${t.text}
                        </div>
                    `).join('');

                    html += `<td style="border:1px solid #dee2e6; padding:6px; vertical-align:top; background:${bg}; height:105px;">
                        <div style="font-weight:800; color:${dateColor}; margin-bottom:4px; text-align:right; font-size:11px;">${dateKey}</div>
                        <div style="max-height:75px; overflow-y:auto;">${taskHtml}</div>
                    </td>`;

                    drawDate.setDate(drawDate.getDate() + 1);
                }
                html += '</tr>';
            }
            html += '</table>';

            grid.innerHTML = html;
            document.getElementById('schedule-modal').classList.add('active');
        }

        function closeScheduleModal() {
            document.getElementById('schedule-modal').classList.remove('active');
        }
