class YouTubeDownloader {
    constructor() {
        this.currentVideoInfo = null;
        this.selectedFormat = null;
        this.downloadHistory = JSON.parse(localStorage.getItem('downloadHistory') || '[]');

        this.initializeElements();
        this.bindEvents();
        this.loadDownloadHistory();
        this.setupProgressListeners();
        this.initializeAutoExport();
        this.initializeSettings();
    }

    initializeElements() {
        // Input elements
        this.urlInput = document.getElementById('urlInput');
        this.clearBtn = document.getElementById('clearBtn');
        this.fetchBtn = document.getElementById('fetchBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.downloadPathInput = document.getElementById('downloadPath');
        this.selectPathBtn = document.getElementById('selectPathBtn');
        this.filenameInput = document.getElementById('filename');

        // Auto-export elements
        this.autoExportToggle = document.getElementById('autoExportToggle');

        // Display elements
        this.videoInfo = document.getElementById('videoInfo');
        this.downloadOptions = document.getElementById('downloadOptions');
        this.progressSection = document.getElementById('progressSection');
        this.thumbnail = document.getElementById('thumbnail');
        this.videoTitle = document.getElementById('videoTitle');
        this.videoAuthor = document.getElementById('videoAuthor');
        this.videoStats = document.getElementById('videoStats');
        this.duration = document.getElementById('duration');

        // Format containers
        this.videoQualityOptions = document.getElementById('videoQualityOptions');
        this.audioQualityOptions = document.getElementById('audioQualityOptions');
        this.videoTab = document.getElementById('videoTab');
        this.audioTab = document.getElementById('audioTab');

        // Selection state
        this.selectedVideoQuality = null;
        this.selectedAudioQuality = null;
        this.selectedVideoFormat = 'mp4';
        this.selectedAudioFormat = 'mp3';

        // Progress elements
        this.progressTitle = document.getElementById('progressTitle');
        this.progressFill = document.getElementById('progressFill');
        this.progressPercent = document.getElementById('progressPercent');
        this.progressSize = document.getElementById('progressSize');

        // History
        this.historyList = document.getElementById('historyList');
        this.historyToggle = document.getElementById('historyToggle');

        // Window controls
        this.minimizeBtn = document.getElementById('minimizeBtn');
        this.maximizeBtn = document.getElementById('maximizeBtn');
        this.closeBtn = document.getElementById('closeBtn');
    }
    bindEvents() {
        // Main functionality
        this.fetchBtn.addEventListener('click', () => this.fetchVideoInfo());
        this.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.fetchVideoInfo();
        });
        this.downloadBtn.addEventListener('click', () => this.downloadVideo());
        this.selectPathBtn.addEventListener('click', () => this.selectDownloadPath());

