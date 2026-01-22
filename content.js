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
 * Sync authentication state with the Lingora web app
 */
async function syncAuthWithWebApp() {
    const isLingoraDomain = window.location.hostname === 'localhost' && window.location.port === '3000';
    // Add production domain here later

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
            } else if (!webAuth || !webAuth.accessToken) {
                // Both logged out or web app logged out
                if (extAuth.isAuthenticated) {
                    // This could be a logout on the web app -> sync logout to extension
                    console.log('Lingora: Syncing logout from web app');
                    await chrome.runtime.sendMessage({ action: 'syncAuth', accessToken: null });
                }
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
    // Check if click is outside button and popup
    if (selectionButton && !selectionButton.contains(event.target)) {
        if (!dictionaryPopup || !dictionaryPopup.contains(event.target)) {
            hideSelectionButton();
            hideDictionaryPopup();
        }
    }
}

/**
 * Look up a word in the dictionary
 */
async function lookupWord(term) {
    try {
        // Show loading state
        showLoadingPopup();

        // Check if user is authenticated
        const authCheck = await chrome.runtime.sendMessage({ action: 'checkAuth' });

        if (!authCheck.isAuthenticated) {
            showErrorPopup('Vui lòng đăng nhập để sử dụng tính năng này.');
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
        showDictionaryPopup(wordData);

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
 * Show dictionary popup with word data
 */
function showDictionaryPopup(wordData) {
    hideDictionaryPopup();

    dictionaryPopup = document.createElement('div');
    dictionaryPopup.id = 'lingora-dictionary-popup';
    dictionaryPopup.className = 'lingora-popup';

    // Build popup HTML
    let html = `
    <div class="lingora-popup-content">
      <div class="lingora-popup-header">
        <h3>${wordData.word}</h3>
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
        html += `<div class="lingora-phonetic">/${wordData.phonetic}/</div>`;
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

    // Type
    if (wordData.type && wordData.type !== 'UNKNOWN') {
        html += `<div class="lingora-type">${formatWordType(wordData.type)}</div>`;
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

    html += `
      </div>
      
      <div class="lingora-popup-footer">
        <button class="lingora-save-btn" id="lingora-save-flashcard">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
            <polyline points="17 21 17 13 7 13 7 21"></polyline>
            <polyline points="7 3 7 8 15 8"></polyline>
          </svg>
          Lưu vào bộ học liệu
        </button>
        <a href="https://lingora-web-app.vercel.app/study-sets" target="_blank" class="lingora-webapp-link">Mở trang bộ học liệu</a>
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
        audioBtn.addEventListener('click', () => {
            const audio = new Audio(audioBtn.dataset.audio);
            audio.play();
        });
    }

    // Save button
    dictionaryPopup.querySelector('#lingora-save-flashcard').addEventListener('click', () => {
        showSaveDialog(wordData);
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
 * Show save to study set dialog
 */
async function showSaveDialog(wordData) {
    try {
        // Get user's study sets
        const studySets = await chrome.runtime.sendMessage({ action: 'getStudySets' });

        if (studySets.error) {
            throw new Error(studySets.error);
        }

        // Create save dialog
        const saveDialog = document.createElement('div');
        saveDialog.className = 'lingora-save-dialog';

        const renderStudySets = (sets, filter = '') => {
            const filtered = sets.filter(s => s.title.toLowerCase().includes(filter.toLowerCase()));
            let html = `
                <button class="lingora-study-set-item new-set" data-id="new">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Tạo bộ học liệu mới
                </button>
            `;

            if (filtered.length > 0) {
                filtered.forEach(set => {
                    html += `
                        <button class="lingora-study-set-item" data-id="${set.id}">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
                            </svg>
                            ${set.title}
                        </button>
                    `;
                });
            } else if (filter !== '') {
                html += '<p style="text-align:center;color:#9ca3af;padding:20px;">Không tìm thấy bộ học liệu nào</p>';
            }
            return html;
        };

        let dialogHtml = `
            <div class="lingora-save-dialog-content">
                <h4>Chọn bộ học liệu</h4>
                <div class="lingora-search-container">
                    <svg class="lingora-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input type="text" class="lingora-search-input" placeholder="Tìm bộ học liệu..." />
                </div>
                <div class="lingora-study-sets">
                    ${renderStudySets(studySets)}
                </div>
                <button class="lingora-cancel-btn">Hủy</button>
            </div>
        `;

        saveDialog.innerHTML = dialogHtml;
        dictionaryPopup.querySelector('.lingora-popup-content').appendChild(saveDialog);

        const searchInput = saveDialog.querySelector('.lingora-search-input');
        const setsList = saveDialog.querySelector('.lingora-study-sets');

        // Add search filtering
        searchInput.addEventListener('input', (e) => {
            setsList.innerHTML = renderStudySets(studySets, e.target.value);
            attachSetClickListeners();
        });

        const attachSetClickListeners = () => {
            saveDialog.querySelectorAll('.lingora-study-set-item').forEach(item => {
                item.onclick = async () => {
                    const setId = item.dataset.id;
                    if (setId === 'new') {
                        showCreateStudySetForm(wordData, saveDialog);
                    } else {
                        await saveFlashcard(parseInt(setId), wordData);
                        saveDialog.remove();
                    }
                };
            });
        };

        attachSetClickListeners();

        // Add cancel listener
        saveDialog.querySelector('.lingora-cancel-btn').addEventListener('click', () => {
            saveDialog.remove();
        });

    } catch (error) {
        console.error('Error loading study sets:', error);
        alert('Không thể tải danh sách bộ học liệu. Vui lòng thử lại.');
    }
}

/**
 * Show create new study set form
 */
function showCreateStudySetForm(wordData, saveDialog) {
    const formHtml = `
    <div class="lingora-new-set-form">
      <h4>Tạo bộ học liệu mới</h4>
      <input type="text" id="lingora-new-set-title" placeholder="Tên bộ học liệu..." />
      <div class="lingora-form-actions">
        <button class="lingora-cancel-btn" id="lingora-cancel-new-set">Hủy</button>
        <button class="lingora-save-btn" id="lingora-create-new-set">Tạo và lưu</button>
      </div>
    </div>
  `;

    saveDialog.querySelector('.lingora-save-dialog-content').innerHTML = formHtml;

    // Focus on input
    const input = saveDialog.querySelector('#lingora-new-set-title');
    input.focus();

    // Cancel button
    saveDialog.querySelector('#lingora-cancel-new-set').addEventListener('click', () => {
        saveDialog.remove();
    });

    // Create button
    saveDialog.querySelector('#lingora-create-new-set').addEventListener('click', async () => {
        const title = input.value.trim();

        if (!title) {
            alert('Vui lòng nhập tên bộ học liệu');
            return;
        }

        try {
            // Create new study set
            const newSet = await chrome.runtime.sendMessage({
                action: 'createStudySet',
                title: title,
                visibility: 'PRIVATE'
            });

            if (newSet.error) {
                throw new Error(newSet.error);
            }

            // Save flashcard to new study set
            await saveFlashcard(newSet.id, wordData);
            saveDialog.remove();

        } catch (error) {
            console.error('Error creating study set:', error);
            alert('Không thể tạo bộ học liệu. Vui lòng thử lại.');
        }
    });

    // Enter key to submit
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            saveDialog.querySelector('#lingora-create-new-set').click();
        }
    });
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
