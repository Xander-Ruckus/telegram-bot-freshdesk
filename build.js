/**
 * Build script: Bundles the app and creates a standalone .exe
 * 
 * Steps:
 *   1. esbuild: Bundle ESM sources → single CJS file (sqlite3 external)
 *   2. @yao-pkg/pkg: Compile CJS bundle → standalone .exe
 *   3. Copy native modules + assets alongside the .exe
 * 
 * Usage: node build.js
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, copyFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DIST_DIR = join(__dirname, 'dist');
const BUNDLE_PATH = join(DIST_DIR, 'bot.bundle.cjs');
const MONITOR_BUNDLE = join(DIST_DIR, 'monitor.bundle.cjs');
const EXE_NAME = 'telegram-bot-freshdesk.exe';
const MONITOR_EXE = 'service-monitor.exe';
const SERVICE_EXE = 'TelFreshBotService.exe';

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function copyDirRecursive(src, dest) {
  ensureDir(dest);
  for (const entry of readdirSync(src)) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    if (statSync(srcPath).isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

function findFirstExistingPath(paths) {
  return paths.find(path => existsSync(path));
}

console.log('=== Telegram Bot Freshdesk - Build ===\n');

// Step 0: Clean dist
console.log('🧹 Cleaning dist/ ...');
ensureDir(DIST_DIR);

// Step 1: Bundle with esbuild (ESM → CJS, externalize sqlite3)
console.log('📦 Bundling with esbuild (ESM → CJS)...');

try {
  execSync(
    `npx esbuild src/bot.js --bundle --platform=node --format=cjs --outfile=dist/bot.bundle.cjs --external:sqlite3 --external:better-sqlite3 --define:import.meta.url=__import_meta_url --banner:js="const __import_meta_url = require('url').pathToFileURL(__filename).href;"`,
    { stdio: 'inherit', cwd: __dirname }
  );
  console.log('   ✅ Bot bundle created: dist/bot.bundle.cjs');
} catch (err) {
  console.error('❌ esbuild bot bundle failed:', err.message);
  process.exit(1);
}

try {
  execSync(
    `npx esbuild service-monitor.js --bundle --platform=node --format=cjs --outfile=dist/monitor.bundle.cjs --external:sqlite3 --external:better-sqlite3 --define:import.meta.url=__import_meta_url --banner:js="const __import_meta_url = require('url').pathToFileURL(__filename).href;"`,
    { stdio: 'inherit', cwd: __dirname }
  );
  console.log('   ✅ Monitor bundle created: dist/monitor.bundle.cjs');
} catch (err) {
  console.error('❌ esbuild monitor bundle failed:', err.message);
  process.exit(1);
}

// Step 2: Compile with pkg
console.log('\n🔨 Compiling executables with pkg...');

try {
  execSync(
    `npx pkg dist/bot.bundle.cjs --target node18-win-x64 --output dist/${EXE_NAME} --compress Brotli`,
    { stdio: 'inherit', cwd: __dirname }
  );
  console.log(`   ✅ Bot exe created: dist/${EXE_NAME}`);
} catch (err) {
  console.error('❌ pkg bot compile failed:', err.message);
  process.exit(1);
}

try {
  execSync(
    `npx pkg dist/monitor.bundle.cjs --target node18-win-x64 --output dist/${MONITOR_EXE} --compress Brotli`,
    { stdio: 'inherit', cwd: __dirname }
  );
  console.log(`   ✅ Monitor exe created: dist/${MONITOR_EXE}`);
} catch (err) {
  console.error('❌ pkg monitor compile failed:', err.message);
  process.exit(1);
}

// Step 2b: Compile Windows service host
console.log('\n🛠️  Compiling Windows service host...');

const cscPath = findFirstExistingPath([
  'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
  'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
]);

if (!cscPath) {
  console.error('❌ C# compiler not found. Cannot build TelFreshBotService.exe');
  process.exit(1);
}

try {
  execSync(
    `"${cscPath}" /nologo /target:exe /out:"dist\\${SERVICE_EXE}" /reference:System.ServiceProcess.dll "windows-service\\TelFreshBotService.cs"`,
    { stdio: 'inherit', cwd: __dirname }
  );
  console.log(`   ✅ Windows service host created: dist/${SERVICE_EXE}`);
} catch (err) {
  console.error('❌ Service host compile failed:', err.message);
  process.exit(1);
}

// Step 3: Copy sqlite3 native module alongside exe
console.log('\n📋 Copying native modules...');

const sqlite3NativeSrc = join(__dirname, 'node_modules', 'sqlite3', 'build', 'Release');
const sqlite3NativeDest = join(DIST_DIR, 'node_modules', 'sqlite3', 'build', 'Release');

if (existsSync(sqlite3NativeSrc)) {
  copyDirRecursive(sqlite3NativeSrc, sqlite3NativeDest);
  
  // Also copy the sqlite3 package.json (needed for module resolution)
  const sqlite3Pkg = join(__dirname, 'node_modules', 'sqlite3', 'package.json');
  const sqlite3PkgDest = join(DIST_DIR, 'node_modules', 'sqlite3');
  ensureDir(sqlite3PkgDest);
  copyFileSync(sqlite3Pkg, join(sqlite3PkgDest, 'package.json'));
  
  // Copy sqlite3 lib directory (JS files needed for the binding)
  const sqlite3Lib = join(__dirname, 'node_modules', 'sqlite3', 'lib');
  if (existsSync(sqlite3Lib)) {
    copyDirRecursive(sqlite3Lib, join(sqlite3PkgDest, 'lib'));
  }
  
  console.log('   ✅ sqlite3 native module copied');
} else {
  console.warn('   ⚠️  sqlite3 native module not found at:', sqlite3NativeSrc);
}

// Copy napi-macros if it exists (dependency of sqlite3)
const napiMacros = join(__dirname, 'node_modules', 'napi-macros');
if (existsSync(napiMacros)) {
  copyDirRecursive(napiMacros, join(DIST_DIR, 'node_modules', 'napi-macros'));
}

// Copy node-addon-api if it exists
const nodeAddonApi = join(__dirname, 'node_modules', 'node-addon-api');
if (existsSync(nodeAddonApi)) {
  copyDirRecursive(nodeAddonApi, join(DIST_DIR, 'node_modules', 'node-addon-api'));
}

// Step 4: Create data directory
console.log('\n📂 Creating data directory...');
ensureDir(join(DIST_DIR, 'data'));
console.log('   ✅ data/ directory created');

// Step 5: Create .env template
console.log('\n📝 Creating .env template...');
const envTemplate = `# Telegram Bot - Freshdesk Integration Configuration
# Copy this file to .env and fill in your credentials

# Telegram Bot Token (from BotFather)
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Telegram Bot Username (without @)
TELEGRAM_BOT_USERNAME=your_bot_username

# Freshdesk API Key (from Freshdesk Admin → Profile)
FRESHDESK_API_KEY=your_freshdesk_api_key

# Freshdesk Domain (e.g., company.freshdesk.com)
FRESHDESK_DOMAIN=your_domain.freshdesk.com

# Webhook Port (default: 3000)
WEBHOOK_PORT=3001

# Debug mode (true/false)
DEBUG=false
`;

writeFileSync(join(DIST_DIR, '.env.example'), envTemplate);

// Copy existing .env if present
const envFile = join(__dirname, '.env');
if (existsSync(envFile)) {
  copyFileSync(envFile, join(DIST_DIR, '.env'));
  console.log('   ✅ Existing .env copied to dist/');
} else {
  console.log('   ℹ️  No .env found, .env.example created in dist/');
}

// Step 6: Create launcher batch files
console.log('\n🚀 Creating launcher scripts...');

writeFileSync(join(DIST_DIR, 'start-bot.bat'), `@echo off
title Telegram Bot - Freshdesk
echo Starting Telegram Bot - Freshdesk Integration...
echo.
"%~dp0${EXE_NAME}"
pause
`);

writeFileSync(join(DIST_DIR, 'start-monitor.bat'), `@echo off
title Service Monitor
echo Starting Service Monitor...
echo.
"%~dp0${MONITOR_EXE}"
pause
`);

writeFileSync(join(DIST_DIR, 'start-all.bat'), `@echo off
title Telegram Bot - Start All Services
echo ====================================
echo  Telegram Bot - Freshdesk
echo  Starting All Services...
echo ====================================
echo.
start "Service Monitor" "%~dp0${MONITOR_EXE}"
echo.
echo Service monitor started. It will launch and supervise the bot.
timeout /t 3
`);

writeFileSync(join(DIST_DIR, 'install-service.bat'), `@echo off
sc.exe create "Tel-Fresh-Bot" binPath= "\"%~dp0${SERVICE_EXE}\"" start= auto DisplayName= "Tel-Fresh-Bot"
sc.exe description "Tel-Fresh-Bot" "Telegram Freshdesk bot service"
sc.exe failure "Tel-Fresh-Bot" reset= 86400 actions= restart/5000/restart/5000/restart/5000
sc.exe start "Tel-Fresh-Bot"
`);

writeFileSync(join(DIST_DIR, 'start-service.bat'), `@echo off
sc.exe start "Tel-Fresh-Bot"
`);

writeFileSync(join(DIST_DIR, 'stop-service.bat'), `@echo off
sc.exe stop "Tel-Fresh-Bot"
`);

writeFileSync(join(DIST_DIR, 'remove-service.bat'), `@echo off
sc.exe stop "Tel-Fresh-Bot"
sc.exe delete "Tel-Fresh-Bot"
`);

console.log('   ✅ Launcher scripts created');

// Done
console.log('\n====================================');
console.log('✅ BUILD COMPLETE');
console.log('====================================');
console.log(`\nOutput directory: dist/`);
console.log(`  ${EXE_NAME}       - Main bot executable`);
console.log(`  ${MONITOR_EXE}         - Service monitor executable`);
console.log(`  ${SERVICE_EXE}      - Windows service host`);
console.log(`  start-bot.bat          - Launch the bot`);
console.log(`  start-monitor.bat      - Launch the monitor`);
console.log(`  start-all.bat          - Launch both services`);
console.log(`  .env.example           - Configuration template`);
console.log(`\nTo create an installer, install Inno Setup and compile installer.iss`);
