const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Fix module resolution for packaged app (no ASAR)
if (app.isPackaged) {
    const appPath = path.dirname(app.getAppPath());
    const nodeModulesPath = path.join(appPath, 'node_modules');
    if (fs.existsSync(nodeModulesPath)) {
        module.paths.unshift(nodeModulesPath);
    }
}

const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

// Format conversion function
function convertFile(inputPath, outputPath, targetFormat, isVideoFormat, event) {
    return new Promise((resolve, reject) => {
        try {
            // Check if input file exists
            if (!fs.existsSync(inputPath)) {
                return reject(new Error(`Input file does not exist: ${inputPath}`));
            }

            // Create output directory if it doesn't exist
            const outputDir = path.dirname(outputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            // Start with a basic command
            let command = ffmpeg(inputPath);

            // Configure conversion based on target format
            if (isVideoFormat) {
                // Video conversion settings - preserve original resolution and quality
                switch (targetFormat.toLowerCase()) {
                    case 'mp4':
                        command = command
                            .outputOptions([
                                '-c:v copy',         // Copy video stream without re-encoding to preserve quality
                                '-c:a copy',         // Copy audio stream without re-encoding
                                '-map 0',            // Map all streams from input
                                '-map_metadata 0',   // Copy all metadata from input
                                '-movflags', '+faststart', // Optimize for web streaming
                                '-metadata:s:v:0', 'encoder=Loaded' // Add custom encoder metadata
                            ])
                            .format('mp4');
                        break;
                    case 'mov':
                        command = command
                            .outputOptions([
                                '-c:v copy',         // Copy video stream without re-encoding to preserve quality
                                '-c:a copy',         // Copy audio stream without re-encoding
                                '-map 0',            // Map all streams from input
                                '-map_metadata 0',   // Copy all metadata from input
                                '-metadata:s:v:0', 'encoder=Loaded' // Add custom encoder metadata
                            ])
                            .format('mov');
                        break;
                    case 'mkv':
                        command = command
                            .outputOptions([
                                '-c:v', 'copy',         // Copy video stream without re-encoding to preserve quality
                                '-c:a', 'copy',         // Copy audio stream without re-encoding
                                '-map', '0',            // Map all streams from input
                                '-map_metadata', '0'    // Copy all metadata from input
                            ])
                            .format('matroska');
                        break;
                    default:
                        command = command
                            .outputOptions([
                                '-map_metadata', '0',   // Copy all metadata from input
                                '-metadata:s:v:0', 'encoder=Loaded', // Add custom encoder metadata
                                '-c:v', 'copy',         // Copy video stream without re-encoding
                                '-c:a', 'copy'          // Copy audio stream without re-encoding
                            ])
                            .format(targetFormat);
                }
            } else {
                // Audio conversion settings - simpler settings
                switch (targetFormat.toLowerCase()) {
                    case 'mp3':
                        command = command
                            .noVideo()
                            .audioCodec('libmp3lame')
                            .audioBitrate('192k') // Lower bitrate for better compatibility
                            .outputOptions([
                                '-map_metadata', '0',   // Copy all metadata from input
                                '-metadata', 'encoder=Loaded' // Add custom encoder metadata
                            ])
                            .format('mp3');
                        break;
                    case 'wav':
                        command = command
                            .noVideo()
                            .audioCodec('pcm_s16le')
                            .outputOptions([
                                '-map_metadata', '0',   // Copy all metadata from input
                                '-metadata', 'encoder=Loaded' // Add custom encoder metadata
                            ])
                            .format('wav');
                        break;
                    default:
                        command = command
                            .noVideo()
                            .outputOptions([
                                '-map_metadata', '0',   // Copy all metadata from input
                                '-metadata', 'encoder=Loaded' // Add custom encoder metadata
                            ])
                            .format(targetFormat);
                }
            }

            // Add progress tracking
            command.on('progress', (progress) => {
                try {
                    const percent = Math.round(progress.percent || 0);
                    event.sender.send('conversion-progress', percent);
                } catch (err) {
                    console.error('Error sending progress update:', err);
                }
            });

            // Add completion handlers
            command.on('end', () => {
                console.log(`Conversion completed: ${outputPath}`);
                resolve();
            });

            command.on('error', (error) => {
                console.error('Conversion error:', error);
                if (error.message) {
                    console.error('FFmpeg stderr:', error.message);
                }
                reject(error);
            });

            // Start the conversion
            command.save(outputPath);

        } catch (error) {
            console.error('Failed to start conversion:', error);
            reject(error);
        }
    });
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Application specific logging, throwing an error, or other logic here
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Graceful shutdown
    if (mainWindow) {
        mainWindow.webContents.send('error', 'An unexpected error occurred');
    }
});

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        titleBarStyle: 'hidden',
        frame: false,
        backgroundColor: '#1a1a1a'
    });

    mainWindow.loadFile('index.html');

    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Window control handlers
