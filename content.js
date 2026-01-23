/**
 * Content Script for Lingora Chrome Extension
 * Detects text selection and shows dictionary lookup button
 */

let selectionButton = null;
let dictionaryPopup = null;
let selectedText = '';

// Initialize content script
function init() {
    console.log('Lingora: Content Script Initialized on', window.location.href);

    // Listen for text selection
    document.addEventListener('mouseup', handleTextSelection);
    document.addEventListener('dblclick', handleDoubleClick);

    // Listen for clicks outside to hide button/popup
    document.addEventListener('mousedown', handleClickOutside);

    // Sync authentication state with web app
    syncAuthWithWebApp();
}

/**
 * Generate web app URL with syncToken parameter
 * Uses centralized config from config.js
 * @param {string} path - The path on the web app (e.g., '/study-sets', '/vocabulary')
 * @param {string} accessToken - The access token to sync
 * @returns {string} Complete URL with syncToken parameter
 */
function generateWebAppUrl(path = '/study-sets', accessToken = null) {
    return window.LINGORA_CONFIG.getWebAppUrlWithSync(path, accessToken);
}


/**
 * Sync authentication state with the Lingora web app
 */
async function syncAuthWithWebApp() {
    const isLocalhost = window.location.hostname === 'localhost' && window.location.port === '3000';
    const isVercel = window.location.hostname === 'lingora-web-app.vercel.app';
    const isLingoraDomain = isLocalhost || isVercel;

    if (!isLingoraDomain) return;

    console.log('Lingora: Detected web app domain, starting auth sync...');

    // 1. Inject script to read/write page's localStorage
    const script = document.createElement('script');
    script.textContent = `
        (function() {
            function getAuthState() {
                try {
                    const accessToken = localStorage.getItem('accessToken');
                    const authStorage = JSON.parse(localStorage.getItem('auth-storage') || '{}');
                    return {
                        accessToken: accessToken,
                        user: authStorage.state ? authStorage.state.user : null
                    };
                } catch (e) {
                    return null;
                }
            }

            function setAuthState(data) {
                if (data.accessToken) {
                    localStorage.setItem('accessToken', data.accessToken);
                    const authStorage = {
                        state: {
                            user: data.user,
                            isAuthenticated: true,
                            activeRole: data.user && data.user.roles && data.user.roles[0] ? data.user.roles[0].name : null,
                            isLoading: false,
                            error: null
                        },
                        version: 0
                    };
                    localStorage.setItem('auth-storage', JSON.stringify(authStorage));
                    window.location.reload(); // Refresh to apply changes to React state
                }
            }

            // Listen for requests from content script
            window.addEventListener('message', function(event) {
                if (event.data.type === 'LINGORA_GET_WEB_AUTH') {
                    window.postMessage({ type: 'LINGORA_WEB_AUTH_DATA', data: getAuthState() }, '*');
                } else if (event.data.type === 'LINGORA_SET_WEB_AUTH') {
                    setAuthState(event.data.data);
                }
            });

            // Initial report
            window.postMessage({ type: 'LINGORA_WEB_AUTH_DATA', data: getAuthState() }, '*');
            
            // Watch for storage changes
            window.addEventListener('storage', function(e) {
                if (e.key === 'accessToken' || e.key === 'auth-storage') {
                    window.postMessage({ type: 'LINGORA_WEB_AUTH_DATA', data: getAuthState() }, '*');
                }
            });
        })();
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();

    // 2. Listen for data from injected script
    window.addEventListener('message', async (event) => {
        if (event.data.type === 'LINGORA_WEB_AUTH_DATA') {
            const webAuth = event.data.data;
            try {
                const extAuth = await chrome.runtime.sendMessage({ action: 'checkAuth' });

                if (webAuth && webAuth.accessToken) {
                    // If web app is logged in but extension is not, or has different user
                    if (!extAuth.isAuthenticated || extAuth.accessToken !== webAuth.accessToken) {
                        console.log('Lingora: Adoption of web app auth state');
                        await chrome.runtime.sendMessage({
                            action: 'syncAuth',
                            accessToken: webAuth.accessToken,
                            user: webAuth.user
                        });
                    }
                } else if (extAuth.isAuthenticated && (!webAuth || !webAuth.accessToken)) {
                    // Extension is logged in but web app is not -> Sync to web app
                    console.log('Lingora: Push auth state to web app');
                    window.postMessage({
                        type: 'LINGORA_SET_WEB_AUTH',
                        data: { accessToken: extAuth.accessToken, user: extAuth.user }
                    }, '*');
                }

                // Check if web app logged out while extension is still logged in
                if (extAuth.isAuthenticated && webAuth && !webAuth.accessToken) {
                    console.log('Lingora: Web app logged out, syncing logout to extension');
                    await chrome.runtime.sendMessage({ action: 'syncAuth', accessToken: null });
                }
            } catch (e) {
                if (e.message && e.message.includes('Extension context invalidated')) {
                    console.log('Lingora: Extension updated, please refresh the page.');
                }
            }
        } else if (event.data.type === 'LINGORA_INVALID_TOKEN') {
            // Web app detected invalid token from extension, logout extension
            console.log('Lingora: Web app detected invalid token, logging out extension');
            try {
                await chrome.runtime.sendMessage({ action: 'syncAuth', accessToken: null });
                console.log('Lingora: Extension logged out successfully');
            } catch (e) {
                console.error('Lingora: Failed to logout extension:', e);
            }
        }
    });
}

/**
 * Handle text selection (mouse drag)
 */
function handleTextSelection(event) {
    // Small delay to ensure selection is complete
    setTimeout(() => {
        const selection = window.getSelection();
        const text = selection.toString().trim();

        if (text.length > 0 && text.length <= 100) { // Limit to reasonable length
            console.log('Lingora: Text selected:', text);
            selectedText = text;
            try {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                showSelectionButton(rect.right + window.scrollX, rect.top + window.scrollY);
            } catch (e) {
                console.error('Lingora: Error getting selection rect', e);
                showSelectionButton(event.pageX, event.pageY);
            }
        } else {
            hideSelectionButton();
        }
    }, 10);
}

/**
 * Handle double-click on a word
 */
function handleDoubleClick(event) {
    const selection = window.getSelection();
    const text = selection.toString().trim();

    if (text.length > 0 && text.length <= 50) {
        console.log('Lingora: Double click detected:', text);
        selectedText = text;
        try {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            showSelectionButton(rect.right + window.scrollX, rect.top + window.scrollY);
        } catch (e) {
            showSelectionButton(event.pageX, event.pageY);
        }
    }
}

/**
 * Show the selection button near the cursor
 */
function showSelectionButton(x, y) {
    // Remove existing button if any
    hideSelectionButton();

    // Create button
    selectionButton = document.createElement('div');
    selectionButton.id = 'lingora-selection-button';
    selectionButton.className = 'lingora-selection-btn';
    selectionButton.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>
  `;
    selectionButton.title = 'Tra cứu từ điển';

    // Position the button
    selectionButton.style.left = `${x + 10}px`;
    selectionButton.style.top = `${y - 40}px`;

    // Add click handler
    selectionButton.addEventListener('click', (e) => {
        e.stopPropagation();
        lookupWord(selectedText);
    });

    document.body.appendChild(selectionButton);
}

