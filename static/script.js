// HTML 문서가 완전히 로드된 후에 이 안의 코드를 실행합니다.
document.addEventListener('DOMContentLoaded', () => {

    // ============ 0. 새로운 헬퍼 함수 (숫자 K/M 포맷팅) ============
    /**
     * 숫자를 K(천), M(백만) 단위로 축약해주는 함수
     */
    function nFormatter(num, digits) {
        if (!num) return '0'; // 0 또는 null일 경우 '0' 반환
        const si = [
            { value: 1, symbol: "" },
            { value: 1E3, symbol: "K" },
            { value: 1E6, symbol: "M" },
            { value: 1E9, symbol: "B" }, // 10억
            { value: 1E12, symbol: "T" }  // 1조
        ];
        const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
        let i;
        for (i = si.length - 1; i > 0; i--) {
            if (num >= si[i].value) {
                break;
            }
        }
        return (num / si[i].value).toFixed(digits).replace(rx, "$1") + si[i].symbol;
    }

    // ============ 1. 전역 변수 및 UI 요소 ============
    let currentResults = []; // 검색 결과를 저장할 전역 배열
    let currentSort = { key: 'ratio', direction: 'desc' }; // 현재 정렬 상태

    // --- UI 요소들 가져오기 ---
    const startButton = document.getElementById('startButton');
    const searchInput = document.getElementById('searchInput');
    const searchModeKeyword = document.getElementById('searchKeyword');
    const searchModeChannel = document.getElementById('searchChannel');
    const resultsTableBody = document.getElementById('results-tbody'); 
    const initialMessage = document.getElementById('initial-message');
    const clearButton = document.getElementById('clearButton');

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
    const language = document.getElementById('language'); // 언어 필터 추가


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
            excludeKids: excludeMadeForKids.checked, // <-- ★★★ 여기에 쉼표(,)가 빠졌었습니다 ★★★
            language: language.value 
        };

        if (!searchParams.query) {
            if (event && (event.type === 'change' || event.type === 'keydown')) {
                return;
            }
            alert("검색어 또는 채널 URL을 입력해주세요.");
            return;
        }

        console.log("백엔드로 전송할 검색 파라미터:", searchParams);
        initialMessage.innerHTML = `<p>데이터를 분석하는 중입니다... (최대 10초 소요될 수 있습니다)</p>`;
        initialMessage.style.display = 'block'; 
        resultsTableBody.innerHTML = ''; 

        fetch('/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(searchParams),
        })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            if (data.error) throw new Error(data.error);
            
            console.log('✅ 백엔드 데이터 수신 성공:', data);
            currentResults = data.items; 
            initialMessage.style.display = 'none'; 
            
            sortData('ratio', 'desc'); 
            renderTable(); 
            updateSortHeaders('ratio', 'desc');
        })
        .catch(error => {
            console.error('❌ 에러 발생:', error);
            initialMessage.innerHTML = `<p>데이터를 불러오는 데 실패했습니다. 오류: ${error.message}</p><p>API 키 또는 할당량을 확인해주세요.</p>`;
            initialMessage.style.display = 'block';
            currentResults = []; 
        });
    }

    // --- 이벤트 리스너 연결 ---
    
    startButton.addEventListener('click', startSearch);
    sortOrder.addEventListener('change', () => {
        if (searchInput.value) { 
            startSearch();
        }
    });
    videoLengthType.addEventListener('change', () => {
        if (searchInput.value) {
            startSearch();
        }
    });
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); 
            startSearch();
        }
    });
    // '언어' 필터에도 자동 검색 이벤트 추가
    language.addEventListener('change', () => {
        if (searchInput.value) {
            startSearch();
        }
    });


    // ============ 3. 클라이언트 사이드 정렬 기능 ============

    function sortAndRender(sortKey) {
        let direction = 'desc'; 
        if (currentSort.key === sortKey && currentSort.direction === 'desc') {
            direction = 'asc';
        }
        
        sortData(sortKey, direction); 
        renderTable(); 
        updateSortHeaders(sortKey, direction); 
        
        currentSort = { key: sortKey, direction };
    }

    function sortData(key, direction) {
        const multiplier = (direction === 'asc') ? 1 : -1;
        currentResults.sort((a, b) => {
            let valA = a[key];
            let valB = b[key];
            if (typeof valA === 'string') {
                return valA.localeCompare(valB) * multiplier;
            }
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
        document.querySelectorAll('th.sortable span').forEach(span => {
            span.textContent = ''; 
        });
        const activeHeader = document.querySelector(`th[data-sort-key="${activeKey}"] span`);
        if (activeHeader) {
            activeHeader.textContent = (direction === 'asc') ? ' ▲' : ' ▼';
        }
    }


    // ============ 4. 테이블을 화면에 그리는 함수 ============
    function renderTable() {
        if (!currentResults || currentResults.length === 0) {
            initialMessage.innerHTML = '<p>검색 결과가 없거나, 모든 결과가 필터에 의해 제외되었습니다.</p>';
            initialMessage.style.display = 'block';
            resultsTableBody.innerHTML = '';
            return;
        }

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

    // ============ 5. 기타 UI 로직 ============
    
    clearButton.addEventListener('click', () => {
        initialMessage.innerHTML = '<p>분석할 조건을 설정하고 [Search] 버튼을 누르세요.</p>';
        initialMessage.style.display = 'block';
        resultsTableBody.innerHTML = '';
        searchInput.value = '';
        currentResults = []; 
    });

    searchModeKeyword.addEventListener('change', () => {
        searchInput.placeholder = "분석할 키워드를 입력하세요.";
    });
    searchModeChannel.addEventListener('change', () => {
        searchInput.placeholder = "분석할 채널의 핸들(@채널명) 또는 URL을 입력하세요.";
    });

});