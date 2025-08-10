// Enhanced downloader module for YouTube videos
// Handles both simple (SD) and complex (HD/4K) downloads with merging.

const fs = require('fs');
const path = require('path');
const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

// Helper function to parse FFmpeg timemark (HH:MM:SS.MS) to seconds
function parseTimemarkToSeconds(timemark) {
    try {
        const parts = timemark.split(':');
        if (parts.length !== 3) return 0;

        const hours = parseInt(parts[0]) || 0;
        const minutes = parseInt(parts[1]) || 0;
        const seconds = parseFloat(parts[2]) || 0;

        return hours * 3600 + minutes * 60 + seconds;
    } catch (error) {
        return 0;
    }
}

/**
 * The main download function that acts as a router.
 * It decides whether to use a simple download or a complex high-resolution download.
 */
async function downloadVideo(url, outputPath, quality, format, event) {
    console.log(`🎬 Starting download for ${quality}p`);

    // For 1080p and above, we MUST use the high-resolution method.
    if (quality >= 1080) {
        console.log('High resolution detected. Using separate stream download method.');
        return downloadHighResolution(url, outputPath, quality, format, event);
    } else {
        // For lower resolutions, the simple, single-file method is sufficient.
        console.log('Standard resolution detected. Using simple download method.');
        return downloadStandardResolution(url, outputPath, quality, format, event);
    }
}

/**
 * Downloads a single stream (video or audio) with a robust timeout and error handling.
 * This is the final, definitive version.
 */