/**
 * Hide the selection button
 */
function hideSelectionButton() {
    if (selectionButton) {
        selectionButton.remove();
        selectionButton = null;
    }
}

/**
 * Handle clicks outside the button and popup
 */
function handleClickOutside(event) {
    // Hide selection button if clicked outside
    if (selectionButton && !selectionButton.contains(event.target)) {
        hideSelectionButton();
    }

    // Hide dictionary popup if clicked outside
    if (dictionaryPopup && !dictionaryPopup.contains(event.target)) {
        hideDictionaryPopup();
        hideSelectionButton();
    }
}

/**
 * Look up a word in the dictionary
 */
async function lookupWord(term) {
    try {
        // Check if chrome.runtime is available
        if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
            showErrorPopup('Extension bị lỗi. Vui lòng tải lại trang (F5) hoặc reload extension.');
            console.error('Lingora: chrome.runtime is not available');
            return;
        }

        // Show loading state
        showLoadingPopup();

        // Check if user is authenticated
        let authCheck;
        try {
            authCheck = await chrome.runtime.sendMessage({ action: 'checkAuth' });
        } catch (e) {
            if (e.message && e.message.includes('Extension context invalidated')) {
                showErrorPopup('Extension đã được cập nhật. Vui lòng tải lại trang (nhấn F5) để tiếp tục sử dụng.');
                return;
            }
            // Check if it's a runtime error
            if (!chrome.runtime || !chrome.runtime.id) {
                showErrorPopup('Extension bị lỗi. Vui lòng reload extension và tải lại trang.');
                return;
            }
            throw e;
        }

        if (!authCheck || !authCheck.isAuthenticated) {
            showLoginPromptPopup();
            return;
        }

        // Determine if it's a single word or phrase
        const isPhrase = term.split(' ').length > 1;

        let wordData;
        if (isPhrase) {
            // Use translation API for phrases
            const translation = await chrome.runtime.sendMessage({
                action: 'translatePhrase',
                text: term
            });

            if (translation.error) {
                throw new Error(translation.error);
            }

            // Convert translation to word-like format
            wordData = {
                word: translation.originalText,
                meaning: translation.translatedText,
                vnMeaning: translation.translatedText,
                type: 'PHRASE',
                isPhrase: true
            };
        } else {
            // Use dictionary API for single words
            wordData = await chrome.runtime.sendMessage({
                action: 'lookupWord',
                term: term
            });

            if (wordData.error) {
                throw new Error(wordData.error);
            }
        }

        // Show dictionary popup with word data
        await showDictionaryPopup(wordData);

    } catch (error) {
        console.error('Lookup error:', error);
        showErrorPopup(error.message || 'Không thể tra cứu từ này. Vui lòng thử lại.');
    }
}

