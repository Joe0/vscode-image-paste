# VSCode Image Paste

Paste images from your clipboard directly into the VSCode terminal. Perfect for use with AI assistants like Claude Code that can process images.

## Features

- Paste screenshots directly from clipboard
- Paste copied image files from your file explorer
- Works on Windows, Linux, and macOS
- Automatic WSL path conversion (Windows with WSL)
- Customizable save directory
- Interactive filename prompt
- Multiple image format support (PNG, JPG, JPEG, GIF, BMP, WebP, SVG, ICO, TIFF)

## Usage

1. Copy an image to your clipboard:
   - Take a screenshot (Windows: Win+Shift+S, Linux: Print Screen, macOS: Cmd+Shift+4)
   - Copy an image file from your file explorer
   - Copy an image from your web browser

2. Click into the VSCode terminal to focus it

3. Press `Ctrl+Shift+Alt+I` (or use Command Palette: "Paste Image into Terminal")

4. Enter a filename when prompted (or press Enter to use the default timestamped name)

5. The image path will be automatically inserted into your terminal

## Requirements

### Linux
- `xclip` must be installed:
  ```bash
  sudo apt-get install xclip
  ```

### macOS
- `pngpaste` is recommended (optional):
  ```bash
  brew install pngpaste
  ```

### Windows
- PowerShell 7+ (for clipboard access)
- Automatic WSL path conversion when using WSL terminals

## Extension Settings

This extension contributes the following settings:

* `vscodeImagePaste.saveDirectory`: Directory where images will be saved
  - Leave empty to use system temp directory
  - Use `~` for home directory (e.g., `~/Pictures`)
  - Use relative paths (relative to workspace root)
  - Use absolute paths

## Keyboard Shortcut

- `Ctrl+Shift+Alt+I` - Paste image into terminal (when terminal is focused)

You can customize this in VSCode's keyboard shortcuts settings.

## Installation

Since this is a local extension, you need to install it manually:

### Method 1: Install from VSIX (Recommended)

1. Package the extension:
   ```bash
   npm install -g @vscode/vsce
   vsce package
   ```

2. Install the generated `.vsix` file:
   - Open VSCode
   - Go to Extensions view (Ctrl+Shift+X)
   - Click "..." menu at the top
   - Select "Install from VSIX..."
   - Choose the generated `vscode-image-paste-1.0.0.vsix` file

### Method 2: Symlink for Development

1. Create a symlink in your VSCode extensions folder:

   **Linux/macOS:**
   ```bash
   ln -s /home/joe/Desktop/vscode-image-paste ~/.vscode/extensions/vscode-image-paste
   ```

   **Windows:**
   ```cmd
   mklink /D "%USERPROFILE%\.vscode\extensions\vscode-image-paste" "C:\path\to\vscode-image-paste"
   ```

2. Reload VSCode

## Examples

### Using with Claude Code

```bash
# In VSCode terminal running Claude Code
$ claude
# Take a screenshot and press Ctrl+Shift+Alt+I
# The image path will be inserted: /tmp/img_2025-10-21_17-30-45.png
# Claude Code will display and analyze the image
```

### Custom Save Directory

Set in VSCode settings (JSON):

```json
{
  "vscodeImagePaste.saveDirectory": "~/images/screenshots"
}
```

Or use workspace-relative path:

```json
{
  "vscodeImagePaste.saveDirectory": "docs/images"
}
```

## Troubleshooting

### Linux: "xclip is not installed" error
Install xclip: `sudo apt-get install xclip`

### macOS: No image in clipboard
Install pngpaste: `brew install pngpaste`

### Windows: Path conversion issues with WSL
Make sure you're using PowerShell 7+ and that WSL is properly configured

### Extension not working
1. Check that you have a terminal focused when pressing the keyboard shortcut
2. Reload VSCode (Ctrl+Shift+P -> "Reload Window")
3. Check the Output panel (View -> Output -> "Extension Host") for errors

## Support This Project

If you find this extension useful, consider supporting its development:

**Bitcoin (BTC):**
`bc1qt0wawff05van54vuasqu9sluzymuhhpl3l2z3k`

**Ethereum (ETH):**
`0x538AFaB14652792fA31a58F16c1d85191FAFC30E`

## License

MIT

## Credits

Based on [claude-image-paste](https://github.com/aggroot/claude-image-paste) by aggroot.
