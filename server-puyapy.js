const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

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
      if (code !== 0) {
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

// Debug middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    console.log('Headers:', req.headers);
    if (req.body) console.log('Body:', req.body);
    next();
});

app.post('/compile', async (req, res) => {
    let tmpRoot;
    try {
        const { code } = req.body;
        
        if (!code) {
            return res.status(400).json({ ok: false, error: 'Base64 code is required' });
        }

        // Decode base64 code
        const decodedCode = Buffer.from(code, 'base64').toString('utf-8');
        console.log('Decoded code:', decodedCode);
        
        const jobId = uuidv4();
        tmpRoot = fs.mkdtempSync(path.join('/tmp', `puya-${jobId}-`));
        const contractPath = path.join(tmpRoot, 'temp_contract.py');
        const outDir = path.join(tmpRoot, 'out');

        console.log('Writing to:', contractPath);
        fs.writeFileSync(contractPath, decodedCode, 'utf8');
        fs.mkdirSync(outDir, { recursive: true });

        // Compile using AlgoKit with correct flags
        const args = ['compile', 'py', contractPath, '--output-arc32', '--output-arc56', '--output-teal'];
        console.log('Running: algokit', args.join(' '));
        
        const compileResult = await runCommand('algokit', args, { cwd: tmpRoot });
        console.log('AlgoKit compile stdout:', compileResult.stdout);
        console.log('AlgoKit compile stderr:', compileResult.stderr);

        // Read all generated files
        const allArtifacts = readAllFilesRecursively(tmpRoot);
        console.log('All generated files:', Object.keys(allArtifacts));
        
        // Filter relevant compilation artifacts (TEAL, ARC32, ARC56, and map files)
        const artifacts = {};
        for (const [filename, content] of Object.entries(allArtifacts)) {
            if (filename.endsWith('.teal') || 
                filename.endsWith('.arc32.json') || 
                filename.endsWith('.arc56.json') ||
                filename.endsWith('.puya.map') ||
                filename !== 'temp_contract.py') { // exclude the input file
                artifacts[filename] = content;
            }
        }
        
        // Cleanup temp directory
        fs.rmSync(tmpRoot, { recursive: true, force: true });

        if (Object.keys(artifacts).length === 0) {
            return res.status(500).json({ ok: false, error: 'No compilation artifacts produced' });
        }

        // Convert artifacts to base64 format
        const base64Artifacts = {};
        for (const [filename, content] of Object.entries(artifacts)) {
            base64Artifacts[filename] = {
                encoding: 'base64',
                data: Buffer.from(content.data, 'utf8').toString('base64')
            };
        }

        return res.json({ ok: true, files: base64Artifacts });
    } catch (err) {
        console.error('Compile error:', err);
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

        // Write ARC32 JSON to file
        const arc32Content = typeof arc32Data === 'string' ? arc32Data : JSON.stringify(arc32Data, null, 2);
        fs.writeFileSync(arc32Path, arc32Content, 'utf8');
        console.log('ARC32 written to:', arc32Path);

        // Run algokit generate client command
        const args = ['generate', 'client', arc32Path, '--output', clientPath];
        console.log('Running: algokit', args.join(' '));
        
        await runCommand('algokit', args, { cwd: tmpRoot });

        // Read generated client.py file
        if (!fs.existsSync(clientPath)) {
            throw new Error('client.py file was not generated');
        }

        const clientContent = fs.readFileSync(clientPath, 'utf8');
        
        // Cleanup temp directory
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
        console.error('Generate-client error:', err);
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
    console.log('Health check requested');
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Compiler server running on port ${PORT}`);
    console.log(`📋 Available endpoints:`);
    console.log(`   POST /compile - Compile Python contracts`);
    console.log(`   POST /generate-client - Generate Python client from ARC32`);
});