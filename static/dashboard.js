// HTML 문서가 완전히 로드되면 코드 실행
document.addEventListener('DOMContentLoaded', () => {

    const projectListContainer = document.getElementById('project-list-container');

    projectListContainer.addEventListener('click', (event) => {
        
        const targetButton = event.target.closest('a'); // 클릭된 a 태그 찾기
        if (!targetButton) return; // 버튼이 아니면 무시

        event.preventDefault(); // 모든 버튼의 기본 동작 방지

        const projectId = targetButton.getAttribute('data-id');

        // 클릭된 것이 '삭제' 버튼인지 확인
        if (targetButton.classList.contains('btn-delete')) {
            handleDelete(projectId, targetButton);
        }

        // 클릭된 것이 '불러오기' 버튼인지 확인
        if (targetButton.classList.contains('btn-load')) {
            handleLoad(projectId);
        }
    });

    /**
     * 삭제 버튼 처리 함수 (기존과 동일)
     */
    function handleDelete(projectId, buttonElement) {
        if (!confirm('정말 이 프로젝트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
            return; 
        }
        fetch(`/api/project/delete/${projectId}`, { method: 'DELETE' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert(data.message);
                buttonElement.closest('.project-item').remove();
            } else {
                alert('오류: ' + data.error);
                if (data.error.includes('로그인')) { window.location.href = '/login'; }
            }
        })
        .catch(error => {
            console.error('Delete Error:', error);
            alert('프로젝트 삭제 중 심각한 오류가 발생했습니다.');
        });
    }

    /**
     * ★★★ '불러오기' 함수 수정: 이제 결과 스냅샷도 함께 저장 ★★★
     */
    function handleLoad(projectId) {
        // 1. 백엔드에 해당 프로젝트의 모든 데이터를 요청
        fetch(`/api/project/get/${projectId}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // 2. 검색 조건(params)과 결과(results)를 모두 localStorage에 저장
                localStorage.setItem('projectToLoad_Params', data.search_params_json);
                localStorage.setItem('projectToLoad_Results', data.search_results_json);
                
                // 3. 검색 페이지('/search')로 이동
                window.location.href = '/search';
            } else {
                alert('오류: ' + data.error);
                if (data.error.includes('로그인')) {
                    window.location.href = '/login';
                }
            }
        })
        .catch(error => {
            console.error('Load Error:', error);
            alert('프로젝트 로드 중 심각한 오류가 발생했습니다.');
        });
    }

});