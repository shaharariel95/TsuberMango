// /api/internal/backup: backup failures must surface as 500, not be masked as auth failures.
import { describe, it, expect } from 'vitest';
import admin from 'firebase-admin';
import request from 'supertest';

process.env.CENTER_ID = 'backupapitest';
process.env.CRON_SECRET = 'dev-secret';
process.env.GCS_BACKUP_BUCKET = ''; // empty (dotenv won't override it): runBackup throws before touching GCS
if (!admin.apps.length) admin.initializeApp({ projectId: 'demo-tsuber' });
const { app } = await import('../app.js');

describe('POST /api/internal/backup', () => {
  it('dev secret + failing backup -> 500 with details (not 401)', async () => {
    const res = await request(app).post('/api/internal/backup').set('Authorization', 'Bearer dev-secret');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Backup failed');
    expect(res.body.details).toBe('Backup upload is disabled while running against the Firebase emulators');
  });

  it('wrong bearer token -> 401', async () => {
    const res = await request(app).post('/api/internal/backup').set('Authorization', 'Bearer nope');
    expect(res.status).toBe(401);
  });
});