        // Window controls
        if (this.minimizeBtn) {
            this.minimizeBtn.addEventListener('click', () => {
                console.log('Minimize clicked');
                window.electronAPI.windowMinimize();
            });
        }
        if (this.maximizeBtn) {
            this.maximizeBtn.addEventListener('click', () => {
                console.log('Maximize clicked');
                window.electronAPI.windowMaximize();
            });
        }
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => {
                console.log('Close clicked');
                window.electronAPI.windowClose();
            });
        }

        // URL input validation and clear button visibility
        this.urlInput.addEventListener('input', () => {
            this.validateUrl();
            this.toggleClearButton();
        });

        // Clear button functionality
        this.clearBtn.addEventListener('click', () => this.clearUrl());

        // Support button
        const supportBtn = document.getElementById('supportBtn');
        if (supportBtn) {
            supportBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.openKofiLink();
            });
        }

        // Auto-export toggle
        this.autoExportToggle.addEventListener('change', () => this.handleAutoExportToggle());

        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (e.target.classList.contains('disabled')) return;
                const tab = e.target.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Initialize clear button visibility
        this.toggleClearButton();
    }

    setupProgressListeners() {
        window.electronAPI.onDownloadProgress((data) => {
            this.updateProgress(data.percent, data.downloaded, data.total, data.message);
        });

        window.electronAPI.onConversionProgress((percent) => {
            this.updateConversionProgress(percent);
        });

        window.electronAPI.onDownloadFallbackRequired(async (data) => {
            await this.handleDownloadFallback(data);
        });
    }

    async handleDownloadFallback(data) {
        try {
            const result = await window.electronAPI.showFallbackDialog(data);

            if (result.cancelled) {
                this.showError('Download cancelled - format not available');
                return;
            }

            const { newFormat, newQuality } = result;
            this.showSuccess(`Retrying download as ${newFormat.toUpperCase()} at ${newQuality}p`);

            const currentTab = document.querySelector('.tab-btn.active').dataset.tab;
            if (currentTab === 'video') {
                this.selectedVideoFormat = newFormat;
                this.selectedVideoQuality = newQuality;
            }

            setTimeout(() => {
                this.downloadVideo();
            }, 1000);

        } catch (error) {
            console.error('Error handling download fallback:', error);
            this.showError('Failed to handle format fallback');
        }
    }

    async initializeAutoExport() {
        if (this.autoExportToggle.checked) {
            try {
                const defaultPath = await window.electronAPI.getDefaultDownloadsPath();
                await window.electronAPI.ensureAutoExportDir(defaultPath);
                this.downloadPathInput.value = defaultPath;
                this.downloadPathInput.placeholder = `Auto-export to ${defaultPath}`;
            } catch (error) {
                console.error('Failed to initialize auto-export:', error);
            }
        }
    }

    async handleAutoExportToggle() {
        if (this.autoExportToggle.checked) {
            try {
                const defaultPath = await window.electronAPI.getDefaultDownloadsPath();
                await window.electronAPI.ensureAutoExportDir(defaultPath);
                this.downloadPathInput.value = defaultPath;
                this.downloadPathInput.placeholder = `Auto-export to ${defaultPath}`;
                this.showSuccess('Auto-export enabled!');
            } catch (error) {
                this.showError('Failed to enable auto-export');
                this.autoExportToggle.checked = false;
            }
        } else {
            this.downloadPathInput.value = '';
            this.downloadPathInput.placeholder = 'Select download folder...';
        }
    }

    validateUrl() {
        const url = this.urlInput.value.trim();
        const isValid = this.isValidYouTubeUrl(url);
        this.fetchBtn.disabled = !isValid;

        if (url && !isValid) {
            this.urlInput.style.borderColor = '#e74c3c';
        } else {
            this.urlInput.style.borderColor = '#333';
        }
    }

    toggleClearButton() {
        const hasText = this.urlInput.value.trim().length > 0;
        this.clearBtn.classList.toggle('hidden', !hasText);
    }

    clearUrl() {
        this.urlInput.value = '';
        this.urlInput.focus();
        this.validateUrl();
        this.toggleClearButton();
        this.hideElements([this.videoInfo, this.downloadOptions, this.progressSection]);
        document.querySelector('.container').classList.remove('video-loaded');
        this.currentVideoInfo = null;
        this.selectedFormat = null;
        this.selectedVideoQuality = null;
        this.selectedAudioQuality = null;
    }

    isValidYouTubeUrl(url) {
        const patterns = [
            /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)/,
            /^https?:\/\/(www\.)?youtube\.com\/embed\//,
            /^https?:\/\/(www\.)?youtube\.com\/v\//
        ];
        return patterns.some(pattern => pattern.test(url));
    }

    async fetchVideoInfo() {
        const url = this.urlInput.value.trim();
        if (!this.isValidYouTubeUrl(url)) {
            this.showError('Please enter a valid YouTube URL');
            return;
        }

        this.setLoadingState(this.fetchBtn, true);
        this.hideElements([this.videoInfo, this.downloadOptions, this.progressSection]);

        try {
            this.currentVideoInfo = await window.electronAPI.getVideoInfo(url);
            this.displayVideoInfo();
            this.displayFormatOptions();
            this.showElements([this.videoInfo, this.downloadOptions]);
            this.filenameInput.value = this.sanitizeFilename(this.currentVideoInfo.title);
        } catch (error) {
            this.showError(`Failed to fetch video info: ${error.message}`);
        } finally {
            this.setLoadingState(this.fetchBtn, false);
        }
    }

    displayVideoInfo() {
        const info = this.currentVideoInfo;
        this.thumbnail.src = info.thumbnail;
        this.videoTitle.textContent = info.title;
        this.videoAuthor.textContent = `by ${info.author}`;

        let statsText = `${this.formatNumber(info.viewCount)} views`;
        if (info.hasAudio !== undefined) {
            if (info.hasAudio) {
                if (info.hasVideoWithAudio) {
                    statsText += ' • Has Audio';
                } else if (info.hasAudioOnly) {
                    statsText += ' • Audio Only';
                }
            } else {
                statsText += ' • No Audio Track';
            }
        }
        this.videoStats.textContent = statsText;
        this.duration.textContent = this.formatDuration(info.lengthSeconds);
        document.querySelector('.container').classList.add('video-loaded');
    }

    displayFormatOptions() {
        this.availableFormats = this.currentVideoInfo.formats;

        const audioTab = document.querySelector('.tab-btn[data-tab="audio"]');
        if (audioTab) {
            if (!this.currentVideoInfo.hasAudio) {
                audioTab.classList.add('disabled');
                audioTab.title = 'This video has no audio track';

                const currentTab = document.querySelector('.tab-btn.active');
                if (currentTab && currentTab.dataset.tab === 'audio') {
                    const videoTab = document.querySelector('.tab-btn[data-tab="video"]');
                    if (videoTab) {
                        videoTab.click();
                    }
                }
            } else {
                audioTab.classList.remove('disabled');
                audioTab.title = 'Download audio only';
            }
        }

        this.enableQualitySelection();
    }

    enableQualitySelection() {
        const maxVideoHeight = this.currentVideoInfo.formats
            .filter(f => f.hasVideo)
            .reduce((max, f) => Math.max(max, f.height || this.extractHeightFromQuality(f.quality) || 0), 0);

        const qualityThresholds = [4320, 2880, 2160, 1440, 1080, 720, 480, 360, 240, 144];
        const visibleQualities = qualityThresholds.filter(quality => {
            if (maxVideoHeight >= 2160) {
                return quality <= maxVideoHeight && quality >= 720;
            } else if (maxVideoHeight >= 1440) {
                return quality <= maxVideoHeight && quality >= 720;
            } else if (maxVideoHeight >= 1080) {
                return quality <= maxVideoHeight && quality >= 720;
            } else if (maxVideoHeight >= 720) {
                return quality <= maxVideoHeight && quality >= 480;
            } else {
                return quality <= maxVideoHeight;
            }
        });

        this.createQualityOptions(visibleQualities);
        this.setupQualitySelectionHandlers();
        this.setupFormatSelectionHandlers();
        this.autoSelectDefaults();
    }

    createQualityOptions(visibleQualities) {
        const qualityLabels = {
            4320: { label: '8K (4320p)', details: 'Ultra HD • Best Quality' },
            2880: { label: '5K (2880p)', details: 'Ultra HD • High Quality' },
            2160: { label: '4K (2160p)', details: 'Ultra HD • Best Quality' },
            1440: { label: '2K (1440p)', details: 'Quad HD • High Quality' },
            1080: { label: '1080p', details: 'Full HD • Standard' },
            720: { label: '720p', details: 'HD • Good Quality' },
            480: { label: '480p', details: 'SD • Medium Quality' },
            360: { label: '360p', details: 'Low Quality • Smallest Size' },
            240: { label: '240p', details: 'Very Low Quality' },
            144: { label: '144p', details: 'Lowest Quality' }
        };

        const videoQualityContainer = document.getElementById('videoQualityOptions');
        videoQualityContainer.innerHTML = '';

        visibleQualities.forEach(quality => {
            const qualityInfo = qualityLabels[quality] || { label: `${quality}p`, details: 'Standard Quality' };
            const optionElement = document.createElement('div');
            optionElement.className = 'quality-option';
            optionElement.dataset.quality = quality;
            optionElement.innerHTML = `
                <div class="quality-label">${qualityInfo.label}</div>
                <div class="quality-details">${qualityInfo.details}</div>
            `;
            videoQualityContainer.appendChild(optionElement);
        });

        const audioQualityContainer = document.getElementById('audioQualityOptions');
        audioQualityContainer.innerHTML = '';

        const audioQualities = [
            { quality: 320, label: 'MP3 - 320kbps', details: 'High Quality • Larger Size' },
            { quality: 128, label: 'MP3 - 128kbps', details: 'Standard Quality • Smaller Size' }
        ];

        audioQualities.forEach(audio => {
            const optionElement = document.createElement('div');
            optionElement.className = 'quality-option';
            optionElement.dataset.quality = audio.quality;
            optionElement.innerHTML = `
                <div class="quality-label">${audio.label}</div>
                <div class="quality-details">${audio.details}</div>
            `;
            audioQualityContainer.appendChild(optionElement);
        });
    }

    setupQualitySelectionHandlers() {
        const videoQualityOptions = document.querySelectorAll('#videoQualityOptions .quality-option');
        videoQualityOptions.forEach(option => {
            option.addEventListener('click', () => {
                videoQualityOptions.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                this.selectedVideoQuality = parseInt(option.dataset.quality);
                this.updateDownloadButton();
            });
        });

        const audioQualityOptions = document.querySelectorAll('#audioQualityOptions .quality-option');
        audioQualityOptions.forEach(option => {
            option.addEventListener('click', () => {
                audioQualityOptions.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                this.selectedAudioQuality = parseInt(option.dataset.quality);
                this.updateDownloadButton();
            });
        });
    }
    setupFormatSelectionHandlers() {
        const videoFormatOptions = document.querySelectorAll('#videoTab .format-option');
        videoFormatOptions.forEach(option => {
            option.addEventListener('click', () => {
                videoFormatOptions.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                this.selectedVideoFormat = option.dataset.format;
                this.updateDownloadButton();
            });
        });

        const audioFormatOptions = document.querySelectorAll('#audioTab .format-option');
        audioFormatOptions.forEach(option => {
            option.addEventListener('click', () => {
                audioFormatOptions.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                this.selectedAudioFormat = option.dataset.format;
                this.updateDownloadButton();
            });
        });
    }

    autoSelectDefaults() {
        const firstVideoFormatOption = document.querySelector('#videoTab .format-option[data-format="mp4"]');
        if (firstVideoFormatOption) {
            firstVideoFormatOption.click();
        }

        const firstAudioFormatOption = document.querySelector('#audioTab .format-option[data-format="mp3"]');
        if (firstAudioFormatOption) {
            firstAudioFormatOption.click();
        }

        const firstVideoOption = document.querySelector('#videoQualityOptions .quality-option');
        if (firstVideoOption) {
            firstVideoOption.click();
        }

        const firstAudioOption = document.querySelector('#audioQualityOptions .quality-option');
        if (firstAudioOption) {
            firstAudioOption.click();
        }
    }

    updateDownloadButton() {
        const currentTabBtn = document.querySelector('.tab-btn.active');
        if (!currentTabBtn) return;

        const currentTab = currentTabBtn.dataset.tab;
        const hasSelection = currentTab === 'video' ?
            this.selectedVideoQuality && this.selectedVideoFormat :
            this.selectedAudioQuality && this.selectedAudioFormat;

        const hasPath = this.downloadPathInput && this.downloadPathInput.value;
        this.downloadBtn.disabled = !hasSelection || !hasPath;
    }

    async selectDownloadPath() {
        try {
            const path = await window.electronAPI.selectDownloadPath();
            if (path) {
                this.downloadPathInput.value = path;
                this.updateDownloadButton();
            }
        } catch (error) {
            this.showError('Failed to select download path');
        }
    }

    async downloadVideo() {
        const currentTab = document.querySelector('.tab-btn.active').dataset.tab;
        const isVideoFormat = currentTab === 'video';

        if (isVideoFormat) {
            if (!this.selectedVideoQuality || !this.selectedVideoFormat) {
                this.showError('Please select video quality and format');
                return;
            }
        } else {
            if (!this.selectedAudioQuality || !this.selectedAudioFormat) {
                this.showError('Please select audio quality and format');
                return;
            }
        }

        if (!this.downloadPathInput.value) {
            this.showError('Please select download path');
            return;
        }

        const filename = this.filenameInput.value.trim() || this.sanitizeFilename(this.currentVideoInfo.title);
        const targetFormat = isVideoFormat ? this.selectedVideoFormat : this.selectedAudioFormat;
        const targetQuality = isVideoFormat ? this.selectedVideoQuality : this.selectedAudioQuality;
        const fullFilename = filename.endsWith(`.${targetFormat}`) ? filename : `${filename}.${targetFormat}`;

        this.showElements([this.progressSection]);
        this.hideElements([this.downloadOptions]);

        try {
            const bestFormat = this.findBestFormat(isVideoFormat, targetQuality);

            const result = await window.electronAPI.downloadVideo({
                url: this.urlInput.value.trim(),
                format: {
                    ...bestFormat,
                    encodingMethod: this.getEncodingMethod()
                },
                outputPath: this.downloadPathInput.value,
                filename: fullFilename,
                targetFormat: targetFormat,
                isVideoFormat: isVideoFormat,
                targetQuality: targetQuality
            });

            if (result.success) {
                this.addToHistory({
                    title: this.currentVideoInfo.title,
                    author: this.currentVideoInfo.author,
                    thumbnail: this.currentVideoInfo.thumbnail,
                    filename: fullFilename,
                    downloadDate: new Date().toISOString(),
                    format: targetFormat,
                    quality: isVideoFormat ? `${targetQuality}p` : `${targetQuality}kbps`
                });

                this.showSuccess(`Download completed: ${fullFilename}`);
            }
        } catch (error) {
            this.showError(`Download failed: ${error.message}`);
        } finally {
            this.hideElements([this.progressSection]);
            this.showElements([this.downloadOptions]);
        }
    }

    findBestFormat(isVideoFormat, targetQuality) {
        if (isVideoFormat) {
            const allVideoFormats = this.availableFormats.filter(f => f.hasVideo);
            const sortedFormats = allVideoFormats.sort((a, b) => {
                const heightA = a.height || this.extractHeightFromQuality(a.quality) || 0;
                const heightB = b.height || this.extractHeightFromQuality(b.quality) || 0;
                return heightB - heightA;
            });

            let selectedFormat = sortedFormats.find(f => {
                const height = f.height || this.extractHeightFromQuality(f.quality) || 0;
                return height >= targetQuality;
            });

            if (!selectedFormat) {
                selectedFormat = sortedFormats[0];
            }

            if (targetQuality >= 1080) {
                return {
                    ...selectedFormat,
                    isHighResolution: true,
                    targetHeight: targetQuality,
                    forceHighRes: true
                };
            }

            return selectedFormat;
        } else {
            const audioFormats = this.availableFormats.filter(f => f.hasAudio);
            return audioFormats.sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0))[0];
        }
    }

    updateProgress(percent, downloaded, total, message) {
        const clampedPercent = Math.min(Math.max(parseFloat(percent) || 0, 0), 100);

        if (!this.progressState) {
            this.progressState = {
                currentPercent: 0,
                isDownloading: false,
                lastValidPercent: 0,
                downloadStarted: false
            };
        }

        if (clampedPercent > 0 && !this.progressState.downloadStarted) {
            this.progressState.downloadStarted = true;
            this.progressState.isDownloading = true;
        }

        let finalPercent = clampedPercent;
        if (this.progressState.isDownloading && clampedPercent < this.progressState.lastValidPercent && clampedPercent !== 0 && clampedPercent !== 100) {
            return;
        }

        const percentDiff = Math.abs(finalPercent - this.progressState.currentPercent);

        if (percentDiff >= 1 || finalPercent === 0 || finalPercent === 100) {
            this.progressFill.style.transition = 'width 0.3s ease-out';
            this.progressFill.style.width = `${finalPercent}%`;

            const displayPercent = finalPercent === 100 ? '100' : Math.floor(finalPercent).toString();
            this.progressPercent.textContent = `${displayPercent}%`;

            this.progressState.currentPercent = finalPercent;
            if (finalPercent > this.progressState.lastValidPercent) {
                this.progressState.lastValidPercent = finalPercent;
            }

            if (finalPercent === 100) {
                this.progressState.isDownloading = false;
                this.progressState.downloadStarted = false;
            }
        }

        if (message) {
            let cleanMessage = message;

            if (message.includes('(') && message.includes('MB')) {
                cleanMessage = message.split('(')[0].trim();
            }

            if (cleanMessage.toLowerCase().includes('downloading')) {
                cleanMessage = cleanMessage.replace(/\.+$/, '');
                this.progressTitle.innerHTML = `${cleanMessage}<span class="animated-dots">...</span>`;
            } else {
                this.progressTitle.textContent = cleanMessage;
            }
        }

        if (downloaded && total && downloaded > 0 && total > 0) {
            const downloadedMB = downloaded / (1024 * 1024);
            const totalMB = total / (1024 * 1024);
            this.progressSize.textContent = `${downloadedMB.toFixed(1)}MB / ${totalMB.toFixed(1)}MB`;
        } else if (message && message.includes('(') && message.includes('MB')) {
            const sizeMatch = message.match(/\(([^)]+)\)/);
            if (sizeMatch) {
                this.progressSize.textContent = sizeMatch[1];
            } else {
                this.progressSize.textContent = 'Processing...';
            }
        } else {
            if (message && message.toLowerCase().includes('converting')) {
                this.progressSize.textContent = 'Converting file...';
            } else if (message && message.toLowerCase().includes('merging')) {
                this.progressSize.textContent = 'Merging streams...';
            } else if (message && message.toLowerCase().includes('finalizing')) {
                this.progressSize.textContent = 'Finalizing...';
            } else {
                this.progressSize.textContent = 'Processing...';
            }
        }
    }
    updateConversionProgress(percent) {
        const clampedPercent = Math.min(Math.max(parseFloat(percent) || 0, 0), 100);

        const currentPercent = parseFloat(this.progressPercent.textContent) || 0;
        const percentDiff = Math.abs(clampedPercent - currentPercent);

        if (percentDiff >= 1 || clampedPercent === 0 || clampedPercent === 100) {
            this.progressTitle.textContent = '🔄 Converting to target format...';
            this.progressFill.style.transition = 'width 0.5s ease-out';
            this.progressFill.style.width = `${clampedPercent}%`;
            this.progressPercent.textContent = `${Math.round(clampedPercent)}%`;
            this.progressSize.textContent = 'Processing file...';
        }
    }

    switchTab(tab) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        if (this.videoTab && this.audioTab) {
            this.videoTab.classList.toggle('hidden', tab !== 'video');
            this.audioTab.classList.toggle('hidden', tab !== 'audio');
        }

        if (tab === 'video') {
            this.selectedAudioQuality = null;
        } else {
            this.selectedVideoQuality = null;
        }

        this.updateDownloadButton();
    }

    addToHistory(item) {
        this.downloadHistory.unshift(item);
        this.downloadHistory = this.downloadHistory.slice(0, 50);
        localStorage.setItem('downloadHistory', JSON.stringify(this.downloadHistory));
        this.loadDownloadHistory();
    }

    loadDownloadHistory() {
        if (this.downloadHistory.length === 0) {
            this.historyList.innerHTML = `
                <div class="empty-state">
                    <p>No downloads yet. Start by pasting a YouTube URL above!</p>
                </div>
            `;
            return;
        }

        this.historyList.innerHTML = this.downloadHistory.map((item, index) => `
            <div class="history-item" data-index="${index}">
                <img src="${item.thumbnail}" alt="Thumbnail" class="history-thumbnail">
                <div class="history-details">
                    <div class="history-title">${item.title}</div>
                    <div class="history-info">
                        ${item.author} • ${item.format} • ${new Date(item.downloadDate).toLocaleDateString()}
                    </div>
                </div>
                <button class="history-remove-btn" data-index="${index}">×</button>
            </div>
        `).join('');

        document.querySelectorAll('.history-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                this.removeFromHistory(index);
            });
        });
    }

    removeFromHistory(index) {
        if (index >= 0 && index < this.downloadHistory.length) {
            this.downloadHistory.splice(index, 1);
            localStorage.setItem('downloadHistory', JSON.stringify(this.downloadHistory));
            this.loadDownloadHistory();
            this.showSuccess('Download removed from history');
        }
    }
    // Settings functionality
    initializeSettings() {
        this.settingsBtn = document.getElementById('settingsBtn');
        this.settingsModal = document.getElementById('settingsModal');
        this.settingsCloseBtn = document.getElementById('settingsCloseBtn');
        this.saveSettingsBtn = document.getElementById('saveSettingsBtn');
        this.resetSettingsBtn = document.getElementById('resetSettingsBtn');

        this.encodingMethodSelect = document.getElementById('encodingMethod');
        this.maxConcurrentDownloadsSelect = document.getElementById('maxConcurrentDownloads');
        this.defaultVideoQualitySelect = document.getElementById('defaultVideoQuality');
        this.defaultVideoFormatSelect = document.getElementById('defaultVideoFormat');
        this.autoSelectBestQualityCheckbox = document.getElementById('autoSelectBestQuality');
        this.showAdvancedOptionsCheckbox = document.getElementById('showAdvancedOptions');
        this.minimizeToTrayCheckbox = document.getElementById('minimizeToTray');

        this.loadSettings();
        this.bindSettingsEvents();
    }

    bindSettingsEvents() {
        if (this.settingsBtn) {
            this.settingsBtn.addEventListener('click', () => this.openSettings());
        }

        if (this.settingsCloseBtn) {
            this.settingsCloseBtn.addEventListener('click', () => this.closeSettings());
        }

        if (this.settingsModal) {
            const overlay = this.settingsModal.querySelector('.settings-overlay');
            if (overlay) {
                overlay.addEventListener('click', () => this.closeSettings());
            }
        }

        if (this.saveSettingsBtn) {
            this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        }

        if (this.resetSettingsBtn) {
            this.resetSettingsBtn.addEventListener('click', () => this.resetSettings());
        }

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.settingsModal && !this.settingsModal.classList.contains('hidden')) {
                this.closeSettings();
            }
        });
    }

    openSettings() {
        console.log('openSettings called');
        console.log('settingsModal:', this.settingsModal);
        if (this.settingsModal) {
            this.settingsModal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            console.log('Settings modal should be visible now');
        } else {
            console.error('Settings modal not found!');
        }
    }

    closeSettings() {
        if (this.settingsModal) {
            this.settingsModal.classList.add('hidden');
            document.body.style.overflow = '';
        }
    }

    loadSettings() {
        const defaultSettings = {
            encodingMethod: 'gpu',
            maxConcurrentDownloads: 1,
            defaultVideoQuality: 1080,
            defaultVideoFormat: 'mp4',
            autoSelectBestQuality: true,
            showAdvancedOptions: false,
            minimizeToTray: false
        };

        const savedSettings = JSON.parse(localStorage.getItem('appSettings') || '{}');
        this.settings = { ...defaultSettings, ...savedSettings };

        if (this.encodingMethodSelect) this.encodingMethodSelect.value = this.settings.encodingMethod;
        if (this.maxConcurrentDownloadsSelect) this.maxConcurrentDownloadsSelect.value = this.settings.maxConcurrentDownloads;
        if (this.defaultVideoQualitySelect) this.defaultVideoQualitySelect.value = this.settings.defaultVideoQuality;
        if (this.defaultVideoFormatSelect) this.defaultVideoFormatSelect.value = this.settings.defaultVideoFormat;
        if (this.autoSelectBestQualityCheckbox) this.autoSelectBestQualityCheckbox.checked = this.settings.autoSelectBestQuality;
        if (this.showAdvancedOptionsCheckbox) this.showAdvancedOptionsCheckbox.checked = this.settings.showAdvancedOptions;
        if (this.minimizeToTrayCheckbox) this.minimizeToTrayCheckbox.checked = this.settings.minimizeToTray;

        this.applySettings();
    }
    saveSettings() {
        this.settings = {
            encodingMethod: this.encodingMethodSelect?.value || 'gpu',
            maxConcurrentDownloads: parseInt(this.maxConcurrentDownloadsSelect?.value || 1),
            defaultVideoQuality: parseInt(this.defaultVideoQualitySelect?.value || 1080),
            defaultVideoFormat: this.defaultVideoFormatSelect?.value || 'mp4',
            autoSelectBestQuality: this.autoSelectBestQualityCheckbox?.checked || true,
            showAdvancedOptions: this.showAdvancedOptionsCheckbox?.checked || false,
            minimizeToTray: this.minimizeToTrayCheckbox?.checked || false
        };

        localStorage.setItem('appSettings', JSON.stringify(this.settings));
        this.applySettings();
        this.showSuccess('Settings saved successfully!');
        this.closeSettings();
    }

    resetSettings() {
        if (confirm('Are you sure you want to reset all settings to defaults?')) {
            localStorage.removeItem('appSettings');
            this.loadSettings();
            this.showSuccess('Settings reset to defaults');
        }
    }

    applySettings() {
        window.appSettings = this.settings;

        if (this.settings.showAdvancedOptions) {
            document.body.classList.add('show-advanced-options');
        } else {
            document.body.classList.remove('show-advanced-options');
        }
    }

    getEncodingMethod() {
        return this.settings?.encodingMethod || 'gpu';
    }

    // Utility methods
    setLoadingState(button, loading) {
        const spinner = button.querySelector('.spinner');
        const text = button.querySelector('.btn-text');

        if (loading) {
            if (spinner) spinner.classList.remove('hidden');
            if (text) text.style.opacity = '0.7';
            button.disabled = true;
        } else {
            if (spinner) spinner.classList.add('hidden');
            if (text) text.style.opacity = '1';
            button.disabled = false;
        }
    }

    showElements(elements) {
        elements.forEach(el => {
            if (el) el.classList.remove('hidden');
        });
    }

    hideElements(elements) {
        elements.forEach(el => {
            if (el) el.classList.add('hidden');
        });
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showNotification(message, type = 'info') {
        const existing = document.querySelector('.notification');
        if (existing) {
            this.hideNotification(existing);
        }

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">${type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️'}</span>
                <span class="notification-message">${message}</span>
                <button class="notification-close">×</button>
            </div>
        `;

        document.body.appendChild(notification);

        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => {
            this.hideNotification(notification);
        });

        // Show notification with animation
        setTimeout(() => {
            notification.classList.add('show');
        }, 50);

        // Auto-hide after 3 seconds (reduced from 5)
        setTimeout(() => {
            if (notification.parentNode) {
                this.hideNotification(notification);
            }
        }, 3000);
    }

    hideNotification(notification) {
        notification.classList.add('hide');
        notification.classList.remove('show');

        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300); // Wait for exit animation to complete
    }
    sanitizeFilename(filename) {
        return filename.replace(/[<>:"/\\|?*]/g, '').trim();
    }

    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    extractHeightFromQuality(quality) {
        const match = quality.match(/(\d+)p/);
        return match ? parseInt(match[1]) : 0;
    }

    openKofiLink() {
        try {
            window.electronAPI.openExternalLink('https://ko-fi.com/novafova');
            this.showSuccess('Opening Ko-fi page in your browser');
        } catch (error) {
            console.error('Failed to open Ko-fi link:', error);
            this.showError('Failed to open Ko-fi page');
        }
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new YouTubeDownloader();
});