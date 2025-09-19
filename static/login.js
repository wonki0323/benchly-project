document.addEventListener('DOMContentLoaded', () => {
    
    const loginForm = document.getElementById('login-form');
    const messageDiv = document.getElementById('message');

    loginForm.addEventListener('submit', (event) => {
        event.preventDefault(); // 기본 폼 제출 방지

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        messageDiv.textContent = '로그인 시도 중...';
        messageDiv.style.color = 'black';

        fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                password: password
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                messageDiv.textContent = '로그인 성공! 메인 페이지로 이동합니다.';
                messageDiv.style.color = 'green';
                // 로그인 성공 시, 메인 페이지('/')로 이동
                setTimeout(() => {
                    window.location.href = '/';
                }, 1000);
            } else {
                // 실패 시 (예: 비밀번호 불일치)
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