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
    }

    initializeElements() {
        // Input elements
        this.urlInput = document.getElementById('urlInput');
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

        // History toggle
        if (this.historyToggle) {
            this.historyToggle.addEventListener('click', () => {
                console.log('History toggle clicked');
                this.toggleHistoryList();
            });
        }

        // Also make the history header clickable
        const historyHeader = document.querySelector('.history-header');
        if (historyHeader) {
            historyHeader.addEventListener('click', () => {
                console.log('History header clicked');
                this.toggleHistoryList();
            });
        }

        // Tab switching - Fixed
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Window controls - Fixed
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

        // URL input validation
        this.urlInput.addEventListener('input', () => this.validateUrl());

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

        // Quality and format selection handlers
        this.setupQualitySelectionHandlers();
        this.setupFormatSelectionHandlers();
    }

    setupProgressListeners() {
        window.electronAPI.onDownloadProgress((data) => {
            this.updateProgress(data.percent, data.downloaded, data.total);
        });

        window.electronAPI.onConversionProgress((percent) => {
            this.updateConversionProgress(percent);
        });
    }

    async initializeAutoExport() {
        // Set up auto-export by default
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
            // Enable auto-export
            try {
                const defaultPath = await window.electronAPI.getDefaultDownloadsPath();
                await window.electronAPI.ensureAutoExportDir(defaultPath);
                this.downloadPathInput.value = defaultPath;
                this.downloadPathInput.placeholder = `Auto-export to ${defaultPath}`;
                this.showSuccess('Auto-export enabled! Downloads will go to YouTube Downloads folder.');
            } catch (error) {
                this.showError('Failed to enable auto-export');
                this.autoExportToggle.checked = false;
            }
        } else {
            // Disable auto-export
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

            // Auto-generate filename
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
        this.videoStats.textContent = `${this.formatNumber(info.viewCount)} views`;
        this.duration.textContent = this.formatDuration(info.lengthSeconds);

        // Add the video-loaded class to trigger the animation to two-column layout
        document.querySelector('.container').classList.add('video-loaded');
    }

    displayFormatOptions() {
        // Store available formats for later use
        this.availableFormats = this.currentVideoInfo.formats;

        // Enable quality selection - the HTML already has the quality options
        // Just need to enable the selection handlers
        this.enableQualitySelection();
    }

    setupQualitySelectionHandlers() {
        // Video quality selection
        const videoQualityOptions = document.querySelectorAll('#videoQualityOptions .quality-option');
        videoQualityOptions.forEach(option => {
            option.addEventListener('click', () => {
                // Remove previous selection
                videoQualityOptions.forEach(opt => opt.classList.remove('selected'));
                // Select current
                option.classList.add('selected');
                this.selectedVideoQuality = parseInt(option.dataset.quality);
                this.updateDownloadButton();
            });
        });

        // Audio quality selection
        const audioQualityOptions = document.querySelectorAll('#audioQualityOptions .quality-option');
        audioQualityOptions.forEach(option => {
            option.addEventListener('click', () => {
                // Remove previous selection
                audioQualityOptions.forEach(opt => opt.classList.remove('selected'));
                // Select current
                option.classList.add('selected');
                this.selectedAudioQuality = parseInt(option.dataset.quality);
                this.updateDownloadButton();
            });
        });
    }

    setupFormatSelectionHandlers() {
        // Video format selection - Fixed
        const videoFormatOptions = document.querySelectorAll('#videoTab .format-option');
        videoFormatOptions.forEach(option => {
            option.addEventListener('click', () => {
                console.log('Video format clicked:', option.dataset.format);
                // Remove previous selection
                videoFormatOptions.forEach(opt => opt.classList.remove('active'));
                // Select current
                option.classList.add('active');
                this.selectedVideoFormat = option.dataset.format;
                console.log('Selected video format:', this.selectedVideoFormat);
                this.updateDownloadButton();
            });
        });

        // Audio format selection - Fixed
        const audioFormatOptions = document.querySelectorAll('#audioTab .format-option');
        audioFormatOptions.forEach(option => {
            option.addEventListener('click', () => {
                console.log('Audio format clicked:', option.dataset.format);
                // Remove previous selection
                audioFormatOptions.forEach(opt => opt.classList.remove('active'));
                // Select current
                option.classList.add('active');
                this.selectedAudioFormat = option.dataset.format;
                console.log('Selected audio format:', this.selectedAudioFormat);
                this.updateDownloadButton();
            });
        });
    }

    enableQualitySelection() {
        // Get the maximum available video height from the formats
        const maxVideoHeight = this.currentVideoInfo.formats
            .filter(f => f.hasVideo)
            .reduce((max, f) => Math.max(max, f.height || this.extractHeightFromQuality(f.quality) || 0), 0);

        console.log(`Maximum available video height: ${maxVideoHeight}p`);

        // Define the quality thresholds we want to show based on max height
        const qualityThresholds = [4320, 2880, 2160, 1440, 1080, 720, 480, 360, 240, 144];

        // Determine which qualities to show based on max height
        const visibleQualities = qualityThresholds.filter(quality => {
            // For 4K videos, show 4K, 2K, 1080p, 720p
            if (maxVideoHeight >= 2160) {
                return quality <= maxVideoHeight && quality >= 720;
            }
            // For 2K videos, show 2K, 1080p, 720p
            else if (maxVideoHeight >= 1440) {
                return quality <= maxVideoHeight && quality >= 720;
            }
            // For 1080p videos, show 1080p, 720p
            else if (maxVideoHeight >= 1080) {
                return quality <= maxVideoHeight && quality >= 720;
            }
            // For 720p videos, show 720p, 480p
            else if (maxVideoHeight >= 720) {
                return quality <= maxVideoHeight && quality >= 480;
            }
            // For lower resolution videos, show all available options
            else {
                return quality <= maxVideoHeight;
            }
        });

        console.log(`Visible qualities: ${visibleQualities.join(', ')}p`);

        // Create video quality options dynamically
        const videoQualityContainer = document.getElementById('videoQualityOptions');
        videoQualityContainer.innerHTML = '';

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

        // Create audio quality options dynamically
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

        // Re-setup event handlers for the new elements
        this.setupQualitySelectionHandlers();

        // Auto-select default formats
        const firstVideoFormatOption = document.querySelector('#videoTab .format-option[data-format="mp4"]');
        if (firstVideoFormatOption) {
            firstVideoFormatOption.click();
        }

        const firstAudioFormatOption = document.querySelector('#audioTab .format-option[data-format="mp3"]');
        if (firstAudioFormatOption) {
            firstAudioFormatOption.click();
        }

        // Auto-select the highest video quality
        const firstVideoOption = document.querySelector('#videoQualityOptions .quality-option');
        if (firstVideoOption) {
            console.log(`Auto-selecting ${firstVideoOption.dataset.quality}p quality`);
            firstVideoOption.click();
        }

        // Auto-select the first audio quality option
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

        console.log('Update download button:', {
            currentTab,
            hasSelection,
            hasPath,
            videoQuality: this.selectedVideoQuality,
            videoFormat: this.selectedVideoFormat,
            audioQuality: this.selectedAudioQuality,
            audioFormat: this.selectedAudioFormat
        });

        this.downloadBtn.disabled = !hasSelection || !hasPath;
    }

    renderFormats(formats, container, type) {
        container.innerHTML = '';

        // Sort formats by quality
        const sortedFormats = formats.sort((a, b) => {
            if (type === 'video') {
                return this.getQualityOrder(b.quality) - this.getQualityOrder(a.quality);
            } else {
                // For audio, sort by actual bitrate or extract from quality string
                const aBitrate = a.audioBitrate || this.extractBitrate(a.quality) || 0;
                const bBitrate = b.audioBitrate || this.extractBitrate(b.quality) || 0;
                return bBitrate - aBitrate;
            }
        });

        sortedFormats.forEach(format => {
            const formatElement = this.createFormatElement(format, type);
            container.appendChild(formatElement);
        });

        // Auto-select best quality
        if (sortedFormats.length > 0) {
            const firstFormat = container.querySelector('.quality-option');
            if (firstFormat) {
                firstFormat.click();
            }
        }
    }

    createFormatElement(format, type) {
        const div = document.createElement('div');
        div.className = 'quality-option';
        div.dataset.itag = format.itag;

        const qualityLabel = format.quality;
        const fileSize = format.filesize ? this.formatFileSize(format.filesize) : 'Est. size';

        // Enhanced details for different format types
        let detailsHTML = '';
        if (type === 'video') {
            const fps = format.fps ? `${format.fps}fps` : '';
            const codec = format.videoCodec ? format.videoCodec.split('.')[0].toUpperCase() : '';
            const bitrate = format.videoBitrate ? `${Math.round(format.videoBitrate / 1000)}Mbps` : '';

            detailsHTML = `
                <div class="quality-label">${qualityLabel}</div>
                <div class="quality-details">
                    ${format.container.toUpperCase()} • ${fileSize}
                    ${fps ? `<br><span class="format-specs">${fps} • ${codec} • ${bitrate}</span>` : ''}
                </div>
            `;
        } else {
            const codec = format.audioCodec ? format.audioCodec.toUpperCase() : '';
            const bitrate = format.audioBitrate ? `${format.audioBitrate}kbps` : '';

            detailsHTML = `
                <div class="quality-label">${qualityLabel}</div>
                <div class="quality-details">
                    ${format.container.toUpperCase()} • ${fileSize}
                    ${codec ? `<br><span class="format-specs">${codec} • ${bitrate}</span>` : ''}
                </div>
            `;
        }

        div.innerHTML = detailsHTML;
        div.addEventListener('click', () => this.selectFormat(div, format));

        return div;
    }

    selectFormat(element, format) {
        // Remove previous selection
        element.parentElement.querySelectorAll('.quality-option').forEach(el => {
            el.classList.remove('selected');
        });

        // Select current
        element.classList.add('selected');
        this.selectedFormat = format;
        this.downloadBtn.disabled = !this.downloadPathInput.value;

        // Update format indicators to show conversion status
        this.updateFormatIndicators();
    }

    async selectDownloadPath() {
        try {
            const path = await window.electronAPI.selectDownloadPath();
            if (path) {
                this.downloadPathInput.value = path;
                this.downloadBtn.disabled = !this.selectedFormat;
            }
        } catch (error) {
            this.showError('Failed to select download path');
        }
    }

    async downloadVideo() {
        const currentTab = document.querySelector('.tab-btn.active').dataset.tab;

        // Check if we have the required selections
        if (currentTab === 'video') {
            if (!this.selectedVideoQuality || !this.selectedVideoFormat) {
                this.showError('Please select video quality and format');
                return;
            }

            // Log the selected quality for debugging
            console.log(`Selected video quality: ${this.selectedVideoQuality}p`);
        } else {
            if (!this.selectedAudioQuality || !this.selectedAudioFormat) {
                this.showError('Please select audio quality and format');
                return;
            }

            // Log the selected quality for debugging
            console.log(`Selected audio quality: ${this.selectedAudioQuality}kbps`);
        }

        if (!this.downloadPathInput.value) {
            this.showError('Please select download path');
            return;
        }

        const filename = this.filenameInput.value.trim() || this.sanitizeFilename(this.currentVideoInfo.title);

        // Determine target format and find best matching source format
        const isVideoFormat = currentTab === 'video';
        const targetFormat = isVideoFormat ? this.selectedVideoFormat : this.selectedAudioFormat;
        const targetQuality = isVideoFormat ? this.selectedVideoQuality : this.selectedAudioQuality;
        const fullFilename = `${filename}.${targetFormat}`;

        // Log the selected quality for debugging
        console.log(`Selected ${isVideoFormat ? 'video' : 'audio'} quality: ${targetQuality}${isVideoFormat ? 'p' : 'kbps'}`);
        console.log('Available formats:', this.availableFormats);

        // For ALL video downloads, we need to ensure we get the highest quality available
        let bestFormat;

        if (isVideoFormat) {
            console.log('Selecting best video format for quality:', targetQuality);

            // Always try to get the highest quality format available
            const allVideoFormats = this.availableFormats.filter(f => f.hasVideo);

            if (allVideoFormats.length === 0) {
                this.showError('No video formats available');
                return;
            }

            // Sort all video formats by height (highest first)
            const sortedFormats = allVideoFormats.sort((a, b) => {
                const heightA = a.height || this.extractHeightFromQuality(a.quality) || 0;
                const heightB = b.height || this.extractHeightFromQuality(b.quality) || 0;
                return heightB - heightA;
            });

            console.log('All video formats sorted by quality:', sortedFormats.map(f => ({
                itag: f.itag,
                height: f.height,
                quality: f.quality,
                hasVideo: f.hasVideo,
                hasAudio: f.hasAudio
            })));

            // For high resolutions (1080p+), force high-resolution download
            if (targetQuality >= 1080) {
                console.log('High resolution requested, forcing high-res download method');

                // Find the best format that matches or exceeds the target quality
                let selectedFormat = sortedFormats.find(f => {
                    const height = f.height || this.extractHeightFromQuality(f.quality) || 0;
                    return height >= targetQuality;
                });

                // If no format matches the target, use the highest available
                if (!selectedFormat) {
                    selectedFormat = sortedFormats[0];
                }

                console.log('Selected high-resolution format:', selectedFormat);

                // Create a format object that forces high-resolution download
                bestFormat = {
                    ...selectedFormat,
                    isHighResolution: true,
                    targetHeight: targetQuality,
                    forceHighRes: true
                };
            } else {
                // For lower resolutions, use normal selection
                bestFormat = this.findBestMatchingFormat(isVideoFormat, targetQuality);
            }
        } else {
            // For audio, use normal selection
            bestFormat = this.findBestMatchingFormat(isVideoFormat, targetQuality);
        }

        console.log('Best matching format found:', bestFormat);

        if (!bestFormat) {
            this.showError('No suitable format found for the selected quality');
            return;
        }

        this.setLoadingState(this.downloadBtn, true);
        this.showElements([this.progressSection]);
        this.progressTitle.textContent = 'Downloading...';

        try {
            const result = await window.electronAPI.downloadVideo({
                url: this.urlInput.value.trim(),
                format: bestFormat,
                outputPath: this.downloadPathInput.value,
                filename: fullFilename,
                targetFormat: targetFormat,
                isVideoFormat: isVideoFormat,
                targetQuality: targetQuality // Pass the selected quality directly
            });

            if (result.success) {
                this.addToHistory({
                    title: this.currentVideoInfo.title,
                    author: this.currentVideoInfo.author,
                    thumbnail: this.currentVideoInfo.thumbnail,
                    filename: fullFilename,
                    path: result.filePath,
                    date: new Date().toISOString(),
                    format: `${targetQuality}${isVideoFormat ? 'p' : 'kbps'}`,
                    outputFormat: targetFormat.toUpperCase()
                });

                this.showSuccess(`Download completed successfully as ${targetFormat.toUpperCase()}!`);
                this.hideElements([this.progressSection]);
            }
        } catch (error) {
            this.showError(`Download failed: ${error.message}`);
        } finally {
            this.setLoadingState(this.downloadBtn, false);
        }
    }

    updateProgress(percent, downloaded, total) {
        this.progressFill.style.width = `${percent}%`;
        this.progressPercent.textContent = `${percent}%`;
        this.progressSize.textContent = `${this.formatFileSize(downloaded)} / ${this.formatFileSize(total)}`;
    }

    updateConversionProgress(percent) {
        this.progressTitle.textContent = '🔄 Converting to target format...';
        this.progressFill.style.width = `${percent}%`;
        this.progressPercent.textContent = `${Math.round(percent)}%`;
        this.progressSize.textContent = 'Processing file...';
    }

    switchTab(tab) {
        console.log('Switching to tab:', tab);

        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        // Show/hide tab content - Fixed
        if (this.videoTab && this.audioTab) {
            this.videoTab.classList.toggle('hidden', tab !== 'video');
            this.audioTab.classList.toggle('hidden', tab !== 'audio');
        }

        // Reset selection based on tab
        if (tab === 'video') {
            this.selectedAudioQuality = null;
            // Keep video selection if exists
        } else {
            this.selectedVideoQuality = null;
            // Keep audio selection if exists
        }

        // Update download button state
        this.updateDownloadButton();
    }

    addToHistory(item) {
        this.downloadHistory.unshift(item);
        this.downloadHistory = this.downloadHistory.slice(0, 50); // Keep last 50
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
                        ${item.author} • ${item.format} • ${new Date(item.date).toLocaleDateString()}
                    </div>
                </div>
                <button class="history-remove-btn" data-index="${index}">×</button>
            </div>
        `).join('');

        // Add event listeners to remove buttons
        document.querySelectorAll('.history-remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent event bubbling
                const index = parseInt(btn.dataset.index);
                this.removeFromHistory(index);
            });
        });
    }

    removeFromHistory(index) {
        if (index >= 0 && index < this.downloadHistory.length) {
            // Remove the item from the array
            this.downloadHistory.splice(index, 1);

            // Update local storage
            localStorage.setItem('downloadHistory', JSON.stringify(this.downloadHistory));

            // Reload the history list
            this.loadDownloadHistory();

            // Show a notification
            this.showSuccess('Download removed from history');
        }
    }

    toggleHistoryList() {
        if (this.historyList) {
            // Toggle visibility classes
            const isHidden = this.historyList.classList.contains('hidden');

            if (isHidden) {
                this.historyList.classList.remove('hidden');
                this.historyList.classList.add('visible');
            } else {
                this.historyList.classList.remove('visible');
                this.historyList.classList.add('hidden');
            }

            // Toggle the arrow icon
            const toggleIcon = document.querySelector('.toggle-icon');
            if (toggleIcon) {
                toggleIcon.classList.toggle('active');
            }

            console.log('History list toggled:', isHidden ? 'showing' : 'hiding');
        }
    }

    // Utility methods
    setLoadingState(button, loading) {
        const spinner = button.querySelector('.spinner');
        const text = button.querySelector('.btn-text');

        if (loading) {
            spinner.classList.remove('hidden');
            text.style.opacity = '0.7';
            button.disabled = true;
        } else {
            spinner.classList.add('hidden');
            text.style.opacity = '1';
            button.disabled = false;
        }
    }

    showElements(elements) {
        elements.forEach(el => el.classList.remove('hidden'));
    }

    hideElements(elements) {
        elements.forEach(el => el.classList.add('hidden'));
    }

    showError(message) {
        // Create a better error notification
        this.showNotification(message, 'error');
    }

    showSuccess(message) {
        // Create a better success notification
        this.showNotification(message, 'success');
    }

    showNotification(message, type = 'info') {
        // Remove existing notifications
        const existing = document.querySelector('.notification');
        if (existing) {
            existing.remove();
        }

        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-icon">${type === 'error' ? '❌' : type === 'success' ? '✅' : 'ℹ️'}</span>
                <span class="notification-message">${message}</span>
                <button class="notification-close">×</button>
            </div>
        `;

        // Add to page
        document.body.appendChild(notification);

        // Add close functionality
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);

        // Animate in
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
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

    formatFileSize(bytes) {
        if (!bytes) return '0 B';
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
    }

    extractBitrate(quality) {
        // Extract bitrate from quality strings like "128kbps (Standard)"
        const match = quality.match(/(\d+)kbps/);
        return match ? parseInt(match[1]) : 0;
    }

    extractHeightFromQuality(quality) {
        // Extract height from quality strings like "Full HD (1080p)" or "1080p"
        const match = quality.match(/(\d+)p/);
        return match ? parseInt(match[1]) : 0;
    }

    removeDuplicateFormats(formats, type) {
        const seen = new Map();

        return formats.filter(format => {
            let key;

            if (type === 'video') {
                // For video: use height + container as key, keep highest bitrate
                const height = format.height || this.extractHeightFromQuality(format.quality);
                key = `${height}p_${format.container}`;

                if (seen.has(key)) {
                    const existing = seen.get(key);
                    const currentBitrate = format.videoBitrate || 0;
                    const existingBitrate = existing.videoBitrate || 0;

                    if (currentBitrate > existingBitrate) {
                        seen.set(key, format);
                        return true;
                    }
                    return false;
                } else {
                    seen.set(key, format);
                    return true;
                }
            } else {
                // For audio: use bitrate + container as key
                const bitrate = format.audioBitrate || this.extractBitrate(format.quality) || 0;
                key = `${bitrate}kbps_${format.container}`;

                if (seen.has(key)) {
                    return false; // Skip duplicates
                } else {
                    seen.set(key, format);
                    return true;
                }
            }
        });
    }

    toggleSectionVisibility(selector, hasContent, index) {
        const sections = document.querySelectorAll(selector);
        if (sections[index]) {
            sections[index].style.display = hasContent ? 'block' : 'none';
        }
    }

    updateFormatIndicators() {
        // Get current tab and selected format
        const currentTab = document.querySelector('.tab-btn.active').dataset.tab;
        const isVideoFormat = currentTab === 'video';

        // Get the selected format from the active format option
        const targetFormat = isVideoFormat
            ? this.selectedVideoFormat
            : this.selectedAudioFormat;

        // Update filename placeholder to show the target format
        const baseFilename = this.filenameInput.value.trim() || this.sanitizeFilename(this.currentVideoInfo?.title || 'video');
        this.filenameInput.placeholder = `${baseFilename}.${targetFormat}`;

        // Add visual indicator for conversion status
        if (this.selectedFormat) {
            const originalFormat = this.selectedFormat.container.toLowerCase();
            const needsConversion = originalFormat !== targetFormat.toLowerCase();

            if (needsConversion) {
                this.filenameInput.style.borderColor = 'var(--accent-warning)';
                this.filenameInput.title = `Will convert from ${originalFormat.toUpperCase()} to ${targetFormat.toUpperCase()}`;
            } else {
                this.filenameInput.style.borderColor = 'var(--border-primary)';
                this.filenameInput.title = `No conversion needed - already ${targetFormat.toUpperCase()}`;
            }
        }
    }

    findBestMatchingFormat(isVideoFormat, targetQuality) {
        if (isVideoFormat) {
            // For high resolutions (1080p+), YouTube often separates video and audio streams
            // So we need to check all video formats, not just those with both video and audio
            const allVideoFormats = this.availableFormats.filter(f => f.hasVideo);
            const videoOnlyFormats = this.availableFormats.filter(f => f.hasVideo && !f.hasAudio);
            const combinedFormats = this.availableFormats.filter(f => f.hasVideo && f.hasAudio);

            console.log(`Finding best format for video quality: ${targetQuality}p`);
            console.log('All available video formats:', allVideoFormats);
            console.log('Video-only formats:', videoOnlyFormats);
            console.log('Combined video+audio formats:', combinedFormats);

            // For high resolutions (1080p+), we need to look at video-only formats first
            // For 4K (2160p) and above, we MUST use video-only formats
            let formatsToSearch;

            // For 4K and above, we need to force the high-resolution flag
            // This will tell the main process to use the separate video/audio download method
            if (targetQuality >= 2160) {
                // Create a special format object for 4K
                const bestVideoFormat = videoOnlyFormats
                    .filter(f => f.height >= 2160 || (f.quality && f.quality.includes('2160')))
                    .sort((a, b) => (b.height || 0) - (a.height || 0))[0];

                if (bestVideoFormat) {
                    console.log('Found 4K video format:', bestVideoFormat);
                    // Add special flags to tell main process this is high resolution
                    bestVideoFormat.isHighResolution = true;
                    bestVideoFormat.targetHeight = 2160;
                    return bestVideoFormat;
                }

                // If no 4K format found, use the highest resolution available
                const highestFormat = videoOnlyFormats
                    .sort((a, b) => (b.height || 0) - (a.height || 0))[0];

                if (highestFormat) {
                    console.log('No 4K format found, using highest resolution:', highestFormat);
                    highestFormat.isHighResolution = true;
                    highestFormat.targetHeight = highestFormat.height || 1080;
                    return highestFormat;
                }

                // Fall back to combined formats if no video-only formats found
                formatsToSearch = combinedFormats;
            } else if (targetQuality >= 1080) {
                // For 1080p, also use video-only formats if available
                formatsToSearch = videoOnlyFormats.length > 0 ? videoOnlyFormats : combinedFormats;
                console.log('Using video-only formats for high resolution');
            } else {
                // For lower resolutions, prefer combined formats
                formatsToSearch = combinedFormats;
                console.log('Using combined formats for standard resolution');
            }

            // First, try to find an exact match for the target quality
            let exactMatch = formatsToSearch.find(f => {
                const height = f.height || this.extractHeightFromQuality(f.quality) || 0;
                return height === targetQuality;
            });

            if (exactMatch) {
                console.log(`Found exact match for ${targetQuality}p:`, exactMatch);
                return exactMatch;
            }

            // If no exact match, find the closest higher quality
            const higherQualityFormats = formatsToSearch.filter(f => {
                const height = f.height || this.extractHeightFromQuality(f.quality) || 0;
                return height > targetQuality;
            }).sort((a, b) => {
                const heightA = a.height || this.extractHeightFromQuality(a.quality) || 0;
                const heightB = b.height || this.extractHeightFromQuality(b.quality) || 0;
                return heightA - heightB; // Sort ascending to get the closest higher quality
            });

            if (higherQualityFormats.length > 0) {
                console.log(`Found higher quality format for ${targetQuality}p:`, higherQualityFormats[0]);
                return higherQualityFormats[0];
            }

            // If no higher quality, find the highest quality available
            const sortedFormats = [...formatsToSearch].sort((a, b) => {
                const heightA = a.height || this.extractHeightFromQuality(a.quality) || 0;
                const heightB = b.height || this.extractHeightFromQuality(b.quality) || 0;
                return heightB - heightA; // Sort descending to get highest quality first
            });

            if (sortedFormats.length > 0) {
                console.log(`No exact or higher match found, using highest quality:`, sortedFormats[0]);
                return sortedFormats[0];
            }

            // If we're looking for high quality but found nothing in video-only formats,
            // fall back to combined formats
            if (useAllFormats && combinedFormats.length > 0) {
                console.log('Falling back to combined formats:', combinedFormats);
                const bestCombined = combinedFormats.sort((a, b) => {
                    const heightA = a.height || this.extractHeightFromQuality(a.quality) || 0;
                    const heightB = b.height || this.extractHeightFromQuality(b.quality) || 0;
                    return heightB - heightA;
                })[0];
                return bestCombined;
            }

            console.log('No suitable video format found');
            return null;
        } else {
            // Find best audio format matching the target quality
            const audioFormats = this.availableFormats.filter(f => f.hasAudio && !f.hasVideo);

            console.log('Finding best format for audio quality:', targetQuality);
            console.log('Available audio formats:', audioFormats);

            // Sort audio formats by bitrate (highest first)
            const sortedFormats = [...audioFormats].sort((a, b) => {
                const bitrateA = a.audioBitrate || this.extractBitrate(a.quality) || 0;
                const bitrateB = b.audioBitrate || this.extractBitrate(b.quality) || 0;
                return bitrateB - bitrateA;
            });

            // Find the best format that's at least as good as the target quality
            // If none found, use the highest quality available
            let bestFormat = null;

            // First try to find a format with bitrate equal or higher than target
            for (const format of sortedFormats) {
                const bitrate = format.audioBitrate || this.extractBitrate(format.quality) || 0;
                if (bitrate >= targetQuality) {
                    bestFormat = format;
                    break;
                }
            }

            // If no suitable format found, use the highest quality available
            if (!bestFormat && sortedFormats.length > 0) {
                bestFormat = sortedFormats[0];
            }

            console.log('Selected best audio format:', bestFormat);
            return bestFormat;
        }
    }

    getQualityOrder(quality) {
        const qualityMap = {
            '4K (2160p)': 9, '2K (1440p)': 8, 'Full HD (1080p)': 7,
            'HD (720p)': 6, 'SD (480p)': 5, '360p': 4, '240p': 3, '144p': 2,
            '2160p': 9, '1440p': 8, '1080p': 7, '720p': 6,
            '480p': 5, '360p': 4, '240p': 3, '144p': 2
        };

        // Try exact match first
        if (qualityMap[quality]) {
            return qualityMap[quality];
        }

        // Try to extract resolution from quality string
        const match = quality.match(/(\d+)p/);
        if (match) {
            const height = parseInt(match[1]);
            if (height >= 2160) return 9;
            if (height >= 1440) return 8;
            if (height >= 1080) return 7;
            if (height >= 720) return 6;
            if (height >= 480) return 5;
            if (height >= 360) return 4;
            if (height >= 240) return 3;
            if (height >= 144) return 2;
        }

        return 1;
    }

    // Open Ko-fi link in default browser
    openKofiLink() {
        // Use Electron's shell.openExternal to open the link in the default browser
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