/**
 * Show loading popup
 */
function showLoadingPopup() {
    hideDictionaryPopup();

    dictionaryPopup = document.createElement('div');
    dictionaryPopup.id = 'lingora-dictionary-popup';
    dictionaryPopup.className = 'lingora-popup';
    dictionaryPopup.innerHTML = `
    <div class="lingora-popup-content">
      <div class="lingora-loading">
        <div class="lingora-spinner"></div>
        <p>Đang tra cứu...</p>
      </div>
    </div>
  `;

    positionPopup();
    document.body.appendChild(dictionaryPopup);
}

/**
 * Show error popup
 */
function showErrorPopup(message) {
    hideDictionaryPopup();

    dictionaryPopup = document.createElement('div');
    dictionaryPopup.id = 'lingora-dictionary-popup';
    dictionaryPopup.className = 'lingora-popup';
    dictionaryPopup.innerHTML = `
    <div class="lingora-popup-content">
      <div class="lingora-error">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <p>${message}</p>
        <button class="lingora-btn-close">Đóng</button>
      </div>
    </div>
  `;

    positionPopup();
    document.body.appendChild(dictionaryPopup);

    // Add close button handler
    dictionaryPopup.querySelector('.lingora-btn-close').addEventListener('click', hideDictionaryPopup);
}

/**
 * Show login prompt popup with button to open extension
 */
function showLoginPromptPopup() {
    hideDictionaryPopup();

    dictionaryPopup = document.createElement('div');
    dictionaryPopup.id = 'lingora-dictionary-popup';
    dictionaryPopup.className = 'lingora-popup';
    dictionaryPopup.innerHTML = `
    <div class="lingora-popup-content">
      <div class="lingora-error">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <p>Vui lòng đăng nhập để sử dụng tính năng này.</p>
        <button class="lingora-btn-login" style="background: #10b981; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 600; margin-top: 12px;">
          Đăng nhập
        </button>
        <button class="lingora-btn-close" style="margin-top: 8px;">Đóng</button>
      </div>
    </div>
  `;

    positionPopup();
    document.body.appendChild(dictionaryPopup);

    // Add login button handler - opens extension popup
    dictionaryPopup.querySelector('.lingora-btn-login').addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'openPopup' });
        hideDictionaryPopup();
        hideSelectionButton();
    });

    // Add close button handler
    dictionaryPopup.querySelector('.lingora-btn-close').addEventListener('click', hideDictionaryPopup);
}

/**
 * Show dictionary popup with word data
 */
