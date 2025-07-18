const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const ytdl = require('@distube/ytdl-core');

// Enhanced download function that handles high-resolution videos
async function downloadVideo(url, outputPath, isVideoFormat, event, targetQuality) {
    return new Promise((resolve, reject) => {
        try {
            // Get video info
            ytdl.getInfo(url).then(info => {
                // Select the best format based on what the user wants
                let selectedFormat;
                
                if (isVideoFormat) {
                    // Get ALL video formats and sort by quality
                    const allVideoFormats = info.formats
                        .filter(f => f.hasVideo)
                        .sort((a, b) => {
                            // First sort by height
                            const heightA = a.height || 0;
                            const heightB = b.height || 0;
                            
                            if (heightB !== heightA) {
                                return heightB - heightA; // Higher resolution first
                            }
                            
                            // If same height, prefer formats with audio
                            if (a.hasAudio !== b.hasAudio) {
                                return a.hasAudio ? -1 : 1; // Prefer with audio
                            }
                            
                            // If still tied, sort by bitrate
                            const bitrateA = a.bitrate || 0;
                            const bitrateB = b.bitrate || 0;
                            return bitrateB - bitrateA; // Higher bitrate first
                        });
                    
                    // Log all available formats for debugging
                    console.log('All available video formats:', allVideoFormats.map(f => ({
                        itag: f.itag,
                        height: f.height,
                        hasAudio: f.hasAudio,
                        container: f.container,
                        bitrate: f.bitrate
                    })));
                    
                    // Check if targetQuality is provided (user selected a specific quality)
                    if (targetQuality) {
                        console.log(`User selected quality: ${targetQuality}p`);
                        
                        // Try to find a format that matches the target quality exactly
                        let matchingFormat = allVideoFormats.find(f => f.height === targetQuality && f.hasAudio);
                        
                        // If no exact match with audio, try without audio requirement
                        if (!matchingFormat) {
                            matchingFormat = allVideoFormats.find(f => f.height === targetQuality);
                        }
                        
                        // If still no match, find the closest quality without going over
                        if (!matchingFormat) {
                            // Sort formats by how close they are to target quality (without exceeding it)
                            const closestFormats = allVideoFormats
                                .filter(f => f.height <= targetQuality)
                                .sort((a, b) => b.height - a.height);
                                
                            if (closestFormats.length > 0) {
                                matchingFormat = closestFormats[0]; // Get the closest without exceeding
                            }
                        }
                        
                        // If we found a matching format, use it
                        if (matchingFormat) {
                            selectedFormat = matchingFormat;
                            console.log(`Found format matching selected quality ${targetQuality}p:`, selectedFormat);
                        } else {
                            console.log(`No format found matching ${targetQuality}p, falling back to auto-selection`);
                        }
                    }
                    
                    // If no format was selected based on targetQuality, use auto-selection
                    if (!selectedFormat) {
                        // First, try to get a high-quality format with audio included
                        const highQualityWithAudio = allVideoFormats.find(f => 
                            f.height >= 720 && f.hasAudio
                        );
                        
                        if (highQualityWithAudio) {
                            selectedFormat = highQualityWithAudio;
                            console.log('Auto-selected high-quality format with audio:', selectedFormat);
                        } 
                        // If no high-quality format with audio, get the highest quality format available
                        else {
                            // Get the highest resolution format
                            const highestResFormat = allVideoFormats[0];
                            
                            // Get the best format with audio
                            const bestWithAudio = allVideoFormats.find(f => f.hasAudio);
                            
                            // If the highest resolution is significantly better than the best with audio,
                            // use the highest resolution
                            if (highestResFormat && bestWithAudio && 
                                highestResFormat.height > bestWithAudio.height * 1.5) {
                                selectedFormat = highestResFormat;
                                console.log('Auto-selected highest resolution format (no audio):', selectedFormat);
                            } 
                            // Otherwise use the best format with audio
                            else if (bestWithAudio) {
                                selectedFormat = bestWithAudio;
                                console.log('Auto-selected best format with audio:', selectedFormat);
                            }
                            // Last resort: just use the first format
                            else {
                                selectedFormat = allVideoFormats[0];
                                console.log('Auto-selected first available format:', selectedFormat);
                            }
                        }
                    }
                } else {
                    // For audio: get the best audio quality
                    const formats = info.formats
                        .filter(f => f.hasAudio)
                        .sort((a, b) => {
                            const bitrateA = a.audioBitrate || 0;
                            const bitrateB = b.audioBitrate || 0;
                            return bitrateB - bitrateA; // Sort by bitrate (highest first)
                        });
                    
                    selectedFormat = formats[0]; // Best quality
                    console.log('Selected audio format:', selectedFormat);
                }
                
                if (!selectedFormat) {
                    return reject(new Error('No suitable format found'));
                }
                
                // Download the selected format
                const stream = ytdl(url, { quality: selectedFormat.itag });
                const writeStream = fs.createWriteStream(outputPath);
                
                // Track download progress
                stream.on('progress', (chunkLength, downloaded, total) => {
                    const percent = (downloaded / total * 100).toFixed(1);
                    if (event) {
                        event.sender.send('download-progress', { 
                            percent, 
                            downloaded, 
                            total 
                        });
                    }
                });
                
                // Pipe the download stream to the file
                stream.pipe(writeStream);
                
                // Handle completion
                writeStream.on('finish', () => {
                    console.log('Download completed successfully');
                    resolve({ success: true, filePath: outputPath });
                });
                
                // Handle errors
                writeStream.on('error', (err) => {
                    console.error('Write stream error:', err);
                    reject(err);
                });
                
                stream.on('error', (err) => {
                    console.error('Download stream error:', err);
                    reject(err);
                });
            }).catch(err => {
                console.error('Error getting video info:', err);
                reject(err);
            });
        } catch (error) {
            console.error('Unexpected error in download function:', error);
            reject(error);
        }
    });
}

module.exports = { downloadVideo };