// HTML 문서가 완전히 준비되면 코드 실행
document.addEventListener('DOMContentLoaded', () => {
    
    const registerForm = document.getElementById('register-form');
    const messageDiv = document.getElementById('message');

    // '가입하기' 버튼 클릭(submit) 이벤트를 가로챔
    registerForm.addEventListener('submit', (event) => {
        // 폼의 기본 동작(새로고침)을 막습니다.
        event.preventDefault(); 

        // 폼에서 값들을 가져옵니다.
        const username = document.getElementById('username').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        messageDiv.textContent = '가입 처리 중...';
        messageDiv.style.color = 'black';

        // 백엔드의 '/api/register' 주소로 데이터를 전송합니다.
        fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: username,
                email: email,
                password: password
            })
        })
        .then(response => response.json()) // 백엔드의 응답을 JSON으로 변환
        .then(data => {
            if (data.success) {
                // 성공 시
                messageDiv.textContent = '회원가입 성공! 메인 페이지로 이동합니다.';
                messageDiv.style.color = 'green';
                // 1.5초 후에 메인 페이지('/')로 이동
                setTimeout(() => {
                    window.location.href = '/';
                }, 1500);
            } else {
                // 실패 시 (예: 아이디 중복)
                messageDiv.textContent = '오류: ' + data.error;
                messageDiv.style.color = 'red';
            }
        })
        .catch(error => {
            console.error('Fetch Error:', error);
            messageDiv.textContent = '심각한 오류가 발생했습니다. 콘솔을 확인하세요.';
            messageDiv.style.color = 'red';
        });
    });

});