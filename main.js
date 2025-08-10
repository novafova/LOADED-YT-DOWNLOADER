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
async function convertFile(inputPath, outputPath, targetFormat, isVideoFormat, event) {
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

// Handle fallback dialog for format/quality issues
ipcMain.handle('show-fallback-dialog', async (event, options) => {
    const { originalQuality, originalFormat, maxAvailableQuality, hasWebM, message } = options;
    
    let buttons = ['Cancel'];
    let fallbackOptions = [];
    
    if (hasWebM && maxAvailableQuality >= originalQuality) {
        buttons.push(`Download as WebM (${originalQuality}p)`);
        fallbackOptions.push({ format: 'webm', quality: originalQuality });
    }
    
    if (maxAvailableQuality < originalQuality && maxAvailableQuality > 0) {
        buttons.push(`Lower to ${maxAvailableQuality}p ${originalFormat.toUpperCase()}`);
        fallbackOptions.push({ format: originalFormat, quality: maxAvailableQuality });
    }
    
    const result = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: 'Format Not Available',
        message: 'Download Format Issue',
        detail: message,
        buttons: buttons,
        defaultId: 1,
        cancelId: 0
    });
    
    if (result.response === 0) {
        return { cancelled: true };
    } else {
        const selectedOption = fallbackOptions[result.response - 1];
        return { 
            cancelled: false, 
            newFormat: selectedOption.format, 
            newQuality: selectedOption.quality 
        };
    }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
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
        icon: path.join(__dirname, 'assets', 'app-icon-256-hq.ico'),
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

// Disable hardware acceleration to prevent GPU issues
app.disableHardwareAcceleration();

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
        // Add timeout for video info requests
        const info = await Promise.race([
            ytdl.getInfo(url, {
                requestOptions: {
                    timeout: 30000 // 30 second timeout
                }
            }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Video info request timeout')), 35000)
            )
        ]);
        const videoDetails = info.videoDetails;

        // Detect if video has audio track
        const hasAudioTrack = info.formats.some(format => format.hasAudio);
        const hasVideoWithAudio = info.formats.some(format => format.hasVideo && format.hasAudio);
        const hasAudioOnly = info.formats.some(format => format.hasAudio && !format.hasVideo);
        
        console.log(`Audio detection: hasAudioTrack=${hasAudioTrack}, hasVideoWithAudio=${hasVideoWithAudio}, hasAudioOnly=${hasAudioOnly}`);

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
            formats: processedFormats,
            hasAudio: hasAudioTrack,
            hasVideoWithAudio: hasVideoWithAudio,
            hasAudioOnly: hasAudioOnly
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
    try {
        console.log('Starting enhanced download process');
        console.log(`Target quality: ${targetQuality}${isVideoFormat ? 'p' : 'kbps'}`);
        console.log(`Target format: ${targetFormat}`);
        
        // Extract the target quality from the parameters or format object
        let selectedQuality = targetQuality;
        
        // If targetQuality wasn't directly provided, try to extract it from the format object
        if (!selectedQuality && format && isVideoFormat) {
            selectedQuality = format.height || format.targetHeight || format.selectedVideoQuality;
        }
        
        const finalFilePath = path.join(outputPath, filename);
        
        // Use the enhanced simple downloader with encoding method
        // Parameters: url, outputPath, quality, format (with encodingMethod), event
        const formatWithSettings = {
            ...targetFormat,
            encodingMethod: format.encodingMethod || 'gpu' // Pass encoding method from frontend
        };
        
        const result = await simpleDownload(url, finalFilePath, selectedQuality, formatWithSettings, event);
        
        // If the downloaded file has a different format than requested, convert it
        if (result.success && targetFormat) {
            const downloadedExtension = path.extname(finalFilePath).toLowerCase().substring(1);
            
            if (downloadedExtension !== targetFormat.toLowerCase()) {
                console.log(`Converting from ${downloadedExtension} to ${targetFormat}`);
                
                const convertedPath = finalFilePath.replace(
                    path.extname(finalFilePath), 
                    `.${targetFormat}`
                );
                
                // Send conversion progress update
                event.sender.send('download-progress', {
                    percent: 100,
                    downloaded: 100,
                    total: 100,
                    message: 'Converting to target format...'
                });
                
                await convertFile(finalFilePath, convertedPath, targetFormat, isVideoFormat, event);
                
                // Remove original file and update result path
                if (fs.existsSync(finalFilePath)) {
                    fs.unlinkSync(finalFilePath);
                }
                
                result.filePath = convertedPath;
            }
        }
        
        return result;
    } catch (error) {
        console.error('Enhanced download failed:', error);
        throw error;
    }
});