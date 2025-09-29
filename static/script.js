// ===================================================================
//              static/script.js (최종 완성본 - 모든 UI/로직 동기화)
// ===================================================================
document.addEventListener('DOMContentLoaded', () => {

    // ============ 0. 헬퍼 함수 (숫자 K/M 포맷팅) ============
    function nFormatter(num, digits) {
        if (!num) return '0'; 
        const si = [ { value: 1, symbol: "" }, { value: 1E3, symbol: "K" }, { value: 1E6, symbol: "M" }, { value:1E9, symbol: "B" }, { value: 1E12, symbol: "T" } ];
        const rx = /\.0+$|(\.[0-9]*[1-9])0+$/; let i;
        for (i = si.length - 1; i > 0; i--) { if (num >= si[i].value) { break; } }
        return (num / si[i].value).toFixed(digits).replace(rx, "$1") + si[i].symbol;
    }

    // ============ 0.5. 헬퍼 함수 (스크립트 정제) ============
    function cleanAndFormatTranscript(rawText) {
        if (!rawText) return '';
         // 1. 타임코드 ([00:12.345]) 및 괄호 내용 ((웃음)) 제거
        let cleanedText = rawText
          .replace(/\[\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?\]/g, '')
          .replace(/[\(\[].*?[\)\]]/g, '');

        // 2. 여러 공백을 하나로 만들고 앞뒤 공백 제거
        cleanedText = cleanedText.replace(/\s+/g, ' ').trim();
    
        // 3. 문장 끝(.?!)을 기준으로 줄바꿈 추가
        // 문장 끝 부호 뒤에 공백이 여러개 올 수 있으므로 \s* 추가
        return cleanedText.replace(/([.?!])\s*/g, '$1\n\n');
    }

    // ============ 1. 전역 변수 및 UI 요소 ============
    let currentResults = []; 
    let currentSort = { key: 'ratio', direction: 'desc' };
    let lastSearchParams = {}; 

    // --- UI 요소들 ---
    const startButton = document.getElementById('startButton');
    const searchInput = document.getElementById('searchInput');
    const resultsTableBody = document.getElementById('results-tbody'); 
    const initialMessage = document.getElementById('initial-message');
    const clearButton = document.getElementById('clearButton');
    const saveJobButton = document.getElementById('saveJobButton');
    const targetLanguage = document.getElementById('targetLanguage');
    const keywordRecommendationArea = document.getElementById('keyword-recommendation-area');
    const keywordChipsContainer = document.getElementById('keyword-chips-container');
    
    // --- '스크립트/AI' 모달 요소 ---
    const modalOverlay = document.getElementById('transcript-modal');
    const modalCloseXBtn = document.getElementById('modal-close-x-btn');
    const modalCloseActionBtn = document.getElementById('modal-close-action-btn');
    const modalVideoTitle = document.getElementById('modal-title');
    const modalTranscriptContent = document.getElementById('modal-transcript-text');
    const modalRunAiBtn = document.getElementById('modal-run-ai-btn');
    const modalAiSummaryContent = document.getElementById('ai-summary-content');
    // ▼▼▼ [수정] 영상 플레이어 컨테이너 변수 추가 ▼▼▼
    const modalVideoPlayerContainer = document.getElementById('modal-video-player-container');

    // --- 필터 요소 ---
    const searchModeKeyword = document.getElementById('searchKeyword');
    const searchModeChannel = document.getElementById('searchChannel');
    const videoLengthType = document.getElementById('videoLengthType');
    const uploadDays = document.getElementById('uploadDays');
    const regionCode = document.getElementById('regionCode');
    const sortOrder = document.getElementById('sortOrder'); 
    const minViewCount = document.getElementById('minViewCount');
    const vphToggle = document.getElementById('vphToggle');
    const minVPH = document.getElementById('minVPH');
    const maxResults = document.getElementById('maxResults');
    const excludeMadeForKids = document.getElementById('excludeMadeForKids');
    
    // AI 프롬프트 
     const DEFAULT_AI_PROMPT = `당신은 최고의 유튜브 영상 분석 전문가입니다. 
     다음 스크립트를 분석하여 아래의 두 가지 항목을 생성해주세요.
각 항목의 제목은 ### **1. 영상 요약**과 ### **2. 핵심 성공 포인트**와 같이, 
마크다운 H3(제목3) 스타일과 볼드체를 **반드시** 함께 사용하여 강조해주세요.

1.  **영상 요약**: 이 영상의 핵심 내용을 2~3 문장으로 요약합니다.
2.  **핵심 성공 포인트**: 이 영상이 시청자들에게 인기를 끌 수 있었던 이유(예: 도입부 후킹, 스토리텔링, 유용한 정보, CTA 등)를 3가지 주요 포인트로 나누어 구체적으로 설명합니다.`;


    // ============ 2. 이벤트 리스너 통합 관리 ============
    
    // --- 검색 관련 이벤트 ---
    startButton.addEventListener('click', () => startSearch(false, null));
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); 
            startSearch(false, null);
        }
    });

    // --- 언어/지역 자동 변경 이벤트 ---
    targetLanguage.addEventListener('change', () => {
        const selectedLang = targetLanguage.value;
        if (selectedLang === 'ko') { regionCode.value = 'KR'; } 
        else if (selectedLang === 'ja') { regionCode.value = 'JP'; }
        // 언어 변경 시 자동으로 검색을 다시 실행하지 않도록 수정. 사용자가 직접 Search를 눌러야 함.
    });

    // --- AI 추천 키워드 클릭 이벤트 ---
    keywordChipsContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('keyword-chip')) {
            const newKeyword = event.target.dataset.keyword;
            searchInput.value = newKeyword;
            startSearch(true, newKeyword);
        }
    });

    // --- 모달 닫기 이벤트 (수정됨) ---
    // ▼▼▼ [수정] closeTranscriptModal 함수를 호출하도록 변경 ▼▼▼
    if (modalCloseXBtn) { modalCloseXBtn.addEventListener('click', closeTranscriptModal); }
    if (modalCloseActionBtn) { modalCloseActionBtn.addEventListener('click', closeTranscriptModal); }
    
    // --- 기타 버튼 이벤트 ---
    clearButton.addEventListener('click', () => {
        initialMessage.innerHTML = '<p>분석할 조건을 설정하고 [Search] 버튼을 누르세요.</p>';
        initialMessage.style.display = 'block';
        resultsTableBody.innerHTML = '';
        searchInput.value = '';
        currentResults = []; 
        lastSearchParams = {}; 
        keywordRecommendationArea.style.display = 'none';
        keywordChipsContainer.innerHTML = '';
    });
    
    // --- 작업 저장 이벤트 리스너 ---
    saveJobButton.addEventListener('click', () => {
        if (Object.keys(lastSearchParams).length === 0 || !lastSearchParams.query) {
            alert('먼저 검색을 실행해주세요.'); return;
        }
        if (currentResults.length === 0) {
            alert('저장할 검색 결과가 없습니다.'); return;
        }
        const projectName = prompt('이 검색 작업을 어떤 이름으로 저장하시겠습니까?', lastSearchParams.query);
        if (projectName) {
            fetch('/api/project/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectName: projectName,
                    searchParams: lastSearchParams, 
                    searchResults: currentResults 
                })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) { alert(data.message); } 
                else {
                    if (data.error.includes('로그인')) { alert(data.error); window.location.href = '/login'; } 
                    else { alert('오류: ' + data.error); }
                }
            })
            .catch(err => { console.error('Save Project Error:', err); alert('프로젝트 저장 중 오류가 발생했습니다.'); });
        }
    });

    // --- 필터 변경 시 자동 재검색 이벤트 리스너 (모든 필터에 공통 적용) ---
    [sortOrder, videoLengthType, regionCode, uploadDays, minViewCount, vphToggle, minVPH, maxResults, excludeMadeForKids].forEach(filterElement => {
        if (filterElement) { // 요소가 존재하는지 확인
            filterElement.addEventListener('change', () => { 
                if (searchInput.value) { 
                    startSearch(false, null); 
                } 
            });
        }
    });

    // ============ 3. 핵심 함수들 ============

    function startSearch(isFromKeywordClick = false, translatedQuery = null) {
        const searchParams = {
            searchType: searchModeKeyword.checked ? 'keyword' : 'channel',
            query: translatedQuery || searchInput.value,
            videoLength: videoLengthType.value,
            period: uploadDays.value,
            region: regionCode.value,
            sortOrder: sortOrder.value,
            minViews: minViewCount.value,
            useVPH: vphToggle.checked,
            minVPH: minVPH.value,
            maxResults: maxResults.value,
            excludeKids: excludeMadeForKids.checked,
            language: targetLanguage.value
        };
        
        if (!isFromKeywordClick && searchParams.query) {
            getAndDisplayRelatedKeywords(searchInput.value, targetLanguage.value);
        }

        if (!searchParams.query) {
            alert("검색어 또는 채널 URL을 입력해주세요.");
            return;
        }

        console.log("백엔드로 전송할 검색 파라미터:", searchParams);
        initialMessage.innerHTML = `<p>데이터를 분석하는 중입니다... (API 호출 중)</p>`;
        initialMessage.style.display = 'block';
        resultsTableBody.innerHTML = '';
        lastSearchParams = searchParams;

        fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(searchParams),
        })
        .then(response => {
            if (!response.ok) {
                return response.text().then(text => {
                    try {
                        const errorData = JSON.parse(text);
                        throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
                    } catch {
                        throw new Error(`HTTP error! Status: ${response.status}. Response: ${text}`);
                    }
                });
            }
            return response.json();
        })
        .then(data => {
            currentResults = data.items;
            initialMessage.style.display = 'none';
            sortData('ratio', 'desc');
            renderTable();
            updateSortHeaders('ratio', 'desc');
        })
        .catch(error => {
            console.error('❌ 검색 에러:', error);
            initialMessage.innerHTML = `<p>데이터를 불러오는 데 실패했습니다. 오류: ${error.message}</p>`;
            initialMessage.style.display = 'block';
            currentResults = [];
        });
    }

    function getAndDisplayRelatedKeywords(query, lang) {
        keywordRecommendationArea.style.display = 'block';
        keywordChipsContainer.innerHTML = '<div class="loading-spinner"></div> AI가 연관 키워드를 분석 중입니다...';

        fetch('/api/get_related_keywords', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query, target_lang: lang }),
        })
        .then(res => {
            if (!res.ok) {
                 return res.text().then(text => {
                    try {
                        const errorData = JSON.parse(text);
                        throw new Error(errorData.error || `HTTP error! Status: ${res.status}`);
                    } catch {
                        throw new Error(`HTTP error! Status: ${res.status}. Response: ${text}`);
                    }
                });
            }
            return res.json();
        })
        .then(data => {
            if (data.success) {
                keywordChipsContainer.innerHTML = '';
                const keywordsToDisplay = data.data.keywords || [];

                if (Array.isArray(keywordsToDisplay) && keywordsToDisplay.length > 0) {
                    keywordsToDisplay.forEach(kw => {
                        const chip = document.createElement('button');
                        chip.className = 'keyword-chip';
                        if (typeof kw === 'object' && kw !== null && 'original' in kw) {
                            chip.dataset.keyword = kw.original;
                            if (lang === 'ko') {
                                chip.textContent = kw.original;
                            } else {
                                chip.textContent = `${kw.original} (${kw.korean || ''})`;
                            }
                        } else if (typeof kw === 'string') {
                            chip.textContent = kw;
                            chip.dataset.keyword = kw;
                        }
                        keywordChipsContainer.appendChild(chip);
                    });
                } else {
                    keywordChipsContainer.textContent = 'AI 키워드 추천 실패: 유효한 키워드 리스트를 찾을 수 없습니다.';
                }
                
                if (data.translated_query && searchInput.value !== data.translated_query && lang !== 'ko') {
                    console.log(`검색어를 '${searchInput.value}'에서 번역된 '${data.translated_query}'(으)로 변경하여 검색합니다.`);
                    startSearch(true, data.translated_query); 
                }
            } else {
                keywordChipsContainer.textContent = 'AI 키워드 추천 실패: ' + data.error;
            }
        })
        .catch(err => {
            console.error('AI Keyword Fetch Error:', err);
            keywordChipsContainer.textContent = 'AI 추천 서버 통신 실패: ' + err.message;
        });
    }
    
    // ============ 4. 클라이언트 사이드 정렬 기능 ============
    function sortAndRender(sortKey) {
        let direction = 'desc'; 
        if (currentSort.key === sortKey && currentSort.direction === 'desc') { direction = 'asc'; }
        sortData(sortKey, direction); renderTable(); updateSortHeaders(sortKey, direction); 
        currentSort = { key: sortKey, direction };
    }
    function sortData(key, direction) {
        const multiplier = (direction === 'asc') ? 1 : -1;
        currentResults.sort((a, b) => {
            let valA = a[key]; let valB = b[key];
            if (typeof valA === 'string') { return valA.localeCompare(valB) * multiplier; }
            return (valA - valB) * multiplier;
        });
    }
    document.querySelectorAll('th.sortable[data-sort-key]').forEach(header => {
        header.addEventListener('click', () => {
            const sortKey = header.getAttribute('data-sort-key');
            sortAndRender(sortKey);
        });
    });
    function updateSortHeaders(activeKey, direction) {
        document.querySelectorAll('th.sortable span').forEach(span => { span.textContent = ''; });
        const activeHeader = document.querySelector(`th[data-sort-key="${activeKey}"] span`);
        if (activeHeader) { activeHeader.textContent = (direction === 'asc') ? ' ▲' : ' ▼'; }
    }

    // ============ 5. 테이블 렌더링 (핵심: 줄 간격 문제 해결) ============
    function renderTable() {
        if (!currentResults || currentResults.length === 0) {
            initialMessage.innerHTML = '<p>검색 결과가 없거나, 모든 결과가 필터에 의해 제외되었습니다.</p>';
            initialMessage.style.display = 'block';
            resultsTableBody.innerHTML = '';
            return;
        }
        initialMessage.style.display = 'none';

        resultsTableBody.innerHTML = '';
        const fragment = document.createDocumentFragment();

        currentResults.forEach((video, index) => {
            const row = document.createElement('tr');
            row.id = `video-row-${video.videoId}`;
            const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
            const analysisButtonHTML = `<button class="btn-link btn-transcript" data-video-id="${video.videoId}" data-video-title="${video.title.replace(/"/g, '&quot;')}"><i class="fa-solid fa-file-lines"></i> 보기</button>`;

            row.innerHTML = `
                <td class="col-number">${index + 1}</td>
                <td class="thumbnail-cell">
                    <img src="${video.thumbnail}" alt="thumbnail" class="table-thumbnail">
                    <a href="${video.thumbnail.replace('hqdefault.jpg', 'maxresdefault.jpg')}" target="_blank" class="download-link" title="썸네일 원본 보기"><i class="fa-solid fa-download"></i></a>
                </td>
                <td>
                    <div class="title">${video.title}</div>
                    <div class="channel">${video.channelTitle} - ${video.publishedAt_formatted}</div>
                </td>
                <td>${nFormatter(video.viewCount, 1)}</td> 
                <td class="highlight-metric like-ratio">${video.likeRatio}%</td>
                <td class="highlight-metric vph">${video.vph.toLocaleString()}</td>
                <td class="highlight-metric">${nFormatter(video.subscriberCount, 1)}</td> 
                <td class="highlight-metric ratio">${video.ratio}%</td>
                <td>${video.duration_formatted}</td> 
                <td><a href="${videoUrl}" target="_blank" class="btn-link">보기</a></td>
                <td>${analysisButtonHTML}</td> 
            `;
            fragment.appendChild(row);
        });
        resultsTableBody.appendChild(fragment);
    }

    // ============ 6. 기타 UI 로직 (clearButton, placeholder 등) ============
    searchModeKeyword.addEventListener('change', () => { searchInput.placeholder = "분석할 키워드를 입력하세요."; });
    searchModeChannel.addEventListener('change', () => { searchInput.placeholder = "분석할 채널의 핸들(@채널명) 또는 URL을 입력하세요."; });

    // ============ 7. '프로젝트 불러오기' 로직 ============
    function loadProjectFromStorage() {
        const paramsString = localStorage.getItem('projectToLoad_Params');
        const resultsString = localStorage.getItem('projectToLoad_Results');
        if (paramsString && resultsString) {
            console.log("불러올 프로젝트 데이터를 찾았습니다!");
            try {
                const params = JSON.parse(paramsString);
                const results = JSON.parse(resultsString);
                searchInput.value = params.query || '';
                searchModeKeyword.checked = params.searchType === 'keyword';
                searchModeChannel.checked = params.searchType === 'channel';
                videoLengthType.value = params.videoLength || 'any';
                uploadDays.value = params.period || '30';
                regionCode.value = params.region || 'KR';
                sortOrder.value = params.sortOrder || 'relevance';
                minViewCount.value = params.minViews || '10000';
                vphToggle.checked = params.useVPH || false;
                minVPH.value = params.minVPH || '100';
                maxResults.value = params.maxResults || '50';
                excludeMadeForKids.checked = params.excludeKids; 
                targetLanguage.value = params.language || 'ko';
                currentResults = results;
                lastSearchParams = params; 
                renderTable(); 
                updateSortHeaders('ratio', 'desc'); 
            } catch (e) {
                console.error("프로젝트 불러오기 실패 (잘못된 데이터):", e);
            } finally {
                localStorage.removeItem('projectToLoad_Params');
                localStorage.removeItem('projectToLoad_Results');
            }
        }
    }
    loadProjectFromStorage();

    // ============ 8. '스크립트/AI' 팝업 모달 제어 로직 ============
    
    // 테이블 클릭 이벤트 위임 (모달 열기)
    resultsTableBody.addEventListener('click', (event) => {
        const transcriptButton = event.target.closest('.btn-transcript');
        if (transcriptButton) {
            event.preventDefault();
            const videoId = transcriptButton.getAttribute('data-video-id');
            const videoTitle = transcriptButton.getAttribute('data-video-title');
            openTranscriptModal(videoId, videoTitle);
        }
    });openTranscriptModal

    // ▼▼▼ [신규] 모달 닫기 전용 함수 ▼▼▼
    /**
     * 모달을 닫고, 재생 중인 유튜브 플레이어를 제거하는 함수
     */
    function closeTranscriptModal() {
        modalOverlay.style.display = 'none';
        // 플레이어 컨테이너의 내용을 완전히 비워서 iframe을 제거하고 영상 재생을 중지시킴
        if(modalVideoPlayerContainer) {
            modalVideoPlayerContainer.innerHTML = '';
        }
    }

