import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import app from './src/api-app';
import { startBackupScheduler } from './src/lib/backup-service';

const resolvedDirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : import.meta.url
    ? path.dirname(fileURLToPath(import.meta.url))
    : process.cwd();

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(resolvedDirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MAGNOM PHONES HUB server running on http://0.0.0.0:${PORT}`);
    startBackupScheduler();
  });
}

if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export default app;
