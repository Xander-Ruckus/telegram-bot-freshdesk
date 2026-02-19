import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, '../../data/tickets.db');

let db = null;

export async function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        logger.error('Database initialization failed:', err);
        reject(err);
        return;
      }

      logger.info('Database connected:', dbPath);

      // Create table for DOWN tickets correlation
      db.serialize(() => {
        db.run(
          `CREATE TABLE IF NOT EXISTS down_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticket_id INTEGER NOT NULL,
            correlation_key TEXT NOT NULL,
            subject TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(ticket_id)
          )`,
          (err) => {
            if (err) {
              logger.error('Failed to create down_tickets table:', err);
              reject(err);
            } else {
              logger.info('Database tables initialized');
              resolve(db);
            }
          }
        );
      });
    });
  });
}

export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

export function storeDownTicket(ticketId, correlationKey, subject) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.run(
      'INSERT OR REPLACE INTO down_tickets (ticket_id, correlation_key, subject) VALUES (?, ?, ?)',
      [ticketId, correlationKey, subject],
      function(err) {
        if (err) {
          logger.error('Failed to store DOWN ticket:', err);
          reject(err);
        } else {
          logger.info(`Stored DOWN ticket #${ticketId} with key: ${correlationKey}`);
          resolve();
        }
      }
    );
  });
}

export function getDownTickets(correlationKey) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.all(
      'SELECT * FROM down_tickets WHERE correlation_key = ?',
      [correlationKey],
      (err, rows) => {
        if (err) {
          logger.error('Failed to query DOWN tickets:', err);
          reject(err);
        } else {
          resolve(rows || []);
        }
      }
    );
  });
}

export function deleteDownTicket(ticketId) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.run(
      'DELETE FROM down_tickets WHERE ticket_id = ?',
      [ticketId],
      function(err) {
        if (err) {
          logger.error('Failed to delete DOWN ticket:', err);
          reject(err);
        } else {
          logger.info(`Deleted DOWN ticket record #${ticketId}`);
          resolve();
        }
      }
    );
  });
}

export function deleteDownTicketsByKey(correlationKey) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.all(
      'SELECT ticket_id FROM down_tickets WHERE correlation_key = ?',
      [correlationKey],
      (err, rows) => {
        if (err) {
          logger.error('Failed to query DOWN tickets for deletion:', err);
          reject(err);
          return;
        }

        const ticketIds = (rows || []).map(r => r.ticket_id);

        db.run(
          'DELETE FROM down_tickets WHERE correlation_key = ?',
          [correlationKey],
          function(err) {
            if (err) {
              logger.error('Failed to delete DOWN tickets by key:', err);
              reject(err);
            } else {
              logger.info(`Deleted ${ticketIds.length} DOWN ticket records for key: ${correlationKey}`);
              resolve(ticketIds);
            }
          }
        );
      }
    );
  });
}