async function showDictionaryPopup(wordData) {
    hideDictionaryPopup();

    dictionaryPopup = document.createElement('div');
    dictionaryPopup.id = 'lingora-dictionary-popup';
    dictionaryPopup.className = 'lingora-popup';

    // Build popup HTML
    let html = `
    <div class="lingora-popup-content">
      <div class="lingora-popup-header">
        <div class="lingora-word-info">
          <h3>${wordData.word}</h3>
          ${wordData.type && wordData.type !== 'UNKNOWN' ? `<span class="lingora-type-tag">${formatWordType(wordData.type)}</span>` : ''}
        </div>
        <button class="lingora-close-btn" title="Đóng">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      
      <div class="lingora-popup-body">
  `;

    // Phonetic
    if (wordData.phonetic) {
        html += `<div class="lingora-phonetic">${wordData.phonetic}</div>`;
    }

    // Audio
    if (wordData.audioUrl) {
        html += `
      <button class="lingora-audio-btn" data-audio="${wordData.audioUrl}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
        Phát âm
      </button>
    `;
    }

    // Meaning
    if (wordData.meaning) {
        html += `<div class="lingora-meaning"><strong>Nghĩa:</strong> ${wordData.meaning}</div>`;
    }

    // Vietnamese meaning
    if (wordData.vnMeaning && wordData.vnMeaning !== wordData.meaning) {
        html += `<div class="lingora-vn-meaning"><strong>Tiếng Việt:</strong> ${wordData.vnMeaning}</div>`;
    }

    // Example
    if (wordData.example) {
        html += `<div class="lingora-example"><strong>Ví dụ:</strong> <em>${wordData.example}</em></div>`;
    }

    // Image
    if (wordData.imageUrl) {
        html += `<img src="${wordData.imageUrl}" alt="${wordData.word}" class="lingora-image" />`;
    }

    const authCheck = await chrome.runtime.sendMessage({ action: 'checkAuth' });
    const webAppUrl = generateWebAppUrl('/study-sets', authCheck.accessToken);

    html += `
      </div>
      
      <div class="lingora-popup-footer" style="flex-direction: column; gap: 8px;">
        <button class="lingora-save-btn" id="lingora-save-flashcard" style="width: 100%;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
          </svg>
          Lưu vào bộ học liệu
        </button>
        <a href="${webAppUrl}" target="_blank" class="lingora-webapp-link">Mở trang bộ học liệu</a>
      </div>
    </div>
  `;

    dictionaryPopup.innerHTML = html;
    positionPopup();
    document.body.appendChild(dictionaryPopup);

    // Add event listeners
    dictionaryPopup.querySelector('.lingora-close-btn').addEventListener('click', hideDictionaryPopup);

    // Audio button
    const audioBtn = dictionaryPopup.querySelector('.lingora-audio-btn');
    if (audioBtn) {
        audioBtn.addEventListener('click', async () => {
            try {
                // Use background script to play audio (bypasses CSP on sites like Facebook)
                chrome.runtime.sendMessage({
                    action: 'playAudio',
                    url: audioBtn.dataset.audio
                });
            } catch (e) {
                console.error('Lingora: Audio playback failed', e);
            }
        });
    }

    // Save button
    dictionaryPopup.querySelector('#lingora-save-flashcard').addEventListener('click', () => {
        showEditFlashcardDialog(wordData);
    });
}

/**
 * Position popup in the center of the viewport
 */
function positionPopup() {
    if (!dictionaryPopup) return;

    // Position in center of viewport
    dictionaryPopup.style.position = 'fixed';
    dictionaryPopup.style.top = '50%';
    dictionaryPopup.style.left = '50%';
    dictionaryPopup.style.transform = 'translate(-50%, -50%)';
    dictionaryPopup.style.zIndex = '2147483647'; // Maximum z-index
}

/**
 * Hide dictionary popup
 */
function hideDictionaryPopup() {
    if (dictionaryPopup) {
        dictionaryPopup.remove();
        dictionaryPopup = null;
    }
}

/**
 * Show integrated edit & save flashcard view
 */
/**
 * Show integrated edit & save flashcard view (Premium Redesign)
 */
