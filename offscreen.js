// Offscreen script to handle audio playback
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'playAudioOffscreen') {
        const audio = new Audio(request.url);
        audio.play()
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ error: error.message }));
        return true; // Keep message channel open
    }
});
