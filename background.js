/**
 * Background Service Worker for Lingora Chrome Extension
 * Handles API communication and message passing between content scripts and popup
 */

// Import API client (in Manifest V3, we need to use importScripts)
importScripts('config.js');
importScripts('api.js');

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Handle async operations
    handleMessage(request, sender).then(sendResponse);
    return true; // Keep the message channel open for async response
});

/**
 * Handle messages from content scripts and popup
 */
async function handleMessage(request, sender) {
    try {
        switch (request.action) {
            case 'lookupWord':
                return await api.lookupWord(request.term);

            case 'translatePhrase':
                return await api.translatePhrase(request.text, request.sourceLang, request.targetLang);

            case 'getStudySets':
                return await api.getStudySets();

            case 'createStudySet':
                return await api.createStudySet(request.title, request.visibility);

            case 'addFlashcard':
                return await api.addFlashcard(request.studySetId, request.flashcardData);

            case 'login':
                return await api.login(request.identifier, request.password);

            case 'googleLogin':
                return await api.googleLogin(request.idToken);

            case 'uploadImage':
                const bytes = new Uint8Array(request.fileData);
                const blob = new Blob([bytes], { type: request.fileType });
                const file = new File([blob], request.fileName, { type: request.fileType });
                return await api.uploadImage(file);

            case 'logout':
                return await api.logout();

            case 'getCurrentUser':
                return await api.getCurrentUser();

            case 'checkAuth':
                const result = await chrome.storage.local.get(['accessToken', 'user']);
                return {
                    isAuthenticated: !!result.accessToken,
                    accessToken: result.accessToken || null,
                    user: result.user || null
                };

            case 'syncAuth':
                if (request.accessToken) {
                    await chrome.storage.local.set({
                        accessToken: request.accessToken,
                        user: request.user
                    });
                    console.log('Lingora: Auth synced from web app');
                } else {
                    await chrome.storage.local.remove(['accessToken', 'user']);
                    console.log('Lingora: Auth cleared from web app');
                }
                return { success: true };

            case 'openPopup':
                // Open extension popup programmatically
                chrome.action.openPopup();
                return { success: true };

            case 'playAudio':
                if (request.url) {
                    await playAudio(request.url);
                    return { success: true };
                }
                return { error: 'No URL provided' };

            default:
                throw new Error(`Unknown action: ${request.action}`);
        }
    } catch (error) {
        console.error('Background script error:', error);
        return { error: error.message };
    }
}

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Lingora Extension installed');
        // Open welcome page or popup
        chrome.action.openPopup();
    } else if (details.reason === 'update') {
        console.log('Lingora Extension updated');
    }
});

/**
 * Play audio using offscreen document
 */
async function playAudio(url) {
    // Check if offscreen document already exists
    const contexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (contexts.length === 0) {
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['AUDIO_PLAYBACK'],
            justification: 'Play word pronunciation'
        });
    }

    // Send audio URL to offscreen document
    chrome.runtime.sendMessage({
        action: 'playAudioOffscreen',
        url: url
    });
}

// Keep service worker alive
chrome.runtime.onStartup.addListener(() => {
    console.log('Lingora Extension started');
});
