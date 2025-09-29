// ==========================================================
//                 content.js (최종 통합본 - v4)
// ==========================================================

console.log('CS: content.js 로드됨.');

// 1. (★핵심★) injected.js를 페이지 DOM에 직접 주입
try {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function() {
    console.log('CS: injected.js가 페이지에 성공적으로 주입되었습니다.');
    this.remove(); // 주입 후 스크립트 태그 제거
  };
  script.onerror = function() {
    console.error('CS: injected.js 주입 실패. web_accessible_resources 설정을 확인하세요.');
  };
  (document.head || document.documentElement).appendChild(script);
} catch (e) {
  console.error('CS: injected.js 주입 중 치명적 오류 발생', e);
}


// 2. injected.js로부터 오는 메시지 수신 (데이터 저장)
window.addEventListener('message', (event) => {
  // 우리가 보낸 메시지인지 확인
  if (event.source === window && event.data && event.data.type === 'BENCHLY_SUBTITLE_DATA') {
    
    console.log('CS: injected.js로부터 자막 데이터 수신 완료', event.data.payload); 
    
    const subtitleData = event.data.payload; 
    
    // chrome.storage에 저장
    chrome.storage.local.set({ 'capturedSubtitles': subtitleData }, () => {
      console.log('CS: 자막 데이터를 chrome.storage에 저장했습니다.'); 
      
      // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
      // ★★★ (신규) 작업 완료! background.js에 "데이터 준비 완료" 신호 전송 ★★★
      // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
      try {
        chrome.runtime.sendMessage({
          type: "DATA_READY",
          message: "자막 저장이 완료되었습니다. 데이터를 요청하세요."
        });
        console.log("CS: background.js로 'DATA_READY' 메시지를 전송했습니다.");
      } catch (e) {
        console.warn("CS: background.js로 메시지 전송 실패. (아마도 탭이 닫히는 중)", e);
      }
    });
  }
}, false);


// 3. (★신규★) 헬퍼 함수: 밀리초(ms)를 [mm:ss] 형식으로 변환
function formatTimestamp(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  // [00:09] 형식
  return `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
}


// 4. (★수정★) 헬퍼 함수: 자막 데이터를 타임스탬프 포함 텍스트로 변환
function parseSubtitleData(data) {
  try {
    if (data && data.events) {
      return data.events
        .filter(event => event.segs) // segs (텍스트 조각)가 있는 이벤트만 필터링
        .map(event => {
          // 타임스탬프 변환
          const timestamp = formatTimestamp(event.tStartMs); 
          // 한 줄의 텍스트 조각들(segs)을 하나로 합침
          const line = event.segs.map(seg => seg.utf8).join(''); 
          // [00:05] 안녕하세요 반갑습니다.
          return `${timestamp} ${line}`;
        })
        .join('\n'); // ★★★ 모든 줄을 '공백'이 아닌 '줄바꿈(\n)'으로 합침
    }
    console.error('CS: 파싱할 data.events가 없습니다.', data);
    return '자막 데이터를 파싱할 수 없습니다 (data.events 없음).';
  } catch (e) {
    console.error('CS: 자막 파싱 중 오류', e, data);
    return '자막 파싱 중 오류 발생';
  }
}


// 5. background.js로부터 오는 요청 처리 (데이터 전송)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getCaptions") {
    console.log('CS: background.js로부터 "getCaptions" 요청 수신.');
    chrome.storage.local.get('capturedSubtitles', (result) => {
      if (result.capturedSubtitles) {
        console.log('CS: storage에서 자막 발견. 파싱 후 background.js에 전달합니다.');
        // 수정된 parseSubtitleData 함수가 여기서 사용됨
        const parsedText = parseSubtitleData(result.capturedSubtitles); 
        sendResponse({ success: true, data: parsedText });
      } else {
        console.error('CS: background.js가 요청했으나, storage에 자막이 없습니다.');
        sendResponse({ success: false, error: '아직 데이터가 수신되지 않았습니다.' });
      }
    });
    return true; // 비동기 응답
  }
});


// 6. (★수정★) 'CC' 버튼 강제 클릭 로직 (v4 - "껐다 켜기" 로직 반영)
// ======================================================================

const maxWaitTime = 30000; 
const checkInterval = 1000; 
let timeWaited = 0;
let adSkipped = false; 
let ccClicked = false; 

console.log("CS: 광고 탐지 및 'CC' 버튼 탐색 시작... (최대 30초)");

const masterPoller = setInterval(() => {
  if (ccClicked) {
    clearInterval(masterPoller);
    return;
  }
  timeWaited += checkInterval;
  if (timeWaited >= maxWaitTime) {
    console.error(`CS: ${maxWaitTime/1000}초 시간 초과. (광고가 너무 길거나, CC 버튼 없음)`);
    clearInterval(masterPoller);
    return;
  }

  // --- 1. 광고 탐지 및 스킵 로직 (동일) ---
  const adShowing = document.querySelector('.ad-showing');
  if (adShowing && !adSkipped) {
    console.log("CS: 광고가 재생 중입니다. '건너뛰기' 버튼을 찾습니다...");
    const skipButton = document.querySelector('.ytp-ad-skip-button');
    if (skipButton) {
      console.log("CS: '광고 건너뛰기' 버튼 발견. 클릭합니다.");
      skipButton.click();
      adSkipped = true; 
    }
    return; 
  }

  // --- 2. 'CC' 버튼 클릭 로직 (★수정됨★) ---
  console.log("CS: 광고 없음(또는 스킵됨). 'CC' 버튼을 찾습니다...");
  const ccButton = document.querySelector('button.ytp-subtitles-button.ytp-button');
  
  if (ccButton) {
    console.log("CS: 'CC' 버튼 발견!");
    
    // ★★★ (수정된 로직) ★★★
    // "한번 껐다가 켜야 자막이 나온다"는 피드백을 반영.
    // 버튼의 현재 상태와 관계없이 '켜기 -> 끄기 -> 켜기' 동작을 강제 실행.
    
    console.log("CS: 자막 요청 강제를 위해 '켜기 -> 끄기 -> 켜기' 로직을 실행합니다.");

    // 1. 첫번째 클릭 (켜기)
    // (버튼이 '꺼짐' 상태(isPressed=false)라고 가정하고 일단 클릭)
    if (ccButton.getAttribute('aria-pressed') !== 'true') {
        ccButton.click();
        console.log("CS: 1차 클릭 (켜기).");
    }

    // 2. 500ms 뒤 두번째 클릭 (껐다 켜기)
    setTimeout(() => {
        console.log("CS: 2차 로직 (껐다 켜기) 실행...");
        ccButton.click(); // 끈다
        setTimeout(() => {
            ccButton.click(); // 다시 켠다
            console.log("CS: '껐다 켜기' 로직 완료. (총 3회 클릭)");
        }, 200); // 0.2초 뒤
    }, 500); // 0.5초 뒤

    ccClicked = true; // "클릭 시도"를 완료로 간주
    clearInterval(masterPoller); // ★★ 모든 작업 완료, 탐색 중지 ★★
    
  } else {
    console.log("CS: 'CC' 버튼을 아직 찾을 수 없습니다. (플레이어 로딩 중...)");
  }

}, checkInterval);