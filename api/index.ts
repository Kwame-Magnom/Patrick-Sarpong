let cachedApp: any = null;

export default async function handler(req: any, res: any) {
  try {
    if (!cachedApp) {
      const mod = await import('../src/api-app');
      cachedApp = mod.default;
    }
    return cachedApp(req, res);
  } catch (err: any) {
    console.error('Vercel API initialization error:', err);
    res.status(500).json({
      error: `API initialization failed: ${err?.message || String(err)}`,
    });
  }
}
