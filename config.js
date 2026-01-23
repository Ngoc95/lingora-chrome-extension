/**
 * Configuration file for Lingora Chrome Extension
 * 
 * IMPORTANT: This is the ONLY file you need to edit to switch between environments
 * Change ENVIRONMENT to 'localhost' or 'production' as needed
 */

// ============================================================
// ENVIRONMENT CONFIGURATION
// ============================================================
// Change this value to switch between environments:
// - 'localhost': For local development (http://localhost:3000)
// - 'production': For deployed version (https://lingora-web-app.vercel.app)

const ENVIRONMENT = 'production'; // <-- CHANGE THIS VALUE ONLY

// ============================================================
// AUTO-GENERATED CONFIGURATION (DO NOT EDIT BELOW)
// ============================================================

const CONFIG = {
    environment: ENVIRONMENT,

    // Web app base URLs
    webApp: {
        baseUrl: ENVIRONMENT === 'localhost'
            ? 'http://localhost:3000'
            : 'https://lingora-web-app.vercel.app',

        // Common paths
        paths: {
            studySets: '/study-sets',
            getStarted: '/get-started',
            vocabulary: '/vocabulary',
            forum: '/forum',
            profile: '/profile'
        }
    },

    // Backend API URL
    backend: {
        baseUrl: ENVIRONMENT === 'localhost'
            ? 'http://localhost:4000'
            : 'https://lingora-be-dxce.onrender.com'
    },

    // Helper function to generate full URLs
    getWebAppUrl: function (path = '/study-sets') {
        return `${this.webApp.baseUrl}${path}`;
    },

    // Helper function to generate URLs with syncToken
    getWebAppUrlWithSync: function (path = '/study-sets', accessToken = null) {
        const url = this.getWebAppUrl(path);

        if (accessToken) {
            const separator = path.includes('?') ? '&' : '?';
            return `${url}${separator}syncToken=${accessToken}`;
        }

        return url;
    },

    // Helper function to get backend URL
    getBackendUrl: function () {
        return this.backend.baseUrl;
    }
};

// Make CONFIG available globally (works in both browser and extension contexts)
if (typeof window !== 'undefined') {
    window.LINGORA_CONFIG = CONFIG;
}

// Also make it available as a global variable
if (typeof globalThis !== 'undefined') {
    globalThis.LINGORA_CONFIG = CONFIG;
}
