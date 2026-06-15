document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('signup-form');
    const fullNameInput = document.getElementById('full_name');
    const emailInput = document.getElementById('email');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirm_password');
    const labSelect = document.getElementById('lab_id');
    const roleSelect = document.getElementById('role_id');
    const dlsuIdInput = document.getElementById('dlsu_idnumber');
    const uniqueIdInput = document.getElementById('unique_id');
    const submitBtn = document.getElementById('signup-btn');
    const messageEl = document.getElementById('message');

    const API_BASE_URL = window.location.origin;

    // Helper to fetch and populate dropdowns
    async function populateDropdowns() {
        try {
            // Fetch Labs
            const labsRes = await fetch(`${API_BASE_URL}/api/labs`);
            const labsData = await labsRes.json();
            if (labsData.success && labsData.data.length > 0) {
                labSelect.innerHTML = '<option value="" disabled selected>Select your lab</option>';
                labsData.data.forEach(lab => {
                    const option = document.createElement('option');
                    option.value = lab.lab_id;
                    option.textContent = `${lab.lab_code} - ${lab.lab_name}`;
                    labSelect.appendChild(option);
                });
            } else {
                labSelect.innerHTML = '<option value="" disabled selected>No labs available</option>';
            }

            // Fetch Roles
            const rolesRes = await fetch(`${API_BASE_URL}/api/roles`);
            const rolesData = await rolesRes.json();
            if (rolesData.success && rolesData.data.length > 0) {
                roleSelect.innerHTML = '<option value="" disabled selected>Select your role</option>';
                rolesData.data.forEach(role => {
                    const option = document.createElement('option');
                    option.value = role.role_id;
                    option.textContent = role.role_name;
                    roleSelect.appendChild(option);
                });
            } else {
                roleSelect.innerHTML = '<option value="" disabled selected>No roles available</option>';
            }
        } catch (error) {
            console.error('Error fetching dynamic metadata:', error);
            showMessage('Error connecting to backend services. Using fallback local options.', 'error');

            // Fallback mock options in case backend fails
            labSelect.innerHTML = `
                <option value="" disabled selected>Select your lab</option>
                <option value="1">CeLT - Center for Language Technologies </option>
                <option value="2">CeHCI - Center for Human-Computer Innovations</option>
                <option value="3">Cite4D - Center for ICT for Development</option>
                <option value="4">CAR - Center for Automation Research </option>
                <option value="5">CNIS - Center for Networking and Information Security</option>
                <option value="6">CIVI - Computational Imaging and Visual Innovations </option>
                <option value="7">GAME Lab - Graphics, Animation, Multimedia and Entertainment Laboratory </option>
                <option value="8">HXIL - Human-X Interactions </option>
                <option value"9">TE3D- Technology, Education, Entertainment, Empathy, Design House</option>
                <option value"10">Bioinformatics Lab </option>
            `;
            roleSelect.innerHTML = `
                <option value="" disabled selected>Select your role</option>
                <option value="1">Student</option>
                <option value="2">Staff</option>
                <option value="3">Researcher</option>
                <option value="4">Professor</option>
            `;
        }
    }

    // Call populate on page load
    await populateDropdowns();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const full_name = fullNameInput.value.trim();
        const email = emailInput.value.trim();
        const username = usernameInput.value.trim();
        const password = passwordInput.value;
        const confirm_password = confirmPasswordInput.value;
        const lab_id = parseInt(labSelect.value, 10);
        const role_id = parseInt(roleSelect.value, 10);
        const dlsu_idnumber = parseInt(dlsuIdInput.value.trim(), 10);
        const unique_id = uniqueIdInput.value;

        // Validation checks
        if (!full_name || !email || !username || !password || !confirm_password || !lab_id || !role_id || !dlsu_idnumber || !unique_id) {
            showMessage('Please fill in all the required fields.', 'error');
            return;
        }

        if (password !== confirm_password) {
            showMessage('Passwords do not match.', 'error');
            return;
        }

        // Add loading state
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;
        messageEl.classList.add('hidden');

        try {
            const response = await fetch(`${API_BASE_URL}/api/persons`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    full_name,
                    username,
                    email,
                    password,
                    lab_id,
                    role_id,
                    dlsu_idnumber,
                    unique_id
                })
            });

            const data = await response.json();

            if (response.ok) {
                showMessage('Account created successfully! Redirecting to login...', 'success');
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            } else {
                showMessage(data.message || 'Registration failed. Please try again.', 'error');
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
                triggerFormShake();
            }
        } catch (error) {
            console.error('Network or server error:', error);
            showMessage('Network error. Could not connect to the backend server.', 'error');
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
            triggerFormShake();
        }
    });

    function showMessage(text, type) {
        messageEl.textContent = text;
        messageEl.className = `message ${type}`;
        messageEl.classList.remove('hidden');
    }

    function triggerFormShake() {
        form.style.animation = 'none';
        setTimeout(() => {
            form.style.animation = 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both';
        }, 10);
    }
});
