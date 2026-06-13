document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('reset-password-form');
    const codeInput = document.getElementById('code');
    const verifyBtn = document.getElementById('verify-code-btn');
    const passwordSection = document.getElementById('password-section');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const messageEl = document.getElementById('message');

    let verifiedCode = null;

    // Verify code first
    verifyBtn.addEventListener('click', async () => {
        const code = codeInput.value.trim();

        if (!code) {
            showMessage('Please enter the verification code.', 'error');
            return;
        }

        if (!/^\d{6}$/.test(code)) {
            showMessage('Verification code must be 6 digits.', 'error');
            return;
        }

        verifyBtn.disabled = true;
        verifyBtn.classList.add('loading');

        try {
            const response = await fetch('/api/admin/verify-reset-code', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ code })
            });

            const data = await response.json();

            if (response.ok) {
                verifiedCode = code;

                passwordSection.style.display = 'block';

                codeInput.disabled = true;
                verifyBtn.style.display = 'none';

                passwordInput.required = true;
                confirmPasswordInput.required = true;

                showMessage(
                    data.message || 'Code verified. Enter your new password.',
                    'success'
                );
            } else {
                showMessage(
                    data.message || 'Invalid or expired verification code.',
                    'error'
                );

                verifyBtn.disabled = false;
                verifyBtn.classList.remove('loading');

                shakeForm();
            }
        } catch (error) {
            console.error('Verification error:', error);

            showMessage(
                'Unable to connect to the server. Please try again.',
                'error'
            );

            verifyBtn.disabled = false;
            verifyBtn.classList.remove('loading');
        }
    });

    // Reset password
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!verifiedCode) {
            showMessage('Please verify your code first.', 'error');
            return;
        }

        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (!password || !confirmPassword) {
            showMessage('Please fill in both password fields.', 'error');
            return;
        }

        if (password !== confirmPassword) {
            showMessage('Passwords do not match.', 'error');
            shakeForm();
            return;
        }

        if (password.length < 6) {
            showMessage('Password must be at least 6 characters long.', 'error');
            return;
        }

        const resetBtn = form.querySelector('button[type="submit"]');

        resetBtn.disabled = true;
        resetBtn.classList.add('loading');

        try {
            const response = await fetch('/api/admin/resetpassword', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    code: verifiedCode,
                    password
                })
            });

            const data = await response.json();

            if (response.ok) {
                showMessage(
                    data.message || 'Password reset successful! Redirecting...',
                    'success'
                );

                form.reset();

                setTimeout(() => {
                    window.location.href = '/index';
                }, 2000);
            } else {
                showMessage(
                    data.message || 'Failed to reset password.',
                    'error'
                );

                resetBtn.disabled = false;
                resetBtn.classList.remove('loading');

                shakeForm();
            }
        } catch (error) {
            console.error('Reset password error:', error);

            showMessage(
                'Unable to connect to the server. Please check your connection.',
                'error'
            );

            resetBtn.disabled = false;
            resetBtn.classList.remove('loading');
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
            form.style.animation =
                'shake 0.5s cubic-bezier(.36,.07,.19,.97) both';
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