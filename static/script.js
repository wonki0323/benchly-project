document.addEventListener('DOMContentLoaded', () => {

    // ============ 1. 전역 변수 및 UI 요소 ============
    let currentResults = []; // 현재 화면의 검색 결과(스냅샷)를 저장할 전역 배열
    let currentSort = { key: 'ratio', direction: 'desc' };
    let lastSearchParams = {}; // 현재 화면의 검색 조건을 저장할 전역 변수

    // --- UI 요소들 ---
    const startButton = document.getElementById('startButton');
    const searchInput = document.getElementById('searchInput');
    const searchModeKeyword = document.getElementById('searchKeyword');
    const searchModeChannel = document.getElementById('searchChannel');
    const resultsTableBody = document.getElementById('results-tbody'); 
    const initialMessage = document.getElementById('initial-message');
    const clearButton = document.getElementById('clearButton');
    const saveJobButton = document.getElementById('saveJobButton'); 

    // --- 필터 요소들 ---
    const videoLengthType = document.getElementById('videoLengthType');
    const uploadDays = document.getElementById('uploadDays');
    const regionCode = document.getElementById('regionCode');
    const sortOrder = document.getElementById('sortOrder'); 
    const minViewCount = document.getElementById('minViewCount');
    const vphToggle = document.getElementById('vphToggle');
    const minVPH = document.getElementById('minVPH');
    const maxResults = document.getElementById('maxResults');
    const excludeMadeForKids = document.getElementById('excludeMadeForKids');
    const language = document.getElementById('language');


    // ============ 2. 검색 실행 (핵심 로직 함수) ============
    
    function startSearch() {
        const searchParams = {
            searchType: searchModeKeyword.checked ? 'keyword' : 'channel',
            query: searchInput.value,
            videoLength: videoLengthType.value,
            period: uploadDays.value,
            region: regionCode.value,
            sortOrder: sortOrder.value,
            minViews: minViewCount.value,
            useVPH: vphToggle.checked,
            minVPH: minVPH.value,
            maxResults: maxResults.value,
            excludeKids: excludeMadeForKids.checked, 
            language: language.value 
        };

        if (!searchParams.query) {
            if (event && (event.type === 'change' || event.type === 'keydown')) { return; }
            alert("검색어 또는 채널 URL을 입력해주세요.");
            return;
        }

        console.log("백엔드로 전송할 검색 파라미터:", searchParams);
        initialMessage.innerHTML = `<p>데이터를 분석하는 중입니다... (API 호출 중)</p>`;
        initialMessage.style.display = 'block'; 
        resultsTableBody.innerHTML = ''; 

        lastSearchParams = searchParams; // 마지막 검색 조건 저장

        fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(searchParams),
        })
        .then(response => {
            if (!response.ok) {
                if (response.status === 401) { throw new Error('로그인이 필요합니다. 로그인 페이지로 이동합니다.'); }
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.error) throw new Error(data.error);
            
            console.log('✅ 백엔드 데이터 수신 성공:', data);
            currentResults = data.items; // ★★★ 결과를 전역 변수에 저장 (저장 버튼이 이 데이터를 사용) ★★★
            initialMessage.style.display = 'none'; 
            
            sortData('ratio', 'desc'); 
            renderTable(); 
            updateSortHeaders('ratio', 'desc');
        })
        .catch(error => {
            console.error('❌ 에러 발생:', error);
            initialMessage.innerHTML = `<p>데이터를 불러오는 데 실패했습니다. 오류: ${error.message}</p>`;
            if (error.message.includes('로그인')) {
                setTimeout(() => { window.location.href = '/login'; }, 2000);
            }
            initialMessage.style.display = 'block';
            currentResults = []; 
        });
    }

    // --- 이벤트 리스너 연결 ---
    startButton.addEventListener('click', startSearch);
    sortOrder.addEventListener('change', () => { if (searchInput.value) { startSearch(); } });
    videoLengthType.addEventListener('change', () => { if (searchInput.value) { startSearch(); } });
    language.addEventListener('change', () => { if (searchInput.value) { startSearch(); } });
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); 
            startSearch();
        }
    });

    // ★★★ '작업 저장' 버튼 로직 수정: 이제 검색 결과(currentResults)도 함께 보냄 ★★★
    saveJobButton.addEventListener('click', () => {
        if (Object.keys(lastSearchParams).length === 0 || !lastSearchParams.query) {
            alert('먼저 검색을 실행해주세요.');
            return;
        }
        if (currentResults.length === 0) {
            alert('저장할 검색 결과가 없습니다.');
            return;
        }

        const projectName = prompt('이 검색 작업을 어떤 이름으로 저장하시겠습니까?', lastSearchParams.query);

        if (projectName) {
            fetch('/api/project/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    projectName: projectName,
                    searchParams: lastSearchParams,  // 검색 조건
                    searchResults: currentResults  // ★★★ 검색 결과 스냅샷 ★★★
                })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    alert(data.message);
                } else {
                    if (data.error.includes('로그인')) {
                        alert(data.error);
                        window.location.href = '/login';
                    } else { alert('오류: ' + data.error); }
                }
            })
            .catch(err => { console.error('Save Project Error:', err); alert('프로젝트 저장 중 오류가 발생했습니다.'); });
        }
    });


    // ============ 3. 클라이언트 사이드 정렬 기능 (변경 없음) ============
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


    // ============ 4. 테이블을 화면에 그리는 함수 (변경 없음) ============
    function renderTable() {
        if (!currentResults || currentResults.length === 0) {
            initialMessage.innerHTML = '<p>검색 결과가 없거나, 모든 결과가 필터에 의해 제외되었습니다.</p>';
            initialMessage.style.display = 'block';
            resultsTableBody.innerHTML = ''; return;
        }
        initialMessage.style.display = 'none'; // 결과가 있으니 초기 메시지 숨김
        let tableBodyHTML = '';
        currentResults.forEach((video, index) => { 
            const videoUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
            tableBodyHTML += `
                <tr>
                    <td class="col-number">${index + 1}</td>
                    <td class="thumbnail-cell">
                        <img src="${video.thumbnail}" alt="thumbnail" class="table-thumbnail">
                        <a href="${video.thumbnail}" target="_blank" class="download-link" title="썸네일 원본 보기">
                            <i class="fa-solid fa-download"></i>
                        </a>
                    </td>
                    <td>
                        <div class="title">${video.title}</div>
                        <div class="channel">${video.channelTitle} - ${video.publishedAt_formatted}</div>
                    </td>
                    <td>${nFormatter(video.viewCount, 1)}</td> 
                    <td class="highlight-metric like-ratio">${video.likeRatio}%</td>
                    <td class="highlight-metric vph">${video.vph.toLocaleString()}</td>
                    <td>${nFormatter(video.subscriberCount, 1)}</td> 
                    <td class="highlight-metric ratio">${video.ratio}%</td>
                    <td>${video.duration_formatted}</td> 
                    <td><a href="${videoUrl}" target="_blank" class="btn-link">보기</a></td>
                </tr>
            `;
        });
        resultsTableBody.innerHTML = tableBodyHTML;
    }
    function nFormatter(num, digits) {
        if (!num) return '0'; 
        const si = [ { value: 1, symbol: "" }, { value: 1E3, symbol: "K" }, { value: 1E6, symbol: "M" }, { value: 1E9, symbol: "B" }, { value: 1E12, symbol: "T" } ];
        const rx = /\.0+$|(\.[0-9]*[1-9])0+$/; let i;
        for (i = si.length - 1; i > 0; i--) { if (num >= si[i].value) { break; } }
        return (num / si[i].value).toFixed(digits).replace(rx, "$1") + si[i].symbol;
    }

    // ============ 5. 기타 UI 로직 (변경 없음) ============
    clearButton.addEventListener('click', () => {
        initialMessage.innerHTML = '<p>분석할 조건을 설정하고 [Search] 버튼을 누르세요.</p>';
        initialMessage.style.display = 'block';
        resultsTableBody.innerHTML = '';
        searchInput.value = '';
        currentResults = []; 
        lastSearchParams = {}; 
    });
    searchModeKeyword.addEventListener('change', () => { searchInput.placeholder = "분석할 키워드를 입력하세요."; });
    searchModeChannel.addEventListener('change', () => { searchInput.placeholder = "분석할 채널의 핸들(@채널명) 또는 URL을 입력하세요."; });

    
    // ============ 6. ★★★ 새로 추가된 '프로젝트 불러오기' 로직 ★★★ ============
    /**
     * 페이지 로드 시 localStorage를 확인하여, 불러올 프로젝트가 있는지 체크하는 함수
     */
    function loadProjectFromStorage() {
        const paramsString = localStorage.getItem('projectToLoad_Params');
        const resultsString = localStorage.getItem('projectToLoad_Results');

        // 1. 불러올 '결과'와 '조건'이 모두 존재하는지 확인
        if (paramsString && resultsString) {
            console.log("불러올 프로젝트 데이터를 찾았습니다!");
            try {
                // 2. 데이터 파싱
                const params = JSON.parse(paramsString);
                const results = JSON.parse(resultsString);

                // 3. 모든 필터 입력창에 저장된 값들을 다시 채워넣음
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
                language.value = params.language || 'ko';

                // 4. (중요!) API 검색(startSearch) 대신, 저장된 결과를 전역 변수에 넣고 바로 렌더링
                currentResults = results;
                lastSearchParams = params; // 이 작업도 저장된 작업으로 인식
                renderTable(); // 저장된 결과로 테이블 즉시 그리기
                updateSortHeaders('ratio', 'desc'); // 기본 정렬 UI 적용
                
            } catch (e) {
                console.error("프로젝트 불러오기 실패 (잘못된 데이터):", e);
            } finally {
                // 5. 작업이 성공하든 실패하든, 일회용 택배(localStorage)는 즉시 삭제
                localStorage.removeItem('projectToLoad_Params');
                localStorage.removeItem('projectToLoad_Results');
            }
        }
    }

    // --- 페이지 로드 시 '불러오기' 함수를 1회 실행 ---
    loadProjectFromStorage();

});