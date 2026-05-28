document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const submitBtn = document.querySelector('.login-btn');
    const messageEl = document.getElementById('message');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        
        if (!username || !password) {
            showMessage('Please enter both username and password.', 'error');
            return;
        }

        // Add loading state
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;
        messageEl.classList.add('hidden');

        try {
            // Simulate API call to backend
            const response = await fetch('http://localhost:3000/api/admin/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok) {
                showMessage('Login successful! Redirecting...', 'success');
                // Simulate redirect
                setTimeout(() => {
                    submitBtn.classList.remove('loading');
                    submitBtn.disabled = false;
                }, 1500);
            } else {
                showMessage(data.message || 'Invalid credentials. Please try again.', 'error');
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
                
                // Add a subtle shake animation for error
                form.style.animation = 'none';
                setTimeout(() => {
                    form.style.animation = 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both';
                }, 10);
            }
        } catch (error) {
            // If backend is not running, we'll simulate a mock response for demonstration
            console.warn('Backend not reachable, using mock response', error);
            
            setTimeout(() => {
                if (username === 'admin' && password === 'admin123') {
                    showMessage('Mock Login successful! Redirecting...', 'success');
                } else {
                    showMessage('Invalid credentials. (Hint: admin/admin123)', 'error');
                    form.style.animation = 'none';
                    setTimeout(() => {
                        form.style.animation = 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both';
                    }, 10);
                }
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
            }, 1000);
        }
    });

    function showMessage(text, type) {
        messageEl.textContent = text;
        messageEl.className = `message ${type}`;
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
