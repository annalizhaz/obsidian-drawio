// deploy.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Try to load the custom config, fall back to template if it doesn't exist
let config;
try {
    config = require('./deploy-config.js');
    console.log('Loaded custom config:', config);
} catch (err) {
    console.log('Failed to load custom config, using template:', err);
    config = require('./deploy-config.template.js');
}

const platform = process.platform;
console.log('Platform:', platform);

// Get the plugin directory from config
let pluginDir = config.pluginDir[platform];
console.log('Initial plugin dir from config:', pluginDir);

// Only expand environment variables if the path includes them
if (pluginDir.includes('%APPDATA%') || pluginDir.includes('$HOME')) {
    if (platform === 'win32') {
        pluginDir = pluginDir.replace('%APPDATA%', process.env.APPDATA);
    } else {
        pluginDir = pluginDir.replace('$HOME', process.env.HOME);
    }
    console.log('After environment variable expansion:', pluginDir);
}

// Ensure plugin directory exists
try {
    fs.mkdirSync(pluginDir, { recursive: true });
    console.log('Created/verified plugin directory:', pluginDir);
} catch (err) {
    console.error('Error creating plugin directory:', err);
    process.exit(1);
}

// Files to copy
const files = ['main.js', 'manifest.json', 'data.json', 'versions.json'];

// First run the build
console.log('Building plugin...');
execSync('npm run clean-build', { stdio: 'inherit' });

// Then copy files
console.log('Deploying to:', pluginDir);
for (const file of files) {
    if (fs.existsSync(file)) {
        const targetPath = path.join(pluginDir, file);
        fs.copyFileSync(file, targetPath);
        console.log(`Copied ${file} to ${targetPath}`);
    } else {
        console.warn(`Warning: ${file} not found`);
    }
}

console.log('Deployment complete!');