/**
 * 스크립트/AI 분석 모달을 여는 함수 (핵심 지표 표시 버전)
 */
function openTranscriptModal(videoId, videoTitle) {
    const transcriptTextarea = document.getElementById('modal-transcript-text');
    const analyzeButton = document.getElementById('modal-run-ai-btn');
    const modalTitleElement = document.getElementById('modal-title');
    const promptTextarea = document.getElementById('modal-ai-prompt');

    modalOverlay.style.display = 'flex';
    modalTitleElement.textContent = videoTitle;
    transcriptTextarea.value = "스크립트 로딩 중... (확장 프로그램 응답 대기)";
    promptTextarea.value = DEFAULT_AI_PROMPT; 
    analyzeButton.disabled = true;
    document.getElementById('ai-summary-content').innerHTML = "<p>스크립트를 불러온 후, 'AI 분석' 버튼을 눌러주세요.</p>";

    const videoData = currentResults.find(v => v.videoId === videoId);

    if (videoData) {
        // ▼▼▼ [최종 진단] UI 요소를 찾았는지 직접 확인하는 로그 ▼▼▼
        console.log("업데이트 할 썸네일 링크 요소:", document.getElementById('modal-thumb-download-link'));
        console.log("업데이트 할 업로드 날짜 요소:", document.getElementById('modal-meta-uploaddate'));
        console.log("업데이트 할 조회/구독비율 요소:", document.getElementById('modal-meta-ratio'));
        
        document.getElementById('modal-video-thumbnail').src = videoData.thumbnail;
        const downloadLink = document.getElementById('modal-thumb-download-link');
        if (videoData.thumbnail && videoData.thumbnail.includes('hqdefault.jpg')) {
             downloadLink.href = videoData.thumbnail.replace('hqdefault.jpg', 'maxresdefault.jpg');
        } else {
             downloadLink.href = videoData.thumbnail;
        }
       
        document.getElementById('modal-channel-title').textContent = videoData.channelTitle;
        document.getElementById('modal-meta-viewcount').textContent = nFormatter(videoData.viewCount, 1);
        document.getElementById('modal-meta-vph').textContent = videoData.vph.toLocaleString();
        document.getElementById('modal-meta-subscribers').textContent = nFormatter(videoData.subscriberCount, 1);
        document.getElementById('modal-meta-uploaddate').textContent = videoData.publishedAt_formatted;
        document.getElementById('modal-meta-ratio').textContent = videoData.ratio + '%';
    }
    // 유튜브 Iframe 플레이어 생성 로직
    if (modalVideoPlayerContainer) {
        modalVideoPlayerContainer.innerHTML = ''; // 이전 플레이어 제거
        const iframe = document.createElement('iframe');
        iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
        iframe.setAttribute('allowfullscreen', '');
        modalVideoPlayerContainer.appendChild(iframe);
    }

    // 확장 프로그램 연동 로직 (기존과 동일)
    const EXTENSION_ID = document.querySelector('main').dataset.extensionId;

    try { 
        if (!EXTENSION_ID || EXTENSION_ID === "None") { 
            transcriptTextarea.value = "오류: 확장 프로그램 ID가 설정되지 않았습니다. (.env 파일을 확인하세요)";
            return;
        }

        if (!chrome.runtime || !chrome.runtime.sendMessage) {
            transcriptTextarea.value = `오류: Benchly 확장 프로그램과 통신할 수 없습니다.\n\n확장 프로그램이 설치 및 활성화되었는지 확인하세요.`;
            return;
        }

        chrome.runtime.sendMessage(
            EXTENSION_ID, 
            { action: "getTranscript", videoId: videoId },
             (response) => {
                if (chrome.runtime.lastError) {
                    transcriptTextarea.value = "오류 (확장 프로그램): " + chrome.runtime.lastError.message;
                    return;
                }

                if (response && response.success) {
                    const formattedTranscript = cleanAndFormatTranscript(response.transcript);
                    transcriptTextarea.value = formattedTranscript;
                    analyzeButton.disabled = false; 
                } else {
                    transcriptTextarea.value = "오류 (확장 프로그램): " + (response ? response.error : "알 수 없는 응답입니다.");
                }
            }
        );
    } catch (e) { 
        transcriptTextarea.value = `오류: 확장 프로그램과 통신할 수 없습니다.\n\n개발자 모드가 켜져 있는지 확인하세요.`;
        console.error(e);
    }
}

    // ============ 9. 'AI 분석' 버튼 클릭 이벤트 (업그레이드 버전) ============
    modalRunAiBtn.addEventListener('click', () => {
        const transcriptText = modalTranscriptContent.value;
        const userPrompt = document.getElementById('modal-ai-prompt').value;
        const selectedModel = document.getElementById('modal-ai-model').value;

        if (!transcriptText || transcriptText.startsWith("오류:")) {
            alert("분석할 스크립트가 없습니다.");
            return;
        }
        if (!userPrompt) {
            alert("AI에게 전달할 프롬프트가 없습니다.");
            return;
        }

        modalRunAiBtn.disabled = true;
        modalRunAiBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> AI가 분석 중입니다...';
        modalAiSummaryContent.innerHTML = `<p>${selectedModel} 모델이 스크립트를 분석 중입니다... (최대 1분 소요)</p>`;

        fetch('/api/get_summary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                transcript: transcriptText,
                prompt: userPrompt,
                model: selectedModel
            }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                modalAiSummaryContent.innerHTML = data.summary_html || data.key_points_html; // 서버 응답에 따라 유연하게 처리
            } else {
                modalAiSummaryContent.innerHTML = "<p>AI 분석 실패: " + data.error + "</p>";
            }
            modalRunAiBtn.disabled = false;
            modalRunAiBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> AI 성공 요인 분석하기';
        })
        .catch(error => {
            console.error('Error fetching AI summary:', error);
            modalAiSummaryContent.innerHTML = "<p>AI 분석 서버 통신 실패: " + error + "</p>";
            modalRunAiBtn.disabled = false;
            modalRunAiBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> AI 성공 요인 분석하기';
        });
    });
});