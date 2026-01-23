/**
 * Popup Script for Lingora Chrome Extension
 * Handles login, logout, and user interface
 */

// DOM Elements
const loginView = document.getElementById('login-view');
const mainView = document.getElementById('main-view');
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const loginError = document.getElementById('login-error');

// User info elements
const userName = document.getElementById('user-name');
const userEmail = document.getElementById('user-email');
const studySetsCount = document.getElementById('study-sets-count');

// Update footer links with config URLs when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    // Wait a bit to ensure config.js is loaded
    setTimeout(() => {
        if (!window.LINGORA_CONFIG) {
            console.warn('Lingora: Config not loaded yet, using default URLs');
            return;
        }

        const registerLink = document.querySelector('a[href*="get-started"]');
        const studySetsLink = document.querySelector('.footer-text a[href*="study-sets"]');

        if (registerLink) {
            registerLink.href = window.LINGORA_CONFIG.getWebAppUrl('/get-started');
        }

        if (studySetsLink) {
            studySetsLink.href = window.LINGORA_CONFIG.getWebAppUrl('/study-sets');
        }
    }, 100); // Small delay to ensure config.js loads first
});

// Password toggle functionality
const togglePasswordBtn = document.getElementById('toggle-password');
const passwordInput = document.getElementById('password');
const eyeIcon = document.getElementById('eye-icon');
const eyeOffIcon = document.getElementById('eye-off-icon');

if (togglePasswordBtn) {
    togglePasswordBtn.addEventListener('click', () => {
        const type = passwordInput.type === 'password' ? 'text' : 'password';
        passwordInput.type = type;

        // Toggle icons
        if (type === 'text') {
            eyeIcon.style.display = 'none';
            eyeOffIcon.style.display = 'block';
        } else {
            eyeIcon.style.display = 'block';
            eyeOffIcon.style.display = 'none';
        }
    });
}

// Initialize popup
async function init() {
    try {
        // Check if user is logged in
        const authCheck = await chrome.runtime.sendMessage({ action: 'checkAuth' });

        if (authCheck.isAuthenticated) {
            await loadUserData();
            showMainView();
        } else {
            showLoginView();
        }
    } catch (e) {
        if (e.message.includes('Extension context invalidated')) {
            showError('Extension đã được cập nhật. Vui lòng đóng và mở lại popup này.');
        } else {
            console.error('Init error:', e);
        }
    }
}

/**
 * Show login view
 */
function showLoginView() {
    loginView.style.display = 'block';
    mainView.style.display = 'none';
}

/**
 * Show main view
 */
function showMainView() {
    loginView.style.display = 'none';
    mainView.style.display = 'block';
}

/**
 * Load user data
 */
async function loadUserData() {
    try {
        // Get user info
        const user = await chrome.runtime.sendMessage({ action: 'getCurrentUser' });

        if (user) {
            userName.textContent = user.fullName || user.email;
            userEmail.textContent = user.email;
        }

        // Get study sets count
        const studySets = await chrome.runtime.sendMessage({ action: 'getStudySets' });

        if (studySets && !studySets.error) {
            studySetsCount.textContent = studySets.length;
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

/**
 * Handle login form submission
 */
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const identifier = document.getElementById('identifier').value.trim();
    const password = document.getElementById('password').value;

    if (!identifier || !password) {
        showError('Vui lòng nhập email/username và mật khẩu');
        return;
    }

    // Show loading state
    setLoading(true);
    hideError();

    try {
        const result = await chrome.runtime.sendMessage({
            action: 'login',
            identifier: identifier,
            password: password
        });

        if (result.error) {
            throw new Error(result.error);
        }

        // Login successful
        await loadUserData();
        showMainView();

        // Clear form
        loginForm.reset();

    } catch (error) {
        console.error('Login error:', error);
        showError(error.message || 'Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.');
    } finally {
        setLoading(false);
    }
});

/**
 * Handle logout
 */
logoutBtn.addEventListener('click', async () => {
    try {
        await chrome.runtime.sendMessage({ action: 'logout' });
        showLoginView();
        loginForm.reset();
    } catch (error) {
        console.error('Logout error:', error);
    }
});

/**
 * Handle open web app with auth sync
 */
const openWebAppBtn = document.getElementById('open-webapp-btn');
if (openWebAppBtn) {
    openWebAppBtn.addEventListener('click', async () => {
        try {
            // Get current auth token
            const authCheck = await chrome.runtime.sendMessage({ action: 'checkAuth' });

            // Use centralized config to generate URL
            const webAppUrl = window.LINGORA_CONFIG.getWebAppUrlWithSync(
                '/study-sets',
                authCheck.accessToken
            );

            // Open in new tab
            chrome.tabs.create({ url: webAppUrl });
        } catch (error) {
            console.error('Error opening web app:', error);
        }
    });
}

/**
 * Set loading state
 */
function setLoading(loading) {
    const btnText = loginBtn.querySelector('.btn-text');
    const btnLoading = loginBtn.querySelector('.btn-loading');

    if (loading) {
        btnText.style.display = 'none';
        btnLoading.style.display = 'flex';
        loginBtn.disabled = true;
    } else {
        btnText.style.display = 'block';
        btnLoading.style.display = 'none';
        loginBtn.disabled = false;
    }
}

/**
 * Show error message
 */
function showError(message) {
    loginError.textContent = message;
    loginError.style.display = 'block';
}

/**
 * Hide error message
 */
function hideError() {
    loginError.style.display = 'none';
    loginError.textContent = '';
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