async function showEditFlashcardDialog(wordData) {
    const originalContent = dictionaryPopup.innerHTML;

    // Loading State
    dictionaryPopup.innerHTML = `
        <div class="lingora-popup-content">
            <div class="lingora-popup-header"><h3>Đang chuẩn bị...</h3></div>
            <div class="lingora-popup-body"><div class="lingora-loading"><div class="lingora-spinner"></div></div></div>
        </div>
    `;

    try {
        const studySets = await chrome.runtime.sendMessage({ action: 'getStudySets' });
        if (studySets.error) throw new Error(studySets.error);

        let selectedSetId = studySets.length > 0 ? studySets[0].id : null;
        let selectedSetName = studySets.length > 0 ? studySets[0].title : 'Chọn bộ...';

        const renderDropdownList = (sets, filter = '') => {
            const filtered = sets.filter(s => s.title.toLowerCase().includes(filter.toLowerCase()));
            let html = `
                <div class="lingora-dropdown-item new-set-option" id="dropdown-create-new">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Tạo bộ học liệu mới
                </div>
            `;
            filtered.forEach(set => {
                html += `<div class="lingora-dropdown-item" data-id="${set.id}">${set.title}</div>`;
            });
            if (filtered.length === 0 && filter) {
                html += `<div class="lingora-dropdown-no-results">Không tìm thấy kết quả</div>`;
            }
            return html;
        };

        dictionaryPopup.innerHTML = `
            <div class="lingora-popup-content lingora-compact-form">
                <div class="lingora-popup-header">
                    <div class="lingora-word-info">
                        <h3 class="lingora-mini-title">Lưu Flashcard</h3>
                    </div>
                    <button class="lingora-close-btn" id="edit-cancel-btn">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                
                <div class="lingora-popup-body">
                    <div class="lingora-form-field">
                        <label>Mặt trước</label>
                        <input type="text" id="edit-front" value="${wordData.word}" />
                    </div>

                    <div class="lingora-form-field">
                        <label>Mặt sau (Nghĩa)</label>
                        <textarea id="edit-back" rows="2">${wordData.meaning || wordData.vnMeaning || ''}</textarea>
                    </div>

                    <div class="lingora-form-field">
                        <label>Ví dụ</label>
                        <textarea id="edit-example" rows="2">${wordData.example || ''}</textarea>
                    </div>

                    <div class="lingora-image-upload-compact">
                        <div class="lingora-preview-box">
                            ${wordData.imageUrl ? `<img src="${wordData.imageUrl}" id="edit-preview" />` : '<div class="no-img">No Img</div>'}
                        </div>
                        <div class="lingora-upload-actions">
                            <label>HÌNH ẢNH</label>
                            <div class="lingora-actions-row">
                                <input type="file" id="edit-image-file" accept="image/*" style="display:none" />
                                <button class="lingora-upload-icon-btn" id="upload-trigger">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                        <polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line>
                                    </svg>
                                </button>
                                <input type="text" id="edit-image-url" value="${wordData.imageUrl || ''}" placeholder="Dán link ảnh..." />
                            </div>
                        </div>
                    </div>

                    <div class="lingora-form-field" style="margin-top:10px">
                        <label>BỘ HỌC LIỆU</label>
                        <div class="lingora-premium-dropdown" id="set-dropdown">
                            <div class="lingora-dropdown-trigger" id="dropdown-trigger">
                                <span>${selectedSetName}</span>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M6 9l6 6 6-6"></path>
                                </svg>
                            </div>
                            <div class="lingora-dropdown-content" id="dropdown-content">
                                <div class="lingora-dropdown-search-wrapper">
                                    <input type="text" id="dropdown-search" placeholder="Tìm bộ học liệu..." autocomplete="off" />
                                </div>
                                <div class="lingora-dropdown-list" id="dropdown-list">
                                    ${renderDropdownList(studySets)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="lingora-popup-footer" id="new-set-form" style="display:none; padding:10px 16px;">
                    <label style="font-size:10px; color:#6b7280; font-weight:700">TẠO BỘ MỚI</label>
                    <input type="text" id="new-set-title" placeholder="Tên bộ học liệu..." />
                    <div style="display:flex; gap:6px">
                        <button class="lingora-minor-btn" id="cancel-new-set">Hủy</button>
                        <button class="lingora-save-btn" id="confirm-new-set">Tạo & Lưu</button>
                    </div>
                </div>
                
                <div class="lingora-popup-footer" id="main-actions-footer" style="display: flex; flex-direction: row; justify-content: flex-end; align-items: center; gap: 12px;">
                    <button class="lingora-link-btn" id="back-to-dict" style="margin-right: auto;">Quay lại tra từ</button>
                    <button class="lingora-save-btn" id="final-save-btn" style="width: auto;">Lưu flashcard</button>
                </div>
            </div>
        `;

        // Logic Elements
        const fileInput = dictionaryPopup.querySelector('#edit-image-file');
        const uploadTrigger = dictionaryPopup.querySelector('#upload-trigger');
        const urlInput = dictionaryPopup.querySelector('#edit-image-url');
        const previewBox = dictionaryPopup.querySelector('.lingora-preview-box');
        const dropdown = dictionaryPopup.querySelector('#set-dropdown');
        const trigger = dictionaryPopup.querySelector('#dropdown-trigger');
        const menu = dictionaryPopup.querySelector('#dropdown-content');
        const searchInput = dictionaryPopup.querySelector('#dropdown-search');
        const listContainer = dictionaryPopup.querySelector('#dropdown-list');
        const finalSaveBtn = dictionaryPopup.querySelector('#final-save-btn');
        const newSetForm = dictionaryPopup.querySelector('#new-set-form');
        const mainFooter = dictionaryPopup.querySelector('#main-actions-footer');

        // Dropdown Logic
        trigger.onclick = (e) => {
            e.stopPropagation();
            const isOpen = dropdown.classList.toggle('active');
            if (isOpen) {
                searchInput.value = '';
                listContainer.innerHTML = renderDropdownList(studySets);
                attachItemListeners();
                searchInput.focus();
            }
        };

        const attachItemListeners = () => {
            listContainer.querySelectorAll('.lingora-dropdown-item').forEach(item => {
                item.onclick = (e) => {
                    e.stopPropagation();
                    if (item.id === 'dropdown-create-new') {
                        dropdown.classList.remove('active');
                        newSetForm.style.display = 'block';
                        mainFooter.style.display = 'none';
                        dictionaryPopup.querySelector('#new-set-title').focus();
                        return;
                    }
                    selectedSetId = item.dataset.id;
                    selectedSetName = item.textContent;
                    trigger.querySelector('span').textContent = selectedSetName;
                    dropdown.classList.remove('active');
                };
            });
        };

        searchInput.oninput = (e) => {
            listContainer.innerHTML = renderDropdownList(studySets, e.target.value);
            attachItemListeners();
        };

        // Close dropdown when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (dropdown && !dropdown.contains(e.target)) {
                dropdown.classList.remove('active');
            }
        }, { once: true });

        // Image Logic
        uploadTrigger.onclick = () => fileInput.click();
        fileInput.onchange = (e) => {
            if (e.target.files?.[0]) {
                const file = e.target.files[0];
                urlInput.value = '';
                const reader = new FileReader();
                reader.onload = (re) => {
                    previewBox.innerHTML = `<img src="${re.target.result}" />`;
                };
                reader.readAsDataURL(file);
            }
        };

        urlInput.oninput = (e) => {
            const url = e.target.value.trim();
            if (url) {
                fileInput.value = '';
                previewBox.innerHTML = `<img src="${url}" />`;
            } else {
                previewBox.innerHTML = '<div class="no-img">No Img</div>';
            }
        };

        // Footer Actions
        dictionaryPopup.querySelector('#edit-cancel-btn').onclick = hideDictionaryPopup;
        dictionaryPopup.querySelector('#back-to-dict').onclick = () => {
            dictionaryPopup.innerHTML = originalContent;
            dictionaryPopup.querySelector('.lingora-close-btn').onclick = hideDictionaryPopup;
            dictionaryPopup.querySelector('#lingora-save-flashcard').onclick = () => showEditFlashcardDialog(wordData);
            const audioBtn = dictionaryPopup.querySelector('.lingora-audio-btn');
            if (audioBtn) audioBtn.onclick = () => chrome.runtime.sendMessage({ action: 'playAudio', url: audioBtn.dataset.audio });
        };

        dictionaryPopup.querySelector('#cancel-new-set').onclick = () => {
            newSetForm.style.display = 'none';
            mainFooter.style.display = 'flex';
        };

        const processSave = async (setId) => {
            finalSaveBtn.disabled = true;
            finalSaveBtn.textContent = '...';
            try {
                let finalImageUrl = urlInput.value.trim();
                if (fileInput.files?.[0]) {
                    const file = fileInput.files[0];
                    const arrayBuffer = await file.arrayBuffer();
                    const upRes = await chrome.runtime.sendMessage({
                        action: 'uploadImage',
                        fileData: Array.from(new Uint8Array(arrayBuffer)),
                        fileName: file.name,
                        fileType: file.type
                    });
                    if (upRes.error) throw new Error(upRes.error);
                    finalImageUrl = upRes.imageUrl;
                }
                const finalData = {
                    ...wordData,
                    word: dictionaryPopup.querySelector('#edit-front').value.trim(),
                    meaning: dictionaryPopup.querySelector('#edit-back').value.trim(),
                    example: dictionaryPopup.querySelector('#edit-example').value.trim(),
                    imageUrl: finalImageUrl
                };
                await saveFlashcard(setId, finalData);
            } catch (err) {
                alert('Lỗi: ' + err.message);
                finalSaveBtn.disabled = false;
                finalSaveBtn.textContent = 'Lưu';
            }
        };

        finalSaveBtn.onclick = () => {
            if (!selectedSetId) return alert('Vui lòng chọn bộ học liệu');
            processSave(parseInt(selectedSetId));
        };

        dictionaryPopup.querySelector('#confirm-new-set').onclick = async () => {
            const title = dictionaryPopup.querySelector('#new-set-title').value.trim();
            if (!title) return alert('Vui lòng nhập tên bộ');
            const btn = dictionaryPopup.querySelector('#confirm-new-set');
            btn.disabled = true;
            try {
                const newSet = await chrome.runtime.sendMessage({ action: 'createStudySet', title, visibility: 'PRIVATE' });
                if (newSet.error) throw new Error(newSet.error);
                await processSave(newSet.id);
            } catch (err) {
                alert(err.message);
                btn.disabled = false;
            }
        };

    } catch (err) {
        alert('Lỗi: ' + err.message);
        hideDictionaryPopup();
    }
}


