const searchButton = document.getElementById('search-button');
const searchInput = document.getElementById('search-input');
const resultsContainer = document.getElementById('results-container');

// 1. 받은 데이터를 HTML로 만들어주는 함수를 새로 만듭니다.
function displayResults(videos) {
    // 이전 검색 결과를 깨끗하게 지웁니다.
    resultsContainer.innerHTML = '';

    // video 리스트의 각 아이템을 순회하며 HTML 요소를 만듭니다.
    videos.forEach(video => {
        const videoId = video.id.videoId;
        const title = video.snippet.title;
        const thumbnail = video.snippet.thumbnails.default.url;
        const channelTitle = video.snippet.channelTitle;
        const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

        // 각 비디오를 표시할 HTML 템플릿을 만듭니다.
        const videoElement = `
            <div class="video-card">
                <a href="${videoUrl}" target="_blank">
                    <img src="${thumbnail}" alt="${title}" class="thumbnail">
                    <div class="video-info">
                        <h3 class="title">${title}</h3>
                        <p class="channel">${channelTitle}</p>
                    </div>
                </a>
            </div>
        `;

        // 완성된 HTML을 결과 컨테이너에 추가합니다.
        resultsContainer.innerHTML += videoElement;
    });
}

searchButton.addEventListener('click', () => {
    const keyword = searchInput.value;

    if (keyword) {
        resultsContainer.innerHTML = '<p>데이터를 불러오는 중입니다...</p>';

        fetch('http://127.0.0.1:5000/api/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword: keyword }),
        })
        .then(response => response.json())
        .then(data => {
            console.log('✅ 유튜브 데이터 수신 성공:', data);
            
            // 2. 데이터가 오면, 방금 만든 displayResults 함수를 호출합니다.
            if (data.items && data.items.length > 0) {
                displayResults(data.items);
            } else {
                resultsContainer.innerHTML = '<p>검색 결과가 없습니다.</p>';
            }
        })
        .catch(error => {
            console.error('❌ 에러 발생:', error);
            resultsContainer.innerHTML = '<p>데이터를 불러오는 데 실패했습니다.</p>';
        });

    } else {
        alert("키워드를 입력해주세요!");
    }
});
