document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('user-login-form');
    const submitBtn = document.querySelector('.login-btn');
    const messageEl = document.getElementById('message');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        if (!username || !password) {
            showMessage('Please enter both username and password.', 'error');
            return;
        }

        submitBtn.classList.add('loading');
        submitBtn.disabled = true;
        messageEl.classList.add('hidden');

        try {
            const response = await fetch('/api/user/index', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (data.success) {
                localStorage.setItem('userToken', data.token);
                localStorage.setItem('userRole', data.role || 'user');
                localStorage.setItem('currentUser', JSON.stringify(data.user));

                showMessage('Login successful! Redirecting...', 'success');

                setTimeout(() => {
                    window.location.href = '/userdashboard';
                }, 1000);
            } else {
                showMessage(data.message || 'Invalid username or password.', 'error');
                shakeForm();
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
            }
        } catch (error) {
            console.error('Login error:', error);
            showMessage('Unable to connect to the server. Please try again.', 'error');
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    });

    function showMessage(text, type) {
        messageEl.textContent = text;
        messageEl.className = `message ${type}`;
        messageEl.classList.remove('hidden');
    }

    function shakeForm() {
        form.style.animation = 'none';
        setTimeout(() => {
            form.style.animation = 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both';
        }, 10);
    }

    const style = document.createElement('style');
    style.textContent = `
        @keyframes shake {
            10%, 90% { transform: translate3d(-1px, 0, 0); }
            20%, 80% { transform: translate3d(2px, 0, 0); }
            30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
            40%, 60% { transform: translate3d(4px, 0, 0); }
        }
    `;
    document.head.appendChild(style);
});
