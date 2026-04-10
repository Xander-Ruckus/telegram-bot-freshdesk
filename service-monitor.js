import { spawn } from 'child_process';
import axios from 'axios';
import { logger } from './src/utils/logger.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HEALTH_CHECK_INTERVAL = 15 * 60 * 1000; // 15 minutes
const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds timeout
const HEALTH_CHECK_URL = 'http://localhost:3001/webhook/health';
const isPackaged = typeof process.pkg !== 'undefined';
const runtimeDir = isPackaged ? path.dirname(process.execPath) : __dirname;

let botProcess = null;
let lastHealthCheck = null;
let healthCheckCount = 0;
let restartCount = 0;

/**
 * Start the bot process
 */
function startBot() {
  return new Promise((resolve) => {
    logger.info('🚀 Starting bot process...');

    const command = isPackaged
      ? path.join(runtimeDir, 'telegram-bot-freshdesk.exe')
      : 'node';
    const args = isPackaged ? [] : ['src/bot.js'];
    
    botProcess = spawn(command, args, {
      cwd: runtimeDir,
      stdio: 'inherit',
      detached: false
    });
    
    botProcess.on('error', (error) => {
      logger.error('❌ Bot process error:', error);
    });
    
    botProcess.on('exit', (code, signal) => {
      logger.warn(`⚠️  Bot process exited with code ${code}, signal ${signal}`);
      botProcess = null;
      // Auto-restart after 5 seconds if not intentionally stopped
      setTimeout(() => startBot(), 5000);
    });
    
    // Wait 3 seconds for bot to start
    setTimeout(() => resolve(), 3000);
  });
}

/**
 * Check bot health via webhook
 */
async function checkHealth() {
  try {
    healthCheckCount++;
    const timestamp = new Date().toLocaleString();
    
    const response = await axios.get(HEALTH_CHECK_URL, {
      timeout: HEALTH_CHECK_TIMEOUT
    });
    
    if (response.status === 200 && response.data.status === 'healthy') {
      lastHealthCheck = {
        status: 'healthy',
        timestamp,
        checkNumber: healthCheckCount,
        restarts: restartCount
      };
      logger.info(`✅ Health check #${healthCheckCount}: HEALTHY (${timestamp})`);
      return true;
    } else {
      logger.warn(`⚠️  Health check #${healthCheckCount}: Unexpected response status`);
      return false;
    }
  } catch (error) {
    logger.error(`❌ Health check #${healthCheckCount} FAILED: ${error.message}`);
    return false;
  }
}

/**
 * Restart bot process
 */
function restartBot() {
  return new Promise((resolve) => {
    logger.warn('🔄 Health check failed - initiating bot restart...');
    restartCount++;
    
    if (botProcess) {
      logger.info(`📌 Killing existing process (PID: ${botProcess.pid})`);
      botProcess.kill('SIGTERM');
    }
    
    // Wait 2 seconds before restarting
    setTimeout(() => {
      startBot().then(resolve);
    }, 2000);
  });
}

/**
 * Health monitor loop
 */
async function startHealthMonitor() {
  logger.info(`⏱️  Health monitor started - checking every 15 minutes`);
  
  // Initial health check after bot startup
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Perform health checks at regular intervals
  setInterval(async () => {
    const isHealthy = await checkHealth();
    
    if (!isHealthy) {
      logger.error('💥 Health check failed - restarting bot...');
      await restartBot();
      
      // Give bot time to restart and stabilize
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Perform health check after restart
      const recoveryHealth = await checkHealth();
      if (recoveryHealth) {
        logger.info('✅ Bot recovered after restart');
      } else {
        logger.error('❌ Bot failed to recover after restart');
      }
    }
  }, HEALTH_CHECK_INTERVAL);
}

/**
 * Setup graceful shutdown
 */
process.on('SIGINT', () => {
  logger.info('⛔ Received SIGINT - shutting down gracefully...');
  if (botProcess) {
    botProcess.kill('SIGTERM');
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('⛔ Received SIGTERM - shutting down gracefully...');
  if (botProcess) {
    botProcess.kill('SIGTERM');
  }
  process.exit(0);
});

/**
 * Main entry point
 */
async function main() {
  logger.info('════════════════════════════════════════════════════════');
  logger.info('🤖 Telegram Bot Service Monitor - Starting...');
  logger.info('════════════════════════════════════════════════════════');
  logger.info(`Process PID: ${process.pid}`);
  logger.info(`Health check interval: 15 minutes`);
  logger.info(`Health check URL: ${HEALTH_CHECK_URL}`);
  logger.info('════════════════════════════════════════════════════════\n');
  
  try {
    // Start the bot
    await startBot();
    
    // Start health monitoring
    await startHealthMonitor();
    
  } catch (error) {
    logger.error('Fatal error in service monitor:', error);
    process.exit(1);
  }
}

// Start the service
main().catch((error) => {
  logger.error('Failed to start service:', error);
  process.exit(1);
});
