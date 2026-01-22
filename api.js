/**
 * API Client for Lingora Chrome Extension
 * Handles all communication with the Lingora backend API
 */

const API_CONFIG = {
    // Default to localhost, can be changed via extension settings
    baseURL: 'https://lingora-api.onrender.com' || 'http://localhost:4000',
    timeout: 10000
};

/**
 * Get the API base URL from storage or use default
 */
async function getApiBaseUrl() {
    const result = await chrome.storage.local.get(['apiBaseUrl']);
    return result.apiBaseUrl || API_CONFIG.baseURL;
}

/**
 * Get authentication token from storage
 */
async function getAuthToken() {
    const result = await chrome.storage.local.get(['accessToken']);
    return result.accessToken || null;
}

/**
 * Set authentication token in storage
 */
async function setAuthToken(token) {
    await chrome.storage.local.set({ accessToken: token });
}

/**
 * Clear authentication token from storage
 */
async function clearAuthToken() {
    await chrome.storage.local.remove(['accessToken', 'user']);
}

/**
 * Make an API request
 */
async function apiRequest(endpoint, options = {}) {
    const baseURL = await getApiBaseUrl();
    const token = options.skipAuth ? null : await getAuthToken();

    const url = endpoint.startsWith('http') ? endpoint : `${baseURL}${endpoint}`;

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (token && !options.skipAuth) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const fetchOptions = {
        method: options.method || 'GET',
        headers,
        credentials: 'include',
        ...options
    };

    if (options.body && !(options.body instanceof FormData)) {
        fetchOptions.body = JSON.stringify(options.body);
    }

    try {
        const response = await fetch(url, fetchOptions);

        // Handle 401 Unauthorized
        if (response.status === 401 && !options.skipAuth) {
            // Try to refresh token
            const refreshed = await refreshToken();
            if (refreshed) {
                // Retry the request
                return apiRequest(endpoint, options);
            } else {
                // Refresh failed, clear auth and throw error
                await clearAuthToken();
                throw new Error('Session expired. Please log in again.');
            }
        }

        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            data = text ? { message: text } : {};
        }

        if (!response.ok) {
            throw new Error(data.message || `Request failed with status ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error('API Request Error:', error);
        throw error;
    }
}

/**
 * Refresh authentication token
 */
async function refreshToken() {
    try {
        const baseURL = await getApiBaseUrl();
        const response = await fetch(`${baseURL}/auth/refresh-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            const newToken = data.metaData.accessToken;
            await setAuthToken(newToken);
            return true;
        }
    } catch (error) {
        console.error('Token refresh failed:', error);
    }
    return false;
}

// ============================================================
// API Methods
// ============================================================

const api = {
    /**
     * Login user
     */
    login: async (identifier, password) => {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: { identifier, password },
            skipAuth: true
        });

        if (data.metaData && data.metaData.accessToken) {
            await setAuthToken(data.metaData.accessToken);
            await chrome.storage.local.set({ user: data.metaData.user });
        }

        return data;
    },

    /**
     * Logout user
     */
    logout: async () => {
        try {
            await apiRequest('/auth/logout', { method: 'POST' });
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            await clearAuthToken();
        }
    },

    /**
     * Get current user info
     */
    getCurrentUser: async () => {
        const result = await chrome.storage.local.get(['user']);
        return result.user || null;
    },

    /**
     * Look up a word in the dictionary
     */
    lookupWord: async (term) => {
        const data = await apiRequest(`/words/dictionary?term=${encodeURIComponent(term)}`);
        return data.metaData;
    },

    /**
     * Translate a phrase
     */
    translatePhrase: async (text, sourceLang = 'en', targetLang = 'vi') => {
        const data = await apiRequest('/translate/phrase', {
            method: 'POST',
            body: { text, sourceLang, targetLang }
        });
        return data.metaData;
    },

    /**
     * Get user's own study sets
     */
    getStudySets: async () => {
        const data = await apiRequest('/studysets/own');
        return data.metaData.studySets;
    },

    /**
     * Create a new study set
     */
    createStudySet: async (title, visibility = 'PRIVATE') => {
        const data = await apiRequest('/studysets', {
            method: 'POST',
            body: {
                title,
                visibility,
                flashcards: [],
                quizzes: []
            }
        });
        return data.metaData;
    },

    /**
     * Add flashcard to a study set
     */
    addFlashcard: async (studySetId, flashcardData) => {
        const data = await apiRequest(`/studysets/${studySetId}/flashcards`, {
            method: 'POST',
            body: flashcardData
        });
        return data.metaData;
    },

    /**
     * Upload image (if needed)
     */
    uploadImage: async (file) => {
        const formData = new FormData();
        formData.append('image', file);

        const data = await apiRequest('/uploads/image', {
            method: 'POST',
            body: formData,
            headers: {} // Let browser set Content-Type for FormData
        });
        return data.metaData;
    }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
}