ipcMain.handle('window-minimize', () => {
    if (mainWindow) {
        mainWindow.minimize();
    }
});

ipcMain.handle('window-maximize', () => {
    if (mainWindow) {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    }
});

ipcMain.handle('window-close', () => {
    if (mainWindow) {
        mainWindow.close();
    }
});

// External link handler
ipcMain.handle('open-external-link', async (event, url) => {
    try {
        const { shell } = require('electron');
        await shell.openExternal(url);
        return { success: true };
    } catch (error) {
        console.error('Failed to open external link:', error);
        throw new Error(`Failed to open external link: ${error.message}`);
    }
});

// IPC handlers
ipcMain.handle('get-video-info', async (event, url) => {
    try {
        const info = await ytdl.getInfo(url);
        const videoDetails = info.videoDetails;

        // Process and categorize formats
        const processedFormats = info.formats
            .filter(format => format.hasVideo || format.hasAudio)
            .map(format => {
                // Enhanced quality detection
                let qualityLabel = 'unknown';
                let qualityOrder = 0;

                if (format.hasVideo) {
                    // Video quality mapping - try multiple sources for height
                    let height = format.height;

                    // If no height, try to extract from quality or qualityLabel
                    if (!height && format.qualityLabel) {
                        const match = format.qualityLabel.match(/(\d+)p?/);
                        if (match) height = parseInt(match[1]);
                    }
                    if (!height && format.quality) {
                        const match = format.quality.match(/(\d+)p?/);
                        if (match) height = parseInt(match[1]);
                    }

                    const heightMap = {
                        4320: { label: '8K UHD (4320p)', order: 12 },
                        2880: { label: '5K (2880p)', order: 11 },
                        2160: { label: '4K UHD (2160p)', order: 10 },
                        1440: { label: '2K QHD (1440p)', order: 9 },
                        1080: { label: 'Full HD (1080p)', order: 8 },
                        720: { label: 'HD (720p)', order: 7 },
                        480: { label: 'SD (480p)', order: 6 },
                        360: { label: '360p', order: 5 },
                        240: { label: '240p', order: 4 },
                        144: { label: '144p', order: 3 }
                    };

                    // Try to match by height
                    if (height && heightMap[height]) {
                        qualityLabel = heightMap[height].label;
                        qualityOrder = heightMap[height].order;
                    } else if (format.qualityLabel) {
                        qualityLabel = format.qualityLabel;
                        qualityOrder = height || 1;
                    } else if (format.quality) {
                        qualityLabel = format.quality;
                        qualityOrder = height || 1;
                    } else {
                        qualityLabel = `${height}p` || 'Video';
                        qualityOrder = height || 1;
                    }
                } else if (format.hasAudio) {
                    // Audio quality mapping
                    const bitrate = format.audioBitrate || 0;
                    if (bitrate >= 320) {
                        qualityLabel = `${bitrate}kbps (Premium)`;
                        qualityOrder = 5;
                    } else if (bitrate >= 256) {
                        qualityLabel = `${bitrate}kbps (High)`;
                        qualityOrder = 4;
                    } else if (bitrate >= 192) {
                        qualityLabel = `${bitrate}kbps (Good)`;
                        qualityOrder = 3;
                    } else if (bitrate >= 128) {
                        qualityLabel = `${bitrate}kbps (Standard)`;
                        qualityOrder = 2;
                    } else if (bitrate > 0) {
                        qualityLabel = `${bitrate}kbps (Low)`;
                        qualityOrder = 1;
                    } else {
                        qualityLabel = 'Audio';
                        qualityOrder = 1;
                    }
                }

                return {
                    itag: format.itag,
                    quality: qualityLabel,
                    qualityOrder: qualityOrder,
                    container: format.container,
                    hasVideo: format.hasVideo,
                    hasAudio: format.hasAudio,
                    filesize: format.contentLength,
                    fps: format.fps,
                    videoBitrate: format.bitrate,
                    audioBitrate: format.audioBitrate,
                    videoCodec: format.videoCodec,
                    audioCodec: format.audioCodec,
                    width: format.width,
                    height: format.height
                };
            })
            .sort((a, b) => b.qualityOrder - a.qualityOrder);

        return {
            title: videoDetails.title,
            author: videoDetails.author.name,
            lengthSeconds: videoDetails.lengthSeconds,
            viewCount: videoDetails.viewCount,
            thumbnail: videoDetails.thumbnails[videoDetails.thumbnails.length - 1].url,
            formats: processedFormats
        };
    } catch (error) {
        throw new Error(`Failed to get video info: ${error.message}`);
    }
});

