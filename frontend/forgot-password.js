document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('forgot-password-form');
    const usernameOrEmailInput = document.getElementById('usernameOrEmail');
    const submitBtn = document.querySelector('.login-btn');
    const messageEl = document.getElementById('message');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const usernameOrEmail = usernameOrEmailInput.value.trim();
        
        if (!usernameOrEmail) {
            showMessage('Please enter your username or email.', 'error');
            return;
        }

        // Add loading state
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;
        messageEl.classList.add('hidden');

        try {
            const response = await fetch('/api/admin/forgotpassword', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ usernameOrEmail })
            });

            const data = await response.json();

            if (response.ok) {
                showMessage(data.message || 'Password reset code sent to your registered email.', 'success');
                usernameOrEmailInput.value = '';
                setTimeout(() => {
                    window.location.href = '/reset-password';
                }, 2000);
            } else {
                showMessage(data.message || 'Error occurred. Please try again.', 'error');
                
                // Add a subtle shake animation for error
                form.style.animation = 'none';
                setTimeout(() => {
                    form.style.animation = 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both';
                }, 10);
            }
        } catch (error) {
            console.error('Error submitting forgot password request:', error);
            showMessage('Unable to connect to the server. Please check your connection.', 'error');
        } finally {
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    });

    function showMessage(text, type) {
        messageEl.textContent = text;
        messageEl.className = `message ${type}`;
        messageEl.classList.remove('hidden');
    }

    // Add keyframes for shake animation dynamically
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
