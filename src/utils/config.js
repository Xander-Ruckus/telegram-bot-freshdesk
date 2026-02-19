/**
 * Environment validation utility
 * Checks if all required configuration is present
 */

export function validateEnvironment() {
  const required = [
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_BOT_USERNAME',
    'FRESHDESK_API_KEY',
    'FRESHDESK_DOMAIN',
  ];

  const optional = [
    'WEBHOOK_PORT',
    'WEBHOOK_URL',
    'NODE_ENV',
  ];

  const missing = [];
  const warnings = [];

  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  for (const key of optional) {
    if (!process.env[key]) {
      warnings.push(`${key} not set, using default`);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map(k => `  - ${k}`).join('\n')}\n\nPlease update your .env file.`
    );
  }

  if (warnings.length > 0) {
    console.warn('⚠️  Environment warnings:');
    warnings.forEach(w => console.warn(`  - ${w}`));
  }

  return {
    valid: true,
    warnings,
  };
}
