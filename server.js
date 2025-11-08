import express from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const PORT = process.env.PORT || 3000;
const DEFAULT_TIMEOUT_MS = 60000;

const app = express();
app.use(express.json({ limit: '10mb' }));

function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, stdio: ['ignore', 'pipe', 'pipe'] });
    
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Process timed out after ${DEFAULT_TIMEOUT_MS}ms`));
    }, DEFAULT_TIMEOUT_MS);

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0 && !stderr.includes('SuppressedError')) {
        const err = new Error(`Process exited with code ${code}\n${stderr}`);
        err.code = code;
        err.stderr = stderr;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });
}

function readAllFilesRecursively(dir) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  
  function walk(curr, base = '') {
    for (const ent of fs.readdirSync(curr, { withFileTypes: true })) {
      const full = path.join(curr, ent.name);
      const rel = base ? path.join(base, ent.name) : ent.name;
      if (ent.isDirectory()) {
        walk(full, rel);
      } else if (ent.isFile()) {
        try {
          out[rel] = { encoding: 'utf8', data: fs.readFileSync(full, 'utf8') };
        } catch (e) {
          out[rel] = { encoding: 'base64', data: fs.readFileSync(full).toString('base64') };
        }
      }
    }
  }
  walk(dir);
  return out;
}

// PuyaPy compiler endpoint
app.post('/compile-puyapy', async (req, res) => {
    let tmpRoot;
    try {
        const { code } = req.body;
        console.log('PuyaPy compile request received');
        
        if (!code) {
            return res.status(400).json({ ok: false, error: 'Base64 code is required' });
        }

        const decodedCode = Buffer.from(code, 'base64').toString('utf-8');
        console.log('Decoded Python code:', decodedCode);
        
        const jobId = uuidv4();
        tmpRoot = fs.mkdtempSync(path.join('/tmp', `puya-${jobId}-`));
        const contractPath = path.join(tmpRoot, 'temp_contract.py');
        const outDir = path.join(tmpRoot, 'out');
        console.log('Temp directory:', tmpRoot);
        console.log('Contract path:', contractPath);

        fs.writeFileSync(contractPath, decodedCode, 'utf8');
        fs.mkdirSync(outDir, { recursive: true });

        const args = ['compile', 'py', contractPath, '--output-arc32', '--output-arc56'];
        console.log('Running algokit with args:', args);
        const compileResult = await runCommand('algokit', args, { cwd: tmpRoot });
        console.log('AlgoKit stdout:', compileResult.stdout);
        console.log('AlgoKit stderr:', compileResult.stderr);

        const allArtifacts = readAllFilesRecursively(tmpRoot);
        const artifacts = {};
        for (const [filename, content] of Object.entries(allArtifacts)) {
            if (filename.endsWith('.teal') || 
                filename.endsWith('.arc32.json') || 
                filename.endsWith('.arc56.json') ||
                filename.endsWith('.puya.map')) {
                artifacts[filename] = content;
            }
        }
        
        fs.rmSync(tmpRoot, { recursive: true, force: true });

        if (Object.keys(artifacts).length === 0) {
            return res.status(500).json({ ok: false, error: 'No compilation artifacts produced' });
        }

        const base64Artifacts = {};
        for (const [filename, content] of Object.entries(artifacts)) {
            base64Artifacts[filename] = {
                encoding: 'base64',
                data: Buffer.from(content.data, 'utf8').toString('base64')
            };
        }

        console.log('Compilation successful, returning artifacts:', Object.keys(base64Artifacts));
        return res.json({ ok: true, files: base64Artifacts });
    } catch (err) {
        console.error('PuyaPy compilation error:', err);
        console.error('Error details:', err.message);
        console.error('Error stderr:', err.stderr);
        if (tmpRoot) {
            try {
                fs.rmSync(tmpRoot, { recursive: true, force: true });
            } catch (cleanupErr) {
                console.warn('Cleanup warning:', cleanupErr.message);
            }
        }
        return res.status(500).json({ ok: false, error: err.message || String(err) });
    }
});

// PuyaTS compiler endpoint
app.post('/compile-puyats', async (req, res) => {
  let tmpRoot;
  try {
    let filename = 'contract.algo.ts';
    let sourceCode = '';

    if (req.body && typeof req.body === 'object') {
      filename = req.body.filename || filename;
      
      if (req.body.codeBase64) {
        try {
          sourceCode = Buffer.from(req.body.codeBase64, 'base64').toString('utf8');
        } catch (err) {
          return res.status(400).json({ ok: false, error: 'Invalid base64 encoding in codeBase64 field' });
        }
      } else if (req.body.code) {
        sourceCode = req.body.code;
      } else {
        return res.status(400).json({ ok: false, error: 'Invalid request body. Expected JSON with { code } or { codeBase64 }.' });
      }
    } else {
      return res.status(400).json({ ok: false, error: 'Invalid request body. Expected JSON with { code } or { codeBase64 }.' });
    }

    if (!sourceCode || typeof sourceCode !== 'string' || !sourceCode.trim()) {
      return res.status(400).json({ ok: false, error: 'Code must be a non-empty string' });
    }

    const safeFilename = path.basename(filename) || 'contract.algo.ts';
    const id = uuidv4();

    tmpRoot = fs.mkdtempSync(path.join('/tmp', `puya-${id}-`));
    const srcPath = path.join(tmpRoot, safeFilename);
    const outDir = path.join(tmpRoot, 'out');

    fs.writeFileSync(srcPath, sourceCode, 'utf8');
    fs.mkdirSync(outDir, { recursive: true });
    
    const templateDir = '/tmp/puya-template';
    if (fs.existsSync(templateDir)) {
      const templatePkg = path.join(templateDir, 'package.json');
      const templateNodeModules = path.join(templateDir, 'node_modules');
      
      if (fs.existsSync(templatePkg)) {
        fs.cpSync(templatePkg, path.join(tmpRoot, 'package.json'));
      }
      if (fs.existsSync(templateNodeModules)) {
        fs.cpSync(templateNodeModules, path.join(tmpRoot, 'node_modules'), { recursive: true });
      }
    } else {
      const packageJson = {
        'name': 'temp-contract',
        'version': '1.0.0',
        'type': 'module',
        'dependencies': {
          '@algorandfoundation/algorand-typescript': '^1.0.0-beta.72'
        }
      };
      fs.writeFileSync(path.join(tmpRoot, 'package.json'), JSON.stringify(packageJson, null, 2));
      await runCommand('npm', ['install'], { cwd: tmpRoot });
    }

    const args = [srcPath, '--out-dir', outDir];
    await runCommand('puya-ts', args, { env: process.env });

    const allArtifacts = readAllFilesRecursively(outDir);
    const artifacts = {};
    for (const [filename, content] of Object.entries(allArtifacts)) {
      if (filename.endsWith('.arc32.json') || filename.endsWith('.arc56.json')) {
        artifacts[filename] = content;
      }
    }
    
    fs.rmSync(tmpRoot, { recursive: true, force: true });

    if (Object.keys(artifacts).length === 0) {
      return res.status(500).json({ ok: false, error: 'No .arc32.json or .arc56.json files produced' });
    }

    const base64Artifacts = {};
    for (const [filename, content] of Object.entries(artifacts)) {
      base64Artifacts[filename] = {
        encoding: 'base64',
        data: Buffer.from(content.data, 'utf8').toString('base64')
      };
    }

    return res.json({ ok: true, files: base64Artifacts });
  } catch (err) {
    if (tmpRoot) {
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn('Cleanup warning:', cleanupErr.message);
      }
    }
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// TealScript compiler endpoint
app.post('/compile-tealscript', async (req, res) => {
  let tmpRoot;
  try {
    let filename = 'contract.algo.ts';
    let sourceCode = '';
    console.log('TealScript compile request received');
    console.log('Request body:', req.body);

    if (req.body && typeof req.body === 'object' && typeof req.body.code === 'string') {
      filename = req.body.filename || filename;
      if (req.body.encoded === 'base64') {
        try {
          sourceCode = Buffer.from(req.body.code, 'base64').toString('utf8');
          console.log('Decoded TealScript code:', sourceCode);
        } catch (err) {
          return res.status(400).json({ ok: false, error: 'Invalid base64 encoding' });
        }
      } else {
        sourceCode = req.body.code;
        console.log('TealScript code:', sourceCode);
      }
    } else {
      return res.status(400).json({ ok: false, error: 'Invalid request body. Expected JSON with { filename, code }.' });
    }

    if (!sourceCode || typeof sourceCode !== 'string' || !sourceCode.trim()) {
      return res.status(400).json({ ok: false, error: 'Field \'code\' must be a non-empty string' });
    }

    const safeFilename = path.basename(filename) || 'contract.algo.ts';
    const id = uuidv4();

    tmpRoot = fs.mkdtempSync(path.join('/tmp', `tealscript-${id}-`));
    const srcDir = path.join(tmpRoot, 'src');
    const srcPath = path.join(srcDir, safeFilename);
    const outDir = path.join(tmpRoot, 'artifacts');
    
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(outDir, { recursive: true });
    
    const templateDir = '/tmp/tealscript-template';
    if (fs.existsSync(templateDir)) {
      const templatePkg = path.join(templateDir, 'package.json');
      const templateTsconfig = path.join(templateDir, 'tsconfig.json');
      const templateNodeModules = path.join(templateDir, 'node_modules');
      
      if (fs.existsSync(templatePkg)) {
        fs.copyFileSync(templatePkg, path.join(tmpRoot, 'package.json'));
      }
      if (fs.existsSync(templateTsconfig)) {
        fs.copyFileSync(templateTsconfig, path.join(tmpRoot, 'tsconfig.json'));
      }
      if (fs.existsSync(templateNodeModules)) {
        fs.cpSync(templateNodeModules, path.join(tmpRoot, 'node_modules'), { recursive: true });
      }
    }
    
    fs.writeFileSync(srcPath, sourceCode, 'utf8');
    
    const tsconfigPath = path.join(tmpRoot, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) {
      const projectTsconfig = '/app/tsconfig.json';
      if (fs.existsSync(projectTsconfig)) {
        fs.copyFileSync(projectTsconfig, tsconfigPath);
      }
    }
    
    const nestedTmpDir = path.join(tmpRoot, 'tmp', path.basename(tmpRoot));
    fs.mkdirSync(nestedTmpDir, { recursive: true });
    const nestedTsconfigPath = path.join(nestedTmpDir, 'tsconfig.json');
    if (fs.existsSync(tsconfigPath)) {
      fs.copyFileSync(tsconfigPath, nestedTsconfigPath);
    }

    const args = ['@algorandfoundation/tealscript', 'src/*.algo.ts', 'artifacts'];
    console.log('Running TealScript with args:', args);
    console.log('Working directory:', tmpRoot);
    const result = await runCommand('npx', args, { cwd: tmpRoot, env: process.env });
    console.log('TealScript stdout:', result.stdout);
    console.log('TealScript stderr:', result.stderr);

    const allArtifacts = readAllFilesRecursively(outDir);
    const artifacts = {};
    for (const [filename, content] of Object.entries(allArtifacts)) {
      if (filename.endsWith('.arc32.json') || filename.endsWith('.arc4.json')) {
        artifacts[filename] = content.data;
      }
    }
    
    fs.rmSync(tmpRoot, { recursive: true, force: true });

    if (Object.keys(artifacts).length === 0) {
      return res.status(500).json({ ok: false, error: 'No .arc32.json or .arc4.json files produced' });
    }

    const response = Object.entries(artifacts).map(([filename, data]) => 
      `=== ${filename} ===\n${data}\n`
    ).join('\n');
    
    res.setHeader('Content-Type', 'text/plain');
    console.log('TealScript compilation successful, returning response');
    return res.send(response);
  } catch (err) {
    console.error('TealScript compilation error:', err);
    console.error('Error details:', err.message);
    console.error('Error stderr:', err.stderr);
    if (tmpRoot) {
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn('Cleanup warning:', cleanupErr.message);
      }
    }
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// Unified generate-client endpoint
app.post('/generate-client', async (req, res) => {
    let tmpRoot;
    try {
        let arc32Data;
        
        if (req.body && typeof req.body === 'object') {
            if (req.body.arc32JsonBase64) {
                try {
                    const decoded = Buffer.from(req.body.arc32JsonBase64, 'base64').toString('utf8');
                    arc32Data = JSON.parse(decoded);
                } catch (err) {
                    return res.status(400).json({ ok: false, error: 'Invalid base64 encoding or JSON in arc32JsonBase64 field' });
                }
            } else if (req.body.arc32Json) {
                arc32Data = req.body.arc32Json;
            } else {
                return res.status(400).json({ ok: false, error: 'Invalid request body. Expected JSON with { arc32Json } or { arc32JsonBase64 }.' });
            }
        } else {
            return res.status(400).json({ ok: false, error: 'Invalid request body. Expected JSON with { arc32Json } or { arc32JsonBase64 }.' });
        }

        const jobId = uuidv4();
        tmpRoot = fs.mkdtempSync(path.join('/tmp', `algokit-${jobId}-`));
        const arc32Path = path.join(tmpRoot, 'contract.arc32.json');
        const clientPath = path.join(tmpRoot, 'client.py');

        const arc32Content = typeof arc32Data === 'string' ? arc32Data : JSON.stringify(arc32Data, null, 2);
        fs.writeFileSync(arc32Path, arc32Content, 'utf8');

        const args = ['generate', 'client', arc32Path, '--output', clientPath];
        await runCommand('algokit', args, { cwd: tmpRoot });

        if (!fs.existsSync(clientPath)) {
            throw new Error('client.py file was not generated');
        }

        const clientContent = fs.readFileSync(clientPath, 'utf8');
        fs.rmSync(tmpRoot, { recursive: true, force: true });

        return res.json({ 
            ok: true, 
            files: {
                'client.py': {
                    encoding: 'base64',
                    data: Buffer.from(clientContent, 'utf8').toString('base64')
                }
            }
        });
    } catch (err) {
        if (tmpRoot) {
            try {
                fs.rmSync(tmpRoot, { recursive: true, force: true });
            } catch (cleanupErr) {
                console.warn('Cleanup warning:', cleanupErr.message);
            }
        }
        return res.status(500).json({ ok: false, error: err.message || String(err) });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Unified Compiler server running on port ${PORT}`);
    console.log(`📋 Available endpoints:`);
    console.log(`   POST /compile-puyapy - Compile Python contracts`);
    console.log(`   POST /compile-puyats - Compile TypeScript contracts with PuyaTS`);
    console.log(`   POST /compile-tealscript - Compile TypeScript contracts with TealScript`);
    console.log(`   POST /generate-client - Generate Python client from ARC32`);
    console.log(`   GET /health - Health check`);
});