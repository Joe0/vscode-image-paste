const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('VSCode Image Paste extension is now active');

    let disposable = vscode.commands.registerCommand('vscode-image-paste.pasteImage', async function () {
        try {
            await pasteImage();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to paste image: ${error.message}`);
        }
    });

    context.subscriptions.push(disposable);
}

async function pasteImage() {
    const terminal = vscode.window.activeTerminal;

    if (!terminal) {
        vscode.window.showErrorMessage('No active terminal found');
        return;
    }

    const platform = os.platform();
    let imagePath;

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Pasting image...",
        cancellable: false
    }, async (progress) => {
        progress.report({ increment: 0 });

        if (platform === 'win32') {
            imagePath = await handleWindowsClipboard();
        } else if (platform === 'linux') {
            imagePath = await handleLinuxClipboard();
        } else if (platform === 'darwin') {
            imagePath = await handleMacClipboard();
        } else {
            throw new Error(`Unsupported platform: ${platform}`);
        }

        progress.report({ increment: 100 });
    });

    if (imagePath) {
        // Convert to WSL path if needed
        const finalPath = await convertPathForTerminal(imagePath);

        // Send the path to the terminal
        terminal.sendText(finalPath, false);

        const stats = fs.statSync(imagePath);
        const sizeKB = (stats.size / 1024).toFixed(2);
        vscode.window.showInformationMessage(`Image pasted: ${path.basename(imagePath)} (${sizeKB} KB)`);
    }
}

async function handleWindowsClipboard() {
    // Check if WSL is being used
    const isWsl = await isWslEnvironment();

    // First try to get image file from clipboard (if user copied a file)
    const psScript = `Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$files = [System.Windows.Forms.Clipboard]::GetFileDropList()
if ($files.Count -gt 0) {
    $file = $files[0]
    $ext = [System.IO.Path]::GetExtension($file).ToLower()
    $validExts = @('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff')
    if ($validExts -contains $ext) {
        Write-Host $file
        exit 0
    }
}
if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
    $image = [System.Windows.Forms.Clipboard]::GetImage()
    $tempPath = [System.IO.Path]::Combine($env:TEMP, 'clipboard_image.png')
    $image.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host $tempPath
    exit 0
}
throw 'No image found in clipboard'`;

    const tempScriptPath = path.join(os.tmpdir(), `clipboard_${Date.now()}.ps1`);

    try {
        // Write PowerShell script to temp file
        fs.writeFileSync(tempScriptPath, psScript);

        // Execute PowerShell script
        const { stdout } = await execAsync(`powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "${tempScriptPath}"`);

        // Filter out any lines that don't look like file paths
        const lines = stdout.split('\n').map(line => line.trim()).filter(line => {
            // Only keep lines that look like Windows paths (e.g., C:\... or \\...)
            return line && (line.match(/^[A-Z]:\\/i) || line.match(/^\\\\/));
        });

        let clipboardPath = lines[0];

        if (!clipboardPath) {
            throw new Error('No image found in clipboard');
        }

        // Get save directory
        const saveDir = await getSaveDirectory();

        // Extract just the filename from Windows path
        const pathParts = clipboardPath.split('\\');
        const originalFilename = pathParts[pathParts.length - 1];

        // Generate timestamp-based default if it's a temp file, otherwise use original name
        let defaultFilename;
        if (clipboardPath.includes('TEMP') || clipboardPath.includes('Temp')) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').split('.')[0];
            defaultFilename = `img_${timestamp}.png`;
        } else {
            defaultFilename = originalFilename;
        }

        // Ask user for filename
        const filename = await promptForFilename(defaultFilename);
        if (!filename) {
            return null; // User cancelled
        }

        const finalPath = path.join(saveDir, filename);

        // Copy file to destination
        fs.copyFileSync(clipboardPath, finalPath);

        // If it was a temp file, clean it up
        if (clipboardPath.includes('TEMP') || clipboardPath.includes('Temp')) {
            try {
                fs.unlinkSync(clipboardPath);
            } catch (e) {
                // Ignore cleanup errors
            }
        }

        return finalPath;
    } catch (error) {
        throw new Error(`Failed to get image from clipboard: ${error.message}`);
    } finally {
        // Clean up temp script file
        try {
            if (fs.existsSync(tempScriptPath)) {
                fs.unlinkSync(tempScriptPath);
            }
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}

async function handleWslClipboard() {
    // WSL environment - use PowerShell to access Windows clipboard
    const psScript = `Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$files = [System.Windows.Forms.Clipboard]::GetFileDropList()
if ($files.Count -gt 0) {
    $file = $files[0]
    $ext = [System.IO.Path]::GetExtension($file).ToLower()
    $validExts = @('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff')
    if ($validExts -contains $ext) {
        Write-Host $file
        exit 0
    }
}
if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
    $image = [System.Windows.Forms.Clipboard]::GetImage()
    $tempPath = [System.IO.Path]::Combine($env:TEMP, 'clipboard_image_wsl.png')
    $image.Save($tempPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Host $tempPath
    exit 0
}
throw 'No image found in clipboard'`;

    let tempScriptPath;

    try {
        // Get Windows TEMP directory and convert to WSL path
        const { stdout: winTempRaw } = await execAsync('cmd.exe /c echo %TEMP%');
        const winTemp = winTempRaw.trim();

        // Convert Windows TEMP path to WSL path
        const { stdout: wslTempPath } = await execAsync(`wslpath "${winTemp}"`);
        const tempDir = wslTempPath.trim();

        // Create temp script in Windows TEMP directory (accessible from both WSL and Windows)
        tempScriptPath = path.join(tempDir, `clipboard_${Date.now()}.ps1`);
        fs.writeFileSync(tempScriptPath, psScript);

        // Convert back to Windows path for PowerShell
        const { stdout: winScriptPath } = await execAsync(`wslpath -w "${tempScriptPath}"`);
        const windowsScriptPath = winScriptPath.trim();

        // Execute PowerShell script
        const { stdout } = await execAsync(`powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "${windowsScriptPath}"`);

        // Filter out any lines that don't look like file paths
        const lines = stdout.split('\n').map(line => line.trim()).filter(line => {
            // Only keep lines that look like Windows paths (e.g., C:\... or \\...)
            return line && (line.match(/^[A-Z]:\\/i) || line.match(/^\\\\/));
        });

        let clipboardPath = lines[0];

        if (!clipboardPath) {
            throw new Error('No image found in clipboard');
        }

        // Get save directory (WSL path)
        const saveDir = await getSaveDirectory();

        // Extract just the filename from Windows path (e.g., clipboard_image_wsl.png)
        // Windows paths use backslash, so split by that
        const pathParts = clipboardPath.split('\\');
        const originalFilename = pathParts[pathParts.length - 1];

        // Generate a better default filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').split('.')[0];
        const defaultFilename = `img_${timestamp}.png`;

        // Ask user for filename, using timestamp-based default
        const filename = await promptForFilename(defaultFilename);
        if (!filename) {
            return null; // User cancelled
        }

        const finalPath = path.join(saveDir, filename);

        // Convert Windows path to WSL path for reading
        let wslSourcePath;
        if (/^[A-Z]:/i.test(clipboardPath)) {
            const drive = clipboardPath[0].toLowerCase();
            const pathWithoutDrive = clipboardPath.slice(2).replace(/\\/g, '/');
            wslSourcePath = `/mnt/${drive}${pathWithoutDrive}`;
        } else {
            wslSourcePath = clipboardPath;
        }

        // Copy file to destination
        fs.copyFileSync(wslSourcePath, finalPath);

        // If it was a temp file, clean it up
        if (clipboardPath.includes('TEMP') || clipboardPath.includes('Temp')) {
            try {
                fs.unlinkSync(wslSourcePath);
            } catch (e) {
                // Ignore cleanup errors
            }
        }

        return finalPath;
    } catch (error) {
        throw new Error(`Failed to get image from clipboard: ${error.message}`);
    } finally {
        // Clean up temp script file
        try {
            if (fs.existsSync(tempScriptPath)) {
                fs.unlinkSync(tempScriptPath);
            }
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}

async function handleLinuxClipboard() {
    // Check if we're in WSL
    const isWsl = await isWslEnvironment();

    if (isWsl) {
        // Use PowerShell to access Windows clipboard when in WSL
        return await handleWslClipboard();
    }

    // Native Linux - use xclip
    // Check if xclip is installed
    try {
        await execAsync('which xclip');
    } catch (e) {
        throw new Error('xclip is not installed. Please install it: sudo apt-get install xclip');
    }

    const saveDir = await getSaveDirectory();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').split('.')[0];
    const tempPath = path.join(saveDir, `img_${timestamp}.png`);

    try {
        // Try to get image from clipboard
        await execAsync(`xclip -selection clipboard -t image/png -o > "${tempPath}"`);

        // Check if file has content
        const stats = fs.statSync(tempPath);
        if (stats.size === 0) {
            fs.unlinkSync(tempPath);
            throw new Error('No image found in clipboard');
        }

        // Ask user for filename
        const filename = await promptForFilename(tempPath);
        if (!filename) {
            fs.unlinkSync(tempPath);
            return null;
        }

        if (filename !== path.basename(tempPath)) {
            const finalPath = path.join(saveDir, filename);
            fs.renameSync(tempPath, finalPath);
            return finalPath;
        }

        return tempPath;
    } catch (error) {
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
        throw new Error(`Failed to get image from clipboard: ${error.message}`);
    }
}

async function handleMacClipboard() {
    const saveDir = await getSaveDirectory();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').split('.')[0];
    const tempPath = path.join(saveDir, `img_${timestamp}.png`);

    try {
        // Use pngpaste or osascript to get clipboard image
        try {
            await execAsync(`pngpaste "${tempPath}"`);
        } catch (e) {
            // Fallback to osascript
            await execAsync(`osascript -e 'set the clipboard to (read (the clipboard as «class PNGf»))' -e 'set pngData to the clipboard as «class PNGf»' | xxd -r -p > "${tempPath}"`);
        }

        // Check if file has content
        const stats = fs.statSync(tempPath);
        if (stats.size === 0) {
            fs.unlinkSync(tempPath);
            throw new Error('No image found in clipboard');
        }

        // Ask user for filename
        const filename = await promptForFilename(tempPath);
        if (!filename) {
            fs.unlinkSync(tempPath);
            return null;
        }

        if (filename !== path.basename(tempPath)) {
            const finalPath = path.join(saveDir, filename);
            fs.renameSync(tempPath, finalPath);
            return finalPath;
        }

        return tempPath;
    } catch (error) {
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
        throw new Error(`Failed to get image from clipboard: ${error.message}`);
    }
}

async function getSaveDirectory() {
    const config = vscode.workspace.getConfiguration('vscodeImagePaste');
    let saveDir = config.get('saveDirectory', '');

    if (!saveDir) {
        return os.tmpdir();
    }

    // Handle ~ for home directory
    if (saveDir.startsWith('~')) {
        saveDir = path.join(os.homedir(), saveDir.slice(1));
    } else if (!path.isAbsolute(saveDir)) {
        // Relative path - resolve from workspace
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            saveDir = path.join(workspaceFolder.uri.fsPath, saveDir);
        } else {
            saveDir = path.resolve(saveDir);
        }
    }

    // Create directory if it doesn't exist
    if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, { recursive: true });
    }

    return saveDir;
}

async function promptForFilename(currentPath) {
    const ext = path.extname(currentPath);
    const defaultName = path.basename(currentPath);

    const filename = await vscode.window.showInputBox({
        prompt: 'Enter filename for the image (or press Enter to use default)',
        value: defaultName,
        validateInput: (value) => {
            if (!value) {
                return null; // Allow empty for default
            }
            if (!/\.(png|jpg|jpeg|gif|bmp|webp|svg|ico|tiff)$/i.test(value)) {
                return 'Filename must have a valid image extension (.png, .jpg, .jpeg, .gif, .bmp, .webp, .svg, .ico, .tiff)';
            }
            if (!/^[a-zA-Z0-9_\-. ]+$/.test(value)) {
                return 'Filename contains invalid characters';
            }
            return null;
        }
    });

    if (filename === undefined) {
        return null; // User cancelled
    }

    return filename || defaultName;
}

async function isWslEnvironment() {
    try {
        const { stdout } = await execAsync('uname -r');
        return stdout.toLowerCase().includes('microsoft') || stdout.toLowerCase().includes('wsl');
    } catch (e) {
        return false;
    }
}

async function convertPathForTerminal(imagePath) {
    // Check if we're in a WSL terminal
    const isWsl = await isWslEnvironment();

    if (isWsl && /^[A-Z]:/i.test(imagePath)) {
        // Convert Windows path to WSL path
        // C:\Users\... -> /mnt/c/Users/...
        const drive = imagePath[0].toLowerCase();
        const pathWithoutDrive = imagePath.slice(2).replace(/\\/g, '/');
        return `/mnt/${drive}${pathWithoutDrive}`;
    }

    return imagePath;
}

function deactivate() {
    console.log('VSCode Image Paste extension is now deactivated');
}

module.exports = {
    activate,
    deactivate
};
