import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { auth } from './auth.ts';
import { drive } from './drive.ts';
import { books } from './books.ts';
import { cleanupSessions, migrate, pool } from './db.ts';

const PORT = Number(process.env.PORT ?? 3001);
const app = express();

app.set('trust proxy', 1); // derrière un reverse-proxy : IP réelle du client
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdnjs.cloudflare.com',
          'https://cdn.jsdelivr.net',
          'blob:',
        ],
        workerSrc: ["'self'", 'blob:', 'https://cdnjs.cloudflare.com'],
        childSrc: ["'self'", 'blob:', 'data:'],
        frameSrc: ["'self'", 'blob:', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'blob:'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:', 'blob:'],
        connectSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'blob:', 'data:'],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

app.get('/healthz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'db_unavailable' });
  }
});

app.use('/auth/books', books);
app.use('/auth/drive', drive);
app.use('/auth', auth);

// En production, sert le front compilé (même origine → cookies SameSite=Strict OK)
const dist = path.resolve('dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

await migrate();
void cleanupSessions();
setInterval(() => void cleanupSessions().catch(console.error), 6 * 3600 * 1000);

app.listen(PORT, '0.0.0.0', () => console.log(`Serveur en écoute sur port ${PORT}`));
