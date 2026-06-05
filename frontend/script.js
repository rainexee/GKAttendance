document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const submitBtn = document.querySelector('.login-btn');
    const messageEl = document.getElementById('message');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        const submitBtn = document.querySelector('.login-btn');
        const btnSpinner = document.getElementById('btn-spinner');
        const messageDiv = document.getElementById('message');
        
        // Show loading state
        submitBtn.disabled = true;
        btnSpinner.style.display = 'inline-block';
        messageDiv.classList.add('hidden');
        
        try {
            // First try admin login
            let response = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            let data = await response.json();
            
            if (data.success) {
                // Admin login successful
                localStorage.setItem('adminToken', data.token);
                localStorage.setItem('userRole', 'admin');
                messageDiv.className = 'message success';
                messageDiv.innerHTML = '<i class="fas fa-check-circle"></i> Admin login successful! Redirecting...';
                messageDiv.classList.remove('hidden');
                
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 1000);
                return;
            }
            
            // If admin login fails, try user login
            response = await fetch('/api/user/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            
            data = await response.json();
            
            if (data.success) {
                // User login successful
                localStorage.setItem('userToken', data.token);
                localStorage.setItem('userRole', data.role || 'user');
                localStorage.setItem('currentUser', JSON.stringify(data.user));
                
                messageDiv.className = 'message success';
                messageDiv.innerHTML = '<i class="fas fa-check-circle"></i> Login successful! Redirecting...';
                messageDiv.classList.remove('hidden');
                
                setTimeout(() => {
                    window.location.href = '/userdashboard';
                }, 1000);
            } else {
                // Both logins failed
                messageDiv.className = 'message error';
                messageDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> Invalid username or password';
                messageDiv.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Login error:', error);
            messageDiv.className = 'message error';
            messageDiv.innerHTML = '<i class="fas fa-exclamation-circle"></i> Server error. Please try again.';
            messageDiv.classList.remove('hidden');
        } finally {
            submitBtn.disabled = false;
            btnSpinner.style.display = 'none';
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
