# Technology Stack

## Core Technologies
- **Electron** v27.0.0 - Desktop app framework
- **Node.js** - Backend runtime
- **HTML/CSS/JavaScript** - Frontend technologies

## Key Dependencies
- **@distube/ytdl-core** v4.14.4 - YouTube video information and stream extraction
- **ffmpeg-static** v5.2.0 - Video/audio processing and conversion
- **fluent-ffmpeg** v2.1.2 - FFmpeg wrapper for Node.js
- **node-fetch** v3.3.2 - HTTP requests
- **xml2js** v0.6.2 - XML parsing

## Build System
- **electron-builder** v24.6.4 - Application packaging and distribution

## Common Commands
```bash
# Development
npm start          # Run in development mode
npm run dev        # Run with dev tools enabled

# Building
npm run build      # Build for current platform
npm run build:win  # Build for Windows specifically
npm run dist       # Create distribution package
```

## Architecture Patterns
- **Main Process** (main.js) - Handles system operations, file I/O, and IPC
- **Renderer Process** (script.js) - UI logic and user interactions
- **Preload Script** (preload.js) - Secure bridge between main and renderer
- **IPC Communication** - Event-driven communication between processes

## File Processing
- Uses FFmpeg for video/audio conversion and merging
- Supports high-resolution downloads with separate video/audio streams
- Implements progress tracking for downloads and conversions