import express from 'express';
import { exec } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const ALLOWED_PREFIXES = [
  'pwd',
  'ls',
  'echo',
  'node -v',
  'npm -v',
  'python --version',
  'git status'
];

function isAllowed(command) {
  return ALLOWED_PREFIXES.some((prefix) => command.trim().startsWith(prefix));
}

app.post('/api/execute', (req, res) => {
  const { command } = req.body ?? {};

  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'Commande invalide.' });
  }

  if (!isAllowed(command)) {
    return res.status(403).json({
      error: 'Commande bloquée par la policy de sécurité.',
      allowed: ALLOWED_PREFIXES
    });
  }

  exec(command, { timeout: 12000, cwd: process.cwd() }, (error, stdout, stderr) => {
    const exitCode = error?.code ?? 0;
    return res.json({
      command,
      exitCode,
      stdout: stdout || '',
      stderr: stderr || (error && !stderr ? String(error.message) : '')
    });
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Agent local démarré: http://localhost:${PORT}`);
});
