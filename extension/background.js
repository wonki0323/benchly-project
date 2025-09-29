// ==========================================================
//                 background.js (v4 - 최종 프로덕션 버전)
// ==========================================================

// 1. 웹사이트(script.js)와 통신하기 위한 변수
let originalSendResponse = null;
let targetTabId = null;

// 2. 웹사이트(script.js)로부터 'getTranscript' 요청 수신
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  // 이미 다른 작업이 진행 중인지 확인
  if (targetTabId !== null) {
    console.warn("BG: 이미 다른 작업이 진행 중입니다. 새 요청을 무시합니다.");
    sendResponse({ success: false, error: "이미 다른 자막을 추출 중입니다." });
    return false; // 새 작업 진행 안 함
  }
  
  if (request.action === 'getTranscript') {
    console.log("BG: 웹사이트로부터 'getTranscript' 요청 수신. videoId:", request.videoId);

    originalSendResponse = sendResponse;
    const videoId = request.videoId;
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // ★★★ (수정 1) active: true -> active: false ★★★
    // 탭을 '보이지 않는' 백그라운드 상태로 엽니다.
    chrome.tabs.create({ url: youtubeUrl, active: false }, (tab) => {
      targetTabId = tab.id;
      console.log(`BG: ${targetTabId}번 탭 (숨김) 생성. 'DATA_READY' 대기.`);
    });
    
    return true; // 비동기 응답
  }
});

// 4. content.js로부터 'DATA_READY' 신호 수신
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request.type === "DATA_READY" && sender.tab && sender.tab.id === targetTabId) {
    
    console.log(`BG: ${targetTabId}번 탭으로부터 'DATA_READY' 신호 수신!`);
    console.log("BG: 'getCaptions' 메시지로 storage의 데이터 요청.");

    chrome.tabs.sendMessage(targetTabId, { action: "getCaptions" }, (response) => {
      
      if (!originalSendResponse) {
        console.error("BG: 응답을 보낼 'originalSendResponse' 함수가 없습니다.");
        // (탭이 이미 닫혔거나 오류 발생 시)
        if (targetTabId) chrome.tabs.remove(targetTabId); // 보험용 탭 닫기
        targetTabId = null;
        return;
      }

      if (response && response.success) {
        console.log("BG: 자막 수신 성공!");
        originalSendResponse({ success: true, transcript: response.data });
        
        // ★★★ (수정 2) 탭 자동 닫기 주석 해제 ★★★
        // 작업에 성공했으므로 탭을 닫습니다.
        chrome.tabs.remove(targetTabId);
        console.log(`BG: 작업 완료. ${targetTabId}번 탭 닫음.`);

      } else {
        console.error("BG: 'getCaptions' 응답 실패:", response);
        originalSendResponse({ success: false, error: response ? response.error : "알 수 없는 오류" });
        
        // (실패 시에도 탭을 닫습니다)
        if (targetTabId) chrome.tabs.remove(targetTabId);
        console.log(`BG: 작업 실패. ${targetTabId}번 탭 닫음.`);
      }

      // 7. 작업 완료. 저장된 변수 초기화
      originalSendResponse = null;
      targetTabId = null;
    });
  }
  
  return false;
});