async function downloadStream(url, formatInfo, tempPath, event, type, progressStart, progressEnd) {
    return new Promise((resolve, reject) => {
        console.log(`📥 Starting ${type} stream download to ${tempPath}`);
        
        const stream = ytdl(url, { format: formatInfo });
        let downloadedBytes = 0;
        let totalBytes = parseInt(formatInfo.contentLength) || 0;
        let lastUpdateTime = Date.now();
        let timeout = null;

        // [THE FIX #1] - Add a "no-progress" timeout for the download itself.
        const startTimeout = () => {
            timeout = setTimeout(() => {
                stream.destroy(); // Stop the download stream
                reject(new Error(`${type} download timed out due to no activity.`));
            }, 60000); // 60-second timeout
        };

        stream.on('response', (res) => {
            console.log(`✅ ${type} stream response received.`);
            if (!totalBytes) totalBytes = parseInt(res.headers['content-length']);
            console.log(`📊 ${type} size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
            startTimeout(); // Start the timeout once the download begins
        });

        stream.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            
            // Reset the timeout timer on every data chunk.
            clearTimeout(timeout);
            startTimeout();

            if (totalBytes > 0) {
                const streamPercent = (downloadedBytes / totalBytes) * 100;
                const overallPercent = progressStart + (streamPercent / 100) * (progressEnd - progressStart);
                
                // Only send progress updates periodically to avoid spamming the main thread.
                const now = Date.now();
                if (now - lastUpdateTime > 500) { // Update every 500ms
                    lastUpdateTime = now;
                    event.sender.send('download-progress', {
                        percent: Math.min(overallPercent, progressEnd),
                        downloaded: downloadedBytes,
                        total: totalBytes,
                        message: `Downloading ${type}... (${(downloadedBytes / 1024 / 1024).toFixed(1)}MB / ${(totalBytes / 1024 / 1024).toFixed(1)}MB)`
                    });
                }
            }
        });

        // [THE FIX #2] - Listen for the 'error' event specifically on the stream.
        stream.on('error', (err) => {
            clearTimeout(timeout);
            console.error(`❌ Error during ${type} stream download:`, err.message);
            reject(new Error(`Failed to download ${type} stream: ${err.message}`));
        });

        stream.pipe(fs.createWriteStream(tempPath))
            .on('finish', () => {
                clearTimeout(timeout);
                console.log(`✅ ${type} stream finished downloading.`);
                // Send a final progress update for this phase
                event.sender.send('download-progress', {
                    percent: progressEnd,
                    downloaded: downloadedBytes,
                    total: totalBytes,
                    message: `Downloading ${type}... (Complete)`
                });
                resolve();
            })
            .on('error', (err) => {
                clearTimeout(timeout);
                console.error(`❌ Error writing ${type} stream to file:`, err.message);
                reject(err);
            });
    });
}

/**
 * GPU-based hardware acceleration conversion - tries multiple encoders
 */
async function mergeWithGPU(videoPath, audioPath, outputPath, videoCodec, event) {
    // This function will try a list of hardware encoders from most common to least.
    const encoders = [
        { name: 'NVIDIA', codec: 'h264_nvenc', options: ['-preset', 'p1', '-cq', '24'] }, // p1 is fastest preset for NVIDIA
        { name: 'Intel', codec: 'h264_qsv', options: ['-preset', 'veryfast', '-global_quality', '24'] },
        { name: 'AMD', codec: 'h264_amf', options: ['-quality', 'speed', '-rc', 'cqp', '-qp_i', '24'] },
    ];

    for (const encoder of encoders) {
        try {
            console.log(`🔧 Attempting hardware conversion with: ${encoder.name}`);
            await new Promise((resolve, reject) => {
                // Add watchdog for GPU conversion too
                let lastProgressTime = Date.now();
                const progressMonitor = setInterval(() => {
                    const timeSinceLastUpdate = Date.now() - lastProgressTime;
                    if (timeSinceLastUpdate > 60000) {
                        console.error(`❌ ${encoder.name} GPU process stalled. Killing process.`);
                        if (command) command.kill('SIGKILL');
                        clearInterval(progressMonitor);
                        reject(new Error(`${encoder.name} GPU process stalled and was terminated.`));
                    }
                }, 15000);

                const command = ffmpeg()
                    .input(videoPath)
                    .input(audioPath)
                    .videoCodec(encoder.codec) // Use the specific hardware codec
                    .audioCodec('aac')
                    .outputOptions(encoder.options)
                    .outputOptions([
                        '-vsync', 'cfr',
                        '-avoid_negative_ts', 'make_zero',
                        '-map', '0:v',
                        '-map', '1:a',
                        '-movflags', '+faststart'
                    ])
                    .on('start', (commandLine) => console.log(`🚀 Spawned FFmpeg with ${encoder.name} command: ` + commandLine))
                    .on('stderr', (stderrLine) => {
                        console.log(`${encoder.name} Log:`, stderrLine);
                        lastProgressTime = Date.now();
                    })
                    .on('end', () => {
                        clearInterval(progressMonitor);
                        resolve();
                    })
                    .on('error', (err) => {
                        clearInterval(progressMonitor);
                        reject(new Error(err.message));
                    })
                    .on('progress', (progress) => {
                        lastProgressTime = Date.now();
                        const timemark = progress.timemark || '00:00:00';
                        event.sender.send('download-progress', {
                            percent: 90 + ((progress.percent || 0) / 100) * 9,
                            downloaded: 0,
                            total: 0,
                            message: `Converting (${encoder.name} GPU)... (${timemark} processed)`
                        });
                    })
                    .save(outputPath);
            });
            console.log(`✅ Hardware conversion successful with ${encoder.name}!`);
            return; // If it succeeds, exit the function.
        } catch (error) {
            console.warn(`❌ ${encoder.name} hardware encoder failed. Trying next method...`);
        }
    }

    // If all hardware encoders failed, throw an error to trigger the fallback.
    throw new Error('All available hardware acceleration methods failed.');
}

/**
 * CPU-based conversion with ultrafast preset for maximum speed
 */
async function mergeWithCPU(videoPath, audioPath, outputPath, videoCodec, event) {
    return new Promise((resolve, reject) => {
        try {
            // [THE FIX #1] - Validate the temporary files BEFORE starting FFmpeg.
            // This prevents "Garbage In, Garbage Out".
            console.log('🔍 Validating temporary download files...');
            const videoStats = fs.statSync(videoPath);
            const audioStats = fs.statSync(audioPath);

            console.log(`📊 Temp Video File Size: ${(videoStats.size / 1024 / 1024).toFixed(2)} MB`);
            console.log(`📊 Temp Audio File Size: ${(audioStats.size / 1024 / 1024).toFixed(2)} MB`);

            if (videoStats.size === 0 || audioStats.size === 0) {
                // This is the most likely cause of the error.
                return reject(new Error('One of the temporary download files is empty. The download stream likely failed.'));
            }

            console.log('✅ Temporary files validated. Starting merge and conversion process...');

        } catch (err) {
            return reject(new Error(`Failed to validate temporary files: ${err.message}`));
        }

        // Add watchdog to detect stalled processes
        let lastProgressTime = Date.now();
        const progressMonitor = setInterval(() => {
            const timeSinceLastUpdate = Date.now() - lastProgressTime;
            if (timeSinceLastUpdate > 60000) {
                console.error('❌ FFmpeg process stalled. Killing process.');
                if (command) command.kill('SIGKILL');
                clearInterval(progressMonitor);
                reject(new Error('FFmpeg process stalled and was terminated. The video might be too demanding for this system.'));
            }
        }, 15000);

        let command = ffmpeg()
            .input(videoPath)
            .input(audioPath)
            .on('start', (commandLine) => {
                console.log('🚀 Spawned FFmpeg with command: ' + commandLine);
            })
            .on('stderr', (stderrLine) => {
                console.log('FFmpeg Log:', stderrLine);
                lastProgressTime = Date.now(); // Any output means it's still alive
            })
            .on('end', () => {
                clearInterval(progressMonitor);
                
                // [THE FIX #5] - Final validation after conversion.
                try {
                    const finalStats = fs.statSync(outputPath);
                    console.log(`📊 Final output file size: ${(finalStats.size / 1024 / 1024).toFixed(2)} MB`);
                    
                    if (finalStats.size === 0) {
                        throw new Error('FFmpeg finished but the output file is 0 bytes. Muxing may have failed.');
                    }
                    
                    console.log('✅ FFmpeg process finished successfully with valid output.');
                    resolve();
                } catch (err) {
                    console.error('❌ Output file validation failed:', err.message);
                    reject(new Error(`Conversion completed but output validation failed: ${err.message}`));
                }
            })
            .on('error', (err) => {
                clearInterval(progressMonitor);
                console.error('❌ FFmpeg process failed.');
                reject(new Error(`FFmpeg error: ${err.message}`));
            })
            .on('progress', (progress) => {
                lastProgressTime = Date.now();
                
                // [THE FINAL UX IMPROVEMENT WITH SMOOTH PROGRESS BAR]
                // The progress object contains a `timemark`, like "00:01:23.45".
                // This tells us exactly how much of the video has been processed.
                const timemark = progress.timemark || '00:00:00';
                
                // We create a more informative message for the user.
                const message = `Converting... (${timemark} processed)`;
                
                // Calculate progress more reliably - use FFmpeg percent if available, otherwise estimate
                let conversionPercent = 0;
                if (progress.percent && !isNaN(progress.percent) && progress.percent > 0) {
                    conversionPercent = Math.min(progress.percent, 100);
                } else if (timemark && timemark !== '00:00:00') {
                    // Estimate progress based on timemark if we have video duration
                    // This provides smooth progress even when FFmpeg percent is unreliable
                    const timeSeconds = parseTimemarkToSeconds(timemark);
                    // Assume reasonable conversion speed for estimation
                    conversionPercent = Math.min((timeSeconds / 10) * 100, 95); // Very conservative estimate
                }
                
                // Map conversion progress to the 90-100% range
                const overallPercent = 90 + (conversionPercent / 100) * 9;
                const finalPercent = Math.min(Math.max(overallPercent, 90), 99.9);
                
                event.sender.send('download-progress', {
                    percent: finalPercent,
                    downloaded: 0,
                    total: 0,
                    message: message // Send the new, "live" message
                });
            });

        // Configure output options
        let outputOptions = [
            // [THE FIX #2] - Explicitly map the streams. This is more robust.
            // Map video from the first input (0) and audio from the second input (1).
            '-map', '0:v',
            '-map', '1:a'
        ];

        if (videoCodec && videoCodec.includes('vp9') && outputPath.endsWith('.mp4')) {
            console.log('🔄 VP9 to H.264 conversion required. Using optimized settings.');
            command.videoCodec('libx264').audioCodec('aac');
            outputOptions.push(
                '-preset', 'veryfast',
                '-crf', '23',
                '-threads', '4',
                
                // [THE FIX #3] - Timestamp stabilization flags
                '-vsync', 'cfr', // Use a constant frame rate to avoid timing issues
                '-avoid_negative_ts', 'make_zero', // Fixes negative timestamp errors
                
                '-movflags', '+faststart'
            );
        } else {
            console.log('✅ No video re-encoding required. Copying streams.');
            command.videoCodec('copy').audioCodec('copy');
            // [THE FIX #4] - Also add stabilization for direct copies
            outputOptions.push('-avoid_negative_ts', 'make_zero');
        }

        command.outputOptions(outputOptions).save(outputPath);
    });
}

/**
 * The new handler for high-resolution (1080p+) downloads.
 */
async function downloadHighResolution(url, outputPath, quality, format, event) {
    try {
        // Send initial progress
        event.sender.send('download-progress', {
            percent: 0,
            downloaded: 0,
            total: 0,
            message: 'Analyzing video for high-resolution download...'
        });

        const info = await ytdl.getInfo(url);
        console.log(`📺 Video: ${info.videoDetails.title}`);

        // 1. Find the best video-only and audio-only streams
        const videoFormats = info.formats.filter(f => f.hasVideo && !f.hasAudio);
        const audioFormats = info.formats.filter(f => f.hasAudio && !f.hasVideo);

        // Find best video format for the requested quality
        let videoFormat = videoFormats.find(f => f.height === quality);
        if (!videoFormat) {
            // Find closest higher quality
            const higherQuality = videoFormats
                .filter(f => f.height >= quality)
                .sort((a, b) => a.height - b.height);
            videoFormat = higherQuality[0];
        }
        if (!videoFormat) {
            // Fallback to highest available
            videoFormat = videoFormats.sort((a, b) => b.height - a.height)[0];
        }

        // Find best audio format
        const audioFormat = audioFormats
            .filter(f => f.audioBitrate)
            .sort((a, b) => b.audioBitrate - a.audioBitrate)[0];

        if (!videoFormat || !audioFormat) {
            // Smart fallback with user choice
            const availableFormats = videoFormats.concat(audioFormats);
            const hasWebM = availableFormats.some(f => f.container === 'webm');
            const maxAvailableQuality = Math.max(...videoFormats.map(f => f.height || 0));
            
            let fallbackMessage = `Unable to find suitable ${quality}p streams for ${format.toUpperCase()} format.\n\n`;
            fallbackMessage += `Available options:\n`;
            
            if (hasWebM && maxAvailableQuality >= quality) {
                fallbackMessage += `• Download as WebM (original quality: ${quality}p)\n`;
            }
            
            if (maxAvailableQuality < quality && maxAvailableQuality > 0) {
                fallbackMessage += `• Lower resolution to ${maxAvailableQuality}p ${format.toUpperCase()}\n`;
            }
            
            // Send fallback options to frontend
            if (event) {
                event.sender.send('download-fallback-required', {
                    originalQuality: quality,
                    originalFormat: format,
                    maxAvailableQuality: maxAvailableQuality,
                    hasWebM: hasWebM,
                    message: fallbackMessage
                });
            }
            
            throw new Error('Format fallback required - user decision needed');
        }

        console.log(`🎥 Selected video: ${videoFormat.height}p (${videoFormat.container})`);
        console.log(`🎵 Selected audio: ${audioFormat.audioBitrate}kbps (${audioFormat.container})`);

        const tempDir = path.dirname(outputPath);
        const tempVideoPath = path.join(tempDir, `temp_video_${Date.now()}.${videoFormat.container}`);
        const tempAudioPath = path.join(tempDir, `temp_audio_${Date.now()}.${audioFormat.container}`);

        try {
            // 2. Download streams sequentially with clear progress
            await downloadStream(url, videoFormat, tempVideoPath, event, 'Video', 0, 45);
            await downloadStream(url, audioFormat, tempAudioPath, event, 'Audio', 45, 90);

            // 3. Merge and convert the streams with GPU/CPU fallback
            // Get encoding method from settings (passed from frontend)
            const encodingMethod = format.encodingMethod || 'gpu'; // Default to GPU for best performance
            
            if (encodingMethod === 'gpu') {
                try {
                    // First, try the super-fast GPU method
                    await mergeWithGPU(tempVideoPath, tempAudioPath, outputPath, videoFormat.videoCodec, event);
                } catch (gpuError) {
                    console.warn('🔄 GPU conversion failed, falling back to CPU method.');
                    // If GPU fails for any reason, use the reliable CPU method as a fallback.
                    await mergeWithCPU(tempVideoPath, tempAudioPath, outputPath, videoFormat.videoCodec, event);
                }
            } else {
                // If the user selected CPU, just use the CPU method.
                await mergeWithCPU(tempVideoPath, tempAudioPath, outputPath, videoFormat.videoCodec, event);
            }

            // Send final completion
            event.sender.send('download-progress', {
                percent: 100,
                downloaded: 0,
                total: 0,
                message: 'Download completed!'
            });

            return { success: true, filePath: outputPath };
        } finally {
            // 4. Clean up temporary files
            if (fs.existsSync(tempVideoPath)) {
                fs.unlinkSync(tempVideoPath);
                console.log('🗑️ Cleaned up temp video file');
            }
            if (fs.existsSync(tempAudioPath)) {
                fs.unlinkSync(tempAudioPath);
                console.log('🗑️ Cleaned up temp audio file');
            }
            console.log('✅ Cleanup complete.');
        }
    } catch (error) {
        console.error('❌ High-resolution download failed:', error);
        throw error;
    }
}

/**
 * The original downloader, now repurposed for standard-resolution downloads.
 */
async function downloadStandardResolution(url, outputPath, quality, format, event) {
    return new Promise(async (resolve, reject) => {
        try {
            const info = await ytdl.getInfo(url);
            console.log(`📺 Video: ${info.videoDetails.title}`);

            // Find best combined format for the requested quality
            const combinedFormats = info.formats.filter(f => f.hasVideo && f.hasAudio);
            
            let formatInfo = combinedFormats.find(f => f.height === quality && f.container === format);
            if (!formatInfo) {
                // Try any container with the right quality
                formatInfo = combinedFormats.find(f => f.height === quality);
            }
            if (!formatInfo) {
                // Find closest quality
                const sortedFormats = combinedFormats
                    .filter(f => f.height <= quality * 1.2)
                    .sort((a, b) => b.height - a.height);
                formatInfo = sortedFormats[0];
            }

            if (!formatInfo) {
                return reject(new Error(`No suitable ${quality}p format found.`));
            }

            console.log(`🎥 Selected format: ${formatInfo.height}p (${formatInfo.container})`);

            // The rest is stable download logic for a single file.
            const videoStream = ytdl(url, { format: formatInfo });
            let downloadedBytes = 0;
            let totalBytes = parseInt(formatInfo.contentLength) || 0;
            let lastReportedPercent = 0;

            videoStream.on('response', (res) => {
                if (!totalBytes) totalBytes = parseInt(res.headers['content-length']);
                console.log(`📊 File size: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
            });

            videoStream.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                if (totalBytes > 0) {
                    const percent = (downloadedBytes / totalBytes) * 100;
                    
                    // Only send updates for meaningful progress changes
                    if (Math.floor(percent) > Math.floor(lastReportedPercent) || percent >= 99.9) {
                        lastReportedPercent = percent;
                        
                        event.sender.send('download-progress', {
                            percent: Math.min(percent, 99.9),
                            downloaded: downloadedBytes,
                            total: totalBytes,
                            message: `Downloading... (${(downloadedBytes / 1024 / 1024).toFixed(1)}MB / ${(totalBytes / 1024 / 1024).toFixed(1)}MB)`
                        });
                    }
                }
            });

            videoStream.pipe(fs.createWriteStream(outputPath))
                .on('finish', () => {
                    console.log('✅ Standard resolution download completed');
                    
                    event.sender.send('download-progress', {
                        percent: 100,
                        downloaded: downloadedBytes,
                        total: totalBytes,
                        message: 'Download completed!'
                    });
                    
                    resolve({ success: true, filePath: outputPath });
                })
                .on('error', reject);
        } catch (error) {
            console.error('❌ Standard resolution download failed:', error);
            reject(error);
        }
    });
}

module.exports = { downloadVideo };