/**
 * Save flashcard to study set
 */
async function saveFlashcard(studySetId, wordData) {
    try {
        const flashcardData = {
            frontText: wordData.word,
            backText: wordData.meaning || wordData.vnMeaning || '',
            example: wordData.example || undefined,
            audioUrl: wordData.audioUrl || undefined,
            imageUrl: wordData.imageUrl || undefined
        };

        const result = await chrome.runtime.sendMessage({
            action: 'addFlashcard',
            studySetId: studySetId,
            flashcardData: flashcardData
        });

        if (result.error) {
            throw new Error(result.error);
        }

        // Show success message
        showSuccessMessage('Đã lưu từ vào bộ học liệu!');

        // Hide popup after a delay
        setTimeout(() => {
            hideDictionaryPopup();
            hideSelectionButton();
        }, 1500);

    } catch (error) {
        console.error('Error saving flashcard:', error);
        alert('Không thể lưu từ vào bộ học liệu. Vui lòng thử lại.');
    }
}

/**
 * Show success message
 */
function showSuccessMessage(message) {
    const successMsg = document.createElement('div');
    successMsg.className = 'lingora-success-message';
    successMsg.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
    <span>${message}</span>
  `;

    document.body.appendChild(successMsg);

    // Remove after animation
    setTimeout(() => {
        successMsg.remove();
    }, 3000);
}

/**
 * Format word type for display
 */
function formatWordType(type) {
    const typeMap = {
        'NOUN': 'Danh từ',
        'VERB': 'Động từ',
        'ADJECTIVE': 'Tính từ',
        'ADVERB': 'Trạng từ',
        'PREPOSITION': 'Giới từ',
        'CONJUNCTION': 'Liên từ',
        'INTERJECTION': 'Thán từ',
        'PRONOUN': 'Đại từ',
        'DETERMINER': 'Từ hạn định',
        'ARTICLE': 'Mạo từ',
        'NUMERAL': 'Số từ',
        'PHRASE': 'Cụm từ'
    };

    return typeMap[type] || type;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