ipcMain.handle('select-download-path', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });

    return result.canceled ? null : result.filePaths[0];
});

// Get default downloads folder
ipcMain.handle('get-default-downloads-path', async () => {
    const os = require('os');
    return path.join(os.homedir(), 'Downloads', 'YouTube Downloads');
});

// Create auto-export directory if it doesn't exist
ipcMain.handle('ensure-auto-export-dir', async (event, dirPath) => {
    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        return { success: true, path: dirPath };
    } catch (error) {
        throw new Error(`Failed to create directory: ${error.message}`);
    }
});

// Import the simple downloader
const { downloadVideo: simpleDownload } = require('./simple-downloader');

ipcMain.handle('download-video', async (event, { url, format, outputPath, filename, targetFormat, isVideoFormat, targetQuality }) => {
    // Use the simple downloader to avoid FFmpeg errors
    try {
        console.log('Using simple downloader to avoid FFmpeg errors');
        
        // Extract the target quality from the parameters or format object
        let selectedQuality = targetQuality;
        
        // If targetQuality wasn't directly provided, try to extract it from the format object
        if (!selectedQuality && format && isVideoFormat) {
            // Try to get the height directly from the format
            selectedQuality = format.height;
            
            // If no height, try to get it from targetHeight
            if (!selectedQuality && format.targetHeight) {
                selectedQuality = format.targetHeight;
            }
            
            // If still no height, check if there's a selected quality in the format object
            if (!selectedQuality && format.selectedVideoQuality) {
                selectedQuality = format.selectedVideoQuality;
            }
        }
        
        console.log(`Target quality for download: ${selectedQuality}p`);
        console.log(`Target format: ${targetFormat}`);
        
        const finalFilePath = path.join(outputPath, filename);
        const result = await simpleDownload(url, finalFilePath, isVideoFormat, event, selectedQuality);
        return result;
    } catch (error) {
        console.error('Simple downloader failed:', error);
        throw error;
    }
    
    // Original implementation below (will not be reached)
    return new Promise(async (resolve, reject) => {
        try {
            console.log('Selected format:', format);
            console.log('Format height:', format.height);
            console.log('Format target height:', format.targetHeight);
            console.log('Format force high res:', format.forceHighRes);

            // Get video info again to ensure we have the latest formats
            const info = await ytdl.getInfo(url);

            // Get the target height from the selected format or the explicit target height
            const targetHeight = format.targetHeight || format.height || 0;
            console.log(`Target height: ${targetHeight}p`);

            // Check if this is a forced high-resolution download
            const forceHighRes = format.forceHighRes || false;
            console.log('Force high resolution:', forceHighRes);

            // For very high resolutions (4K+), YouTube separates video and audio streams
            // Check both the format's height and the explicit high resolution flag
            let isHighResolution = format.isHighResolution || targetHeight >= 2160 || forceHighRes;
            console.log('Is high resolution:', isHighResolution);

            // Only use high-resolution method for 4K+ or when explicitly forced
            // For 1080p, try combined formats first before falling back to separate streams
            if (forceHighRes || (isVideoFormat && targetHeight >= 2160)) {
                console.log('FORCING high-resolution download method due to user selection');
                console.log('Available formats:', info.formats.map(f => ({
                    itag: f.itag,
                    height: f.height,
                    hasVideo: f.hasVideo,
                    hasAudio: f.hasAudio,
                    quality: f.qualityLabel || f.quality
                })));

                // Find the best format that matches the target resolution, not just the highest
                const videoFormats = info.formats
                    .filter(f => f.hasVideo && !f.hasAudio)  // Video-only formats for high resolution
                    .sort((a, b) => (b.height || 0) - (a.height || 0));

                console.log('Video-only formats found:', videoFormats.length);
                console.log('Video-only formats:', videoFormats.map(f => ({
                    itag: f.itag,
                    height: f.height,
                    quality: f.qualityLabel || f.quality
                })));

                if (videoFormats.length > 0) {
                    // Find the format that best matches the target height
                    let selectedVideoFormat = null;

                    // First, try to find an exact match or the closest match to the target height
                    for (const videoFormat of videoFormats) {
                        if (videoFormat.height === targetHeight) {
                            selectedVideoFormat = videoFormat;
                            console.log(`Found exact match for ${targetHeight}p:`, selectedVideoFormat);
                            break;
                        }
                    }

                    // If no exact match, find the closest higher resolution
                    if (!selectedVideoFormat) {
                        selectedVideoFormat = videoFormats.find(f => f.height >= targetHeight);
                        if (selectedVideoFormat) {
                            console.log(`Found closest higher resolution for ${targetHeight}p:`, selectedVideoFormat);
                        }
                    }

                    // If still no match, use the highest available (fallback)
                    if (!selectedVideoFormat) {
                        selectedVideoFormat = videoFormats[0];
                        console.log(`No suitable match found, using highest available:`, selectedVideoFormat);
                    }

                    console.log('Selected video format height:', selectedVideoFormat.height);

                    // Force the high-resolution download path
                    format = {
                        ...selectedVideoFormat,
                        isHighResolution: true,
                        targetHeight: targetHeight,
                        forceHighRes: true
                    };

                    console.log('Format override complete. New format:', format);
                    console.log('New format height:', format.height);
                } else {
                    console.log('No video-only formats found, checking combined formats...');
                    const combinedFormats = info.formats
                        .filter(f => f.hasVideo && f.hasAudio)
                        .sort((a, b) => (b.height || 0) - (a.height || 0));

                    console.log('Combined formats found:', combinedFormats.length);
                    console.log('Combined formats:', combinedFormats.map(f => ({
                        itag: f.itag,
                        height: f.height,
                        quality: f.qualityLabel || f.quality
                    })));

                    if (combinedFormats.length > 0) {
                        // Find the best combined format that matches the target resolution
                        let selectedCombinedFormat = combinedFormats.find(f => f.height === targetHeight);

                        if (!selectedCombinedFormat) {
                            selectedCombinedFormat = combinedFormats.find(f => f.height >= targetHeight);
                        }

                        if (!selectedCombinedFormat) {
                            selectedCombinedFormat = combinedFormats[0];
                        }

                        console.log('Using best combined format:', selectedCombinedFormat);
                        console.log('Best combined format height:', selectedCombinedFormat.height);

                        format = {
                            ...selectedCombinedFormat,
                            isHighResolution: selectedCombinedFormat.height >= 1080,
                            targetHeight: targetHeight,
                            forceHighRes: true
                        };

                        console.log('Combined format override complete. New format:', format);
                        console.log('New combined format height:', format.height);
                    }
                }

                // Force the isHighResolution flag to true
                isHighResolution = true;
                console.log('Final isHighResolution flag:', isHighResolution);
                console.log('Final format after override:', format);
            }

            // Create temporary file paths
            const timestamp = Date.now();
            const tempVideoPath = path.join(outputPath, `temp_video_${timestamp}.mp4`);
            const tempAudioPath = path.join(outputPath, `temp_audio_${timestamp}.mp4`);
            const tempMergedPath = path.join(outputPath, `temp_merged_${timestamp}.mp4`);
            const finalFilePath = path.join(outputPath, filename);

            // Log the paths for debugging
            console.log('Final file path:', finalFilePath);

            if (isHighResolution && isVideoFormat) {
                console.log('Using separate video and audio streams for high resolution');

                // Find best video format based on target height
                let videoFormat;

                // If the format already has isHighResolution flag, use it directly
                if (format.isHighResolution) {
                    console.log('Using pre-selected high resolution format:', format);
                    videoFormat = format;
                }
                // Otherwise, find the best format based on target height
                else if (targetHeight >= 2160) { // 4K
                    console.log('Searching for 4K format...');
                    const fourKFormats = info.formats.filter(f =>
                        f.hasVideo &&
                        !f.hasAudio && // Video-only formats
                        (f.height === 2160 || (f.qualityLabel && f.qualityLabel.includes('2160p')))
                    );

                    if (fourKFormats.length > 0) {
                        videoFormat = fourKFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
                        console.log('Found 4K video format:', videoFormat);
                    } else {
                        // If no 4K, get the highest resolution available
                        const highResFormats = info.formats
                            .filter(f => f.hasVideo && !f.hasAudio)
                            .sort((a, b) => (b.height || 0) - (a.height || 0));

                        if (highResFormats.length > 0) {
                            videoFormat = highResFormats[0];
                            console.log('Selected highest resolution video format:', videoFormat);
                        }
                    }
                } else if (targetHeight >= 1080) { // 1080p
                    const fullHDFormats = info.formats.filter(f =>
                        f.hasVideo &&
                        !f.hasAudio && // Video-only formats
                        (f.height === 1080 || (f.qualityLabel && f.qualityLabel.includes('1080p')))
                    );

                    if (fullHDFormats.length > 0) {
                        videoFormat = fullHDFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
                        console.log('Found 1080p video format:', videoFormat);
                    } else {
                        // Fall back to highest resolution
                        const highResFormats = info.formats
                            .filter(f => f.hasVideo && !f.hasAudio)
                            .sort((a, b) => (b.height || 0) - (a.height || 0));

                        if (highResFormats.length > 0) {
                            videoFormat = highResFormats[0];
                            console.log('Selected highest resolution video format:', videoFormat);
                        }
                    }
                }

                // If we couldn't find a video-only format, fall back to combined format
                if (!videoFormat) {
                    console.log('No suitable video-only format found, falling back to combined format');
                    const combinedFormats = info.formats
                        .filter(f => f.hasVideo && f.hasAudio)
                        .sort((a, b) => (b.height || 0) - (a.height || 0));

                    if (combinedFormats.length > 0) {
                        const selectedFormat = combinedFormats[0];
                        console.log('Selected combined format:', selectedFormat);

                        // Download the combined format directly
                        const stream = ytdl(url, { quality: selectedFormat.itag });
                        const writeStream = fs.createWriteStream(tempMergedPath);

                        stream.on('progress', (chunkLength, downloaded, total) => {
                            const percent = (downloaded / total * 100).toFixed(1);
                            event.sender.send('download-progress', { percent, downloaded, total });
                        });

                        stream.pipe(writeStream);

                        await new Promise((resolve, reject) => {
                            writeStream.on('finish', resolve);
                            writeStream.on('error', reject);
                            stream.on('error', reject);
                        });

                        // Convert to target format if needed
                        if (selectedFormat.container.toLowerCase() !== targetFormat.toLowerCase()) {
                            event.sender.send('download-progress', { percent: '100', downloaded: 100, total: 100 });
                            await convertFile(tempMergedPath, finalFilePath, targetFormat, true, event);

                            // Clean up temp file
                            if (fs.existsSync(tempMergedPath)) {
                                fs.unlinkSync(tempMergedPath);
                            }
                        } else {
                            // No conversion needed, just rename
                            fs.renameSync(tempMergedPath, finalFilePath);
                        }

                        resolve({ success: true, filePath: finalFilePath });
                        return;
                    } else {
                        reject(new Error('No suitable video format found'));
                        return;
                    }
                }

                // Find best audio format
                const audioFormats = info.formats
                    .filter(f => f.hasAudio && !f.hasVideo)
                    .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));

                if (audioFormats.length === 0) {
                    reject(new Error('No suitable audio format found'));
                    return;
                }

                const audioFormat = audioFormats[0];
                console.log('Selected audio format:', audioFormat);

                // Download video and audio streams in parallel
                console.log('Downloading video stream...');
                const videoStream = ytdl(url, { quality: videoFormat.itag });
                const videoWriteStream = fs.createWriteStream(tempVideoPath);

                videoStream.on('progress', (chunkLength, downloaded, total) => {
                    const percent = (downloaded / total * 50).toFixed(1); // First 50%
                    event.sender.send('download-progress', { percent, downloaded, total: total * 2 });
                });

                videoStream.pipe(videoWriteStream);

                await new Promise((resolve, reject) => {
                    videoWriteStream.on('finish', resolve);
                    videoWriteStream.on('error', reject);
                    videoStream.on('error', reject);
                });

                console.log('Video download complete. Downloading audio stream...');
                const audioStream = ytdl(url, { quality: audioFormat.itag });
                const audioWriteStream = fs.createWriteStream(tempAudioPath);

                audioStream.on('progress', (chunkLength, downloaded, total) => {
                    const percent = (50 + (downloaded / total * 50)).toFixed(1); // Last 50%
                    event.sender.send('download-progress', { percent, downloaded: downloaded + total, total: total * 2 });
                });

                audioStream.pipe(audioWriteStream);

                await new Promise((resolve, reject) => {
                    audioWriteStream.on('finish', resolve);
                    audioWriteStream.on('error', reject);
                    audioStream.on('error', reject);
                });

                console.log('Audio download complete. Merging streams...');
                event.sender.send('conversion-progress', 0);

                // Use a much simpler approach - just use the video stream directly
                // This avoids the FFmpeg merging step that's causing errors
                console.log('Using simplified approach to avoid FFmpeg errors');
                
                try {
                    // Instead of trying to merge video and audio, just use the best combined format
                    const combinedFormats = info.formats
                        .filter(f => f.hasVideo && f.hasAudio)
                        .sort((a, b) => (b.height || 0) - (a.height || 0));
                    
                    if (combinedFormats.length > 0) {
                        const bestCombinedFormat = combinedFormats[0];
                        console.log('Using best combined format instead of merging:', bestCombinedFormat);
                        
                        // Download this format directly to the final path
                        await downloadSimple(url, bestCombinedFormat.itag, tempMergedPath);
                        
                        // Convert to target format if needed
                        if (bestCombinedFormat.container.toLowerCase() !== targetFormat.toLowerCase()) {
                            console.log('Converting to target format:', targetFormat);
                            try {
                                await convertFile(tempMergedPath, finalFilePath, targetFormat, true, event);
                            } catch (convErr) {
                                console.error('Conversion error, using original format:', convErr);
                                // If conversion fails, just use the original format
                                fs.renameSync(tempMergedPath, finalFilePath);
                            }
                        } else {
                            // No conversion needed, just rename
                            fs.renameSync(tempMergedPath, finalFilePath);
                        }
                    } else {
                        // If no combined format, just use the video format directly
                        console.log('No combined formats found, using video format directly');
                        await downloadSimple(url, videoFormat.itag, finalFilePath);
                    }
                } catch (err) {
                    console.error('Error in simplified approach:', err);
                    throw err;
                }

                console.log('Streams merged successfully');

                // Convert to target format if needed
                if ('mp4' !== targetFormat.toLowerCase()) {
                    console.log('Converting to target format:', targetFormat);
                    await convertFile(tempMergedPath, finalFilePath, targetFormat, true, event);
                } else {
                    // No conversion needed, just rename
                    fs.renameSync(tempMergedPath, finalFilePath);
                }

                // Clean up temp files
                try {
                    if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
                    if (fs.existsSync(tempAudioPath)) fs.unlinkSync(tempAudioPath);
                    if (fs.existsSync(tempMergedPath)) fs.unlinkSync(tempMergedPath);
                } catch (err) {
                    console.error('Error cleaning up temp files:', err);
                }

                resolve({ success: true, filePath: finalFilePath });
            } else {
                // For lower resolutions or audio-only, use the original approach
                console.log('Using standard download approach for lower resolution or audio');

                // Find the best format based on the requested quality
                let selectedFormat;

                if (isVideoFormat) {
                    // For video, find the format with the closest height to what was requested
                    const videoFormats = info.formats.filter(f => f.hasVideo && f.hasAudio);

                    // Sort by height (closest to target)
                    const sortedFormats = videoFormats.sort((a, b) => {
                        const heightA = a.height || 0;
                        const heightB = b.height || 0;

                        // If one matches exactly, prioritize it
                        if (heightA === targetHeight && heightB !== targetHeight) return -1;
                        if (heightB === targetHeight && heightA !== targetHeight) return 1;

                        // Otherwise get the closest
                        return Math.abs(heightA - targetHeight) - Math.abs(heightB - targetHeight);
                    });

                    if (sortedFormats.length > 0) {
                        selectedFormat = sortedFormats[0];
                    } else {
                        selectedFormat = format; // Fall back to original selection
                    }
                } else {
                    // For audio, find the format with the highest audio bitrate
                    const audioFormats = info.formats.filter(f => f.hasAudio && !f.hasVideo);

                    if (audioFormats.length > 0) {
                        selectedFormat = audioFormats.sort((a, b) =>
                            (b.audioBitrate || 0) - (a.audioBitrate || 0)
                        )[0];
                    } else {
                        selectedFormat = format; // Fall back to original selection
                    }
                }

                console.log('Selected format:', selectedFormat);

                // Create temporary file path for initial download
                const tempFilename = `temp_${timestamp}.${selectedFormat.container || 'mp4'}`;
                const tempFilePath = path.join(outputPath, tempFilename);

                // Download the selected format
                const stream = ytdl(url, { quality: selectedFormat.itag });
                const writeStream = fs.createWriteStream(tempFilePath);

                // Add error handling for the ytdl stream
                stream.on('error', (error) => {
                    console.error('Stream error:', error);
                    writeStream.destroy();
                    // Clean up temp file
                    if (fs.existsSync(tempFilePath)) {
                        fs.unlinkSync(tempFilePath);
                    }
                    reject(new Error(`Download stream error: ${error.message}`));
                });

                stream.on('progress', (chunkLength, downloaded, total) => {
                    const percent = (downloaded / total * 100).toFixed(1);
                    event.sender.send('download-progress', { percent, downloaded, total });
                });

                stream.pipe(writeStream);

                writeStream.on('finish', async () => {
                    try {
                        // Check if conversion is needed
                        const needsConversion = selectedFormat.container.toLowerCase() !== targetFormat.toLowerCase();

                        if (needsConversion) {
                            // Convert to target format using FFmpeg
                            event.sender.send('download-progress', { percent: '100', downloaded: 100, total: 100 });
                            await convertFile(tempFilePath, finalFilePath, targetFormat, isVideoFormat, event);

                            // Clean up temp file
                            if (fs.existsSync(tempFilePath)) {
                                fs.unlinkSync(tempFilePath);
                            }
                        } else {
                            // No conversion needed, just rename
                            fs.renameSync(tempFilePath, finalFilePath);
                        }

                        resolve({ success: true, filePath: finalFilePath });
                    } catch (conversionError) {
                        // Clean up files on conversion error
                        if (fs.existsSync(tempFilePath)) {
                            fs.unlinkSync(tempFilePath);
                        }
                        if (fs.existsSync(finalFilePath)) {
                            fs.unlinkSync(finalFilePath);
                        }
                        reject(new Error(`Conversion failed: ${conversionError.message}`));
                    }
                });

                writeStream.on('error', (error) => {
                    console.error('Write stream error:', error);
                    // Clean up temp file
                    if (fs.existsSync(tempFilePath)) {
                        fs.unlinkSync(tempFilePath);
                    }
                    reject(new Error(`File write error: ${error.message}`));
                });
            }
        } catch (error) {
            console.error('Download setup error:', error);
            reject(new Error(`Download setup failed: ${error.message}`));
        }
    });
});

ipcMain.handle('convert-audio', async (event, { inputPath, outputPath }) => {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .toFormat('mp3')
            .on('progress', (progress) => {
                event.sender.send('conversion-progress', progress.percent);
            })
            .on('end', () => {
                resolve({ success: true });
            })
            .on('error', (error) => {
                reject(error);
            })
            .save(outputPath);
    });
});

// Window controls
ipcMain.handle('window-minimize', () => {
    mainWindow.minimize();
});

ipcMain.handle('window-maximize', () => {
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow.maximize();
    }
});

ipcMain.handle('window-close', () => {
    mainWindow.close();
});