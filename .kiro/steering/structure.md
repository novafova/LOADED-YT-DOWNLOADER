# Project Structure

## Root Files
- **index.html** - Main application UI markup
- **main.js** - Electron main process (system operations, IPC handlers)
- **script.js** - Frontend application logic and UI interactions
- **preload.js** - Secure bridge between main and renderer processes
- **styles.css** - Application styling with dark theme
- **package.json** - Project configuration and dependencies

## Key Directories
- **.kiro/** - Kiro IDE configuration and steering rules
- **.vscode/** - VS Code workspace settings
- **assets/** - Application icons and static resources
- **dist/** - Built application output (generated)
- **node_modules/** - NPM dependencies (generated)

## Code Organization Patterns

### Main Process (main.js)
- Window management and creation
- IPC handlers for video operations
- File system operations
- FFmpeg integration for conversion
- Error handling and process management

### Renderer Process (script.js)
- YouTubeDownloader class encapsulates all UI logic
- Event-driven architecture with method binding
- Progress tracking and user feedback
- Local storage for download history
- Tab-based UI for video/audio selection

### UI Structure (index.html)
- Custom title bar with window controls
- Header with branding and status indicators
- URL input section
- Video information display
- Download options with quality/format selection
- Progress tracking section
- Download history list

## Naming Conventions
- **Classes**: PascalCase (YouTubeDownloader)
- **Methods**: camelCase (fetchVideoInfo, displayVideoInfo)
- **CSS Classes**: kebab-case with BEM-like structure
- **IPC Channels**: kebab-case (get-video-info, download-video)
- **File Names**: kebab-case for configs, camelCase for JS modules