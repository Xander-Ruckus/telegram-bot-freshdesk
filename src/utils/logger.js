/**
 * Simple logger utility
 */
export const logger = {
  info: (message, data = '') => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ℹ️  ${message}`, data);
  },

  error: (message, error = '') => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ❌ ${message}`, error);
  },

  warn: (message, data = '') => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] ⚠️  ${message}`, data);
  },

  debug: (message, data = '') => {
    if (process.env.DEBUG === 'true') {
      const timestamp = new Date().toISOString();
      console.debug(`[${timestamp}] 🐛 ${message}`, data);
    }
  },

  success: (message, data = '') => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ✅ ${message}`, data);
  },
};
