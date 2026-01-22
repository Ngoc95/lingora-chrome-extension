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
const googleLoginBtn = document.getElementById('google-login-btn');

// User info elements
const userName = document.getElementById('user-name');
const userEmail = document.getElementById('user-email');
const studySetsCount = document.getElementById('study-sets-count');

// Initialize popup
async function init() {
    // Check if user is logged in
    const authCheck = await chrome.runtime.sendMessage({ action: 'checkAuth' });

    if (authCheck.isAuthenticated) {
        await loadUserData();
        showMainView();
    } else {
        showLoginView();
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
 * Handle Google login
 */
googleLoginBtn.addEventListener('click', () => {
    // Show temporary message
    showError('Vui lòng đăng nhập bằng Email/Username và Mật khẩu. Tính năng Google Login cần cấu hình thêm trên Google Cloud.');
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
