import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');

const TOOL_REGISTRY = {
  pwd: { cmd: 'pwd', args: [], description: 'Affiche le dossier courant' },
  ls: { cmd: 'ls', args: ['-la'], description: 'Liste les fichiers du dossier courant' },
  'node version': { cmd: 'node', args: ['-v'], description: 'Affiche la version Node.js' },
  'python version': { cmd: 'python', args: ['--version'], description: 'Affiche la version Python' },
  'git status': { cmd: 'git', args: ['status', '--short'], description: 'Affiche le statut Git' }
};

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Payload trop volumineux'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('JSON invalide'));
      }
    });
    req.on('error', reject);
  });
}

function classifyIntent(input) {
  const text = String(input || '').trim().toLowerCase();
  if (!text) return null;
  if (text.includes('pwd') || text.includes('dossier')) return 'pwd';
  if (text.startsWith('ls') || text.includes('liste') || text.includes('fichier')) return 'ls';
  if (text.includes('node') && text.includes('version')) return 'node version';
  if (text.includes('python') && text.includes('version')) return 'python version';
  if (text.includes('git status') || text.includes('statut git')) return 'git status';
  return null;
}

function runTool(toolKey) {
  return new Promise((resolve) => {
    const tool = TOOL_REGISTRY[toolKey];
    if (!tool) {
      resolve({ exitCode: 1, stdout: '', stderr: 'Tool non autorisé.' });
      return;
    }

    const child = spawn(tool.cmd, tool.args, { cwd: process.cwd(), timeout: 10000 });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      resolve({ exitCode: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    child.on('error', (err) => {
      resolve({ exitCode: 1, stdout: '', stderr: err.message });
    });
  });
}

async function serveFile(res, relPath) {
  const filePath = path.join(PUBLIC_DIR, relPath);
  const content = await readFile(filePath, 'utf-8');
  const contentType = relPath.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';
  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') {
      await serveFile(res, 'index.html');
      return;
    }

    if (req.method === 'GET' && req.url === '/api/health') {
      json(res, 200, { ok: true, mode: 'secure-local-agent' });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/chat') {
      const body = await parseBody(req);
      const prompt = body.prompt;
      if (typeof prompt !== 'string' || prompt.trim().length === 0) {
        json(res, 400, { error: 'Prompt invalide.' });
        return;
      }

      const toolKey = classifyIntent(prompt);
      const plan = [
        'Analyser la demande utilisateur',
        'Sélectionner un tool sécurisé',
        'Exécuter en local avec contraintes',
        'Retourner le résultat structuré'
      ];

      if (!toolKey) {
        json(res, 200, {
          objective: 'Exécuter la demande locale de manière sécurisée',
          plan,
          tool: null,
          result: {
            exitCode: 1,
            stdout: '',
            stderr: 'Je n’ai pas trouvé de tool autorisé pour cette demande.'
          },
          availableTools: Object.keys(TOOL_REGISTRY)
        });
        return;
      }

      const result = await runTool(toolKey);
      json(res, 200, {
        objective: 'Exécuter la demande locale de manière sécurisée',
        plan,
        tool: { key: toolKey, ...TOOL_REGISTRY[toolKey] },
        result
      });
      return;
    }

    json(res, 404, { error: 'Not found' });
  } catch (error) {
    json(res, 500, { error: error.message || 'Erreur serveur' });
  }
});

const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, () => {
  console.log(`Secure local agent prêt: http://localhost:${PORT}`);
});
