// ==========================================================
//                 injected.js (v3 - XHR + 예외 처리)
// ==========================================================

console.log('INJ: injected.js가 로드되었습니다. XHR 가로채기를 시작합니다.');

// 원본 XHR.open 과 XHR.send 함수를 백업
const originalXhrOpen = XMLHttpRequest.prototype.open;
const originalXhrSend = XMLHttpRequest.prototype.send;

// XHR.open()을 재정의하여 URL을 미리 저장
XMLHttpRequest.prototype.open = function(method, url, ...args) {
  this._requestUrl = url; 
  return originalXhrOpen.apply(this, [method, url, ...args]);
};

// XHR.send()를 재정의하여 응답을 가로챔
XMLHttpRequest.prototype.send = function(...args) {
  
  this.addEventListener('load', function() {
    
    if (this._requestUrl && this._requestUrl.includes('/api/timedtext')) {
      
      console.log('INJ: /api/timedtext XHR 요청 가로챔!', this._requestUrl);

      // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
      // ★★★ (신규) 빈 응답(responseText) 예외 처리 ★★★
      // ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
      if (!this.responseText || this.responseText.trim() === "") {
        console.warn('INJ: XHR 응답이 비어있습니다. (Empty responseText). 파싱을 건너뜁니다.');
        return; // 파싱을 시도하지 않고 종료
      }
      
      try {
        const responseData = JSON.parse(this.responseText);
        console.log('INJ: 자막 데이터(JSON) 추출 성공. content.js로 전송합니다.');
        
        window.postMessage({
          type: 'BENCHLY_SUBTITLE_DATA',
          payload: responseData
        }, '*');
        
      } catch (e) {
        // (JSON이 아닌 다른 형식(예: XML)이거나, 진짜 오류일 경우)
        console.error('INJ: XHR 자막 JSON 파싱 오류', e, this.responseText);
      }
    }
  });

  // 원본 send 함수 실행
  return originalXhrSend.apply(this, args);
};