// server.js (robust JSON recovery, ESM) — FIXED safeFilename + tmp under project
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { v4 as uuidv4 } from "uuid";

const PORT = Number(process.env.PORT || 3000);
const GLOBAL_PUYA_CLI = "puya-ts";
const DEFAULT_TIMEOUT_MS = Number(process.env.PUYA_TIMEOUT_MS || 60000);
const BODY_LIMIT = process.env.BODY_LIMIT || "2mb";

const app = express();

/**
 * Capture raw body while letting express.json() parse JSON.
 * express.json supports "verify" which receives the raw buffer.
 */
app.use(
  express.json({
    type: "application/json",
    limit: BODY_LIMIT,
    verify: (req, res, buf) => {
      req.rawBody = buf ? buf.toString("utf8") : "";
    },
  })
);

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - content-type: ${req.headers["content-type"]}`);
  next();
});

function runCommand(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const env = Object.assign({}, process.env, opts.env || {});
    const child = spawn(cmd, args, { ...opts, env, stdio: ["ignore", "pipe", "pipe"] });
    
    // Ignore disposal errors
    child.on('error', (err) => {
      if (err.message && err.message.includes('SuppressedError')) return;
      child.emit('actualError', err);
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    const timeout = setTimeout(() => {
      child.removeAllListeners();
      child.kill("SIGKILL");
      reject(new Error(`Process timed out after ${DEFAULT_TIMEOUT_MS}ms\n${stderr}`));
    }, DEFAULT_TIMEOUT_MS);

    child.on("actualError", (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      // Ignore disposal errors - check if stderr contains only disposal error
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
  function walk(curr, base = "") {
    for (const ent of fs.readdirSync(curr, { withFileTypes: true })) {
      const full = path.join(curr, ent.name);
      const rel = base ? path.join(base, ent.name) : ent.name;
      if (ent.isDirectory()) walk(full, rel);
      else if (ent.isFile()) {
        try {
          out[rel] = { encoding: "utf8", data: fs.readFileSync(full, "utf8") };
        } catch (e) {
          out[rel] = { encoding: "base64", data: fs.readFileSync(full).toString("base64") };
        }
      }
    }
  }
  walk(dir);
  return out;
}

function tryRecoverCodeFromString(raw) {
  if (!raw || typeof raw !== "string") return null;

  const firstBrace = raw.indexOf("{");
  const trimmed = firstBrace >= 0 ? raw.slice(firstBrace) : raw;

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && typeof parsed.code === "string") return { filename: parsed.filename, code: parsed.code };
  } catch (e) {
    // continue
  }

  const codeRegex = /"code"\s*:\s*"([\s\S]*?)"\s*(?:,|\})/m;
  const m = trimmed.match(codeRegex);
  if (m && m[1] !== undefined) {
    let captured = m[1];
    try {
      const safe = `"${captured.replace(/\\?"/g, '\\"').replace(/\n/g, "\\n")}"`;
      captured = JSON.parse(safe);
    } catch (ee) {
      captured = captured.replace(/\\r\\n/g, "\r\n").replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"');
    }
    const fnMatch = trimmed.match(/"filename"\s*:\s*"([^"]+)"/m);
    const filename = fnMatch ? fnMatch[1] : undefined;
    return { filename, code: captured };
  }

  return null;
}

app.post("/compile", async (req, res) => {
  let tmpRoot;
  try {
    let filename = "contract.algo.ts";
    let sourceCode = "";

    // Handle payload from request body
    if (req.body && typeof req.body === "object") {
      filename = req.body.filename || filename;
      
      if (req.body.codeBase64) {
        // Decode base64 code
        try {
          sourceCode = Buffer.from(req.body.codeBase64, 'base64').toString('utf8');
        } catch (err) {
          return res.status(400).json({ ok: false, error: "Invalid base64 encoding in codeBase64 field" });
        }
      } else if (req.body.code) {
        sourceCode = req.body.code;
        // Clean up HTML entities and escape sequences
        sourceCode = sourceCode
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t')
          .replace(/\\r/g, '\r');
      } else {
        return res.status(400).json({ ok: false, error: "Invalid request body. Expected JSON with { code } or { codeBase64 }." });
      }
    } else {
      return res.status(400).json({ ok: false, error: "Invalid request body. Expected JSON with { code } or { codeBase64 }." });
    }

    if (!sourceCode || typeof sourceCode !== "string" || !sourceCode.trim()) {
      return res.status(400).json({ ok: false, error: "Code must be a non-empty string" });
    }

    const safeFilename = path.basename(filename) || "contract.algo.ts";
    const id = uuidv4();

    // Use /tmp for file operations
    tmpRoot = fs.mkdtempSync(path.join("/tmp", `puya-${id}-`));
    const srcPath = path.join(tmpRoot, safeFilename);
    const outDir = path.join(tmpRoot, "out");

    console.log("writing to:", srcPath);
    fs.writeFileSync(srcPath, sourceCode, "utf8");
    fs.mkdirSync(outDir, { recursive: true });
    
    // Copy pre-seeded template from /tmp/puya-template
    const templateDir = "/tmp/puya-template";
    if (fs.existsSync(templateDir)) {
      const templatePkg = path.join(templateDir, "package.json");
      const templateNodeModules = path.join(templateDir, "node_modules");
      
      if (fs.existsSync(templatePkg)) {
        fs.cpSync(templatePkg, path.join(tmpRoot, "package.json"));
      }
      if (fs.existsSync(templateNodeModules)) {
        fs.cpSync(templateNodeModules, path.join(tmpRoot, "node_modules"), { recursive: true });
      }
    } else {
      // Fallback: create package.json and install dependencies
      const packageJson = {
        "name": "temp-contract",
        "version": "1.0.0",
        "type": "module",
        "dependencies": {
          "@algorandfoundation/algorand-typescript": "^1.0.0-beta.72"
        }
      };
      fs.writeFileSync(path.join(tmpRoot, "package.json"), JSON.stringify(packageJson, null, 2));
      
      // Install dependencies
      await runCommand("npm", ["install"], { cwd: tmpRoot });
    }

    const args = [
      srcPath,
      "--out-dir", outDir
    ];

    console.log("running:", GLOBAL_PUYA_CLI, args.join(" "));
    const result = await runCommand(GLOBAL_PUYA_CLI, args, { env: process.env });

    // Read all generated files from output directory
    const allArtifacts = readAllFilesRecursively(outDir);
    
    // Filter only .arc32.json and .arc56.json files
    const artifacts = {};
    for (const [filename, content] of Object.entries(allArtifacts)) {
      if (filename.endsWith('.arc32.json') || filename.endsWith('.arc56.json')) {
        artifacts[filename] = content;
      }
    }
    
    // Cleanup temp directory
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn("Cleanup warning:", cleanupErr.message);
    }

    if (Object.keys(artifacts).length === 0) {
      return res.status(500).json({ ok: false, error: "No .arc32.json or .arc56.json files produced" });
    }

    // Convert artifacts to base64 format
    const base64Artifacts = {};
    for (const [filename, content] of Object.entries(artifacts)) {
      base64Artifacts[filename] = {
        encoding: "base64",
        data: Buffer.from(content.data, 'utf8').toString('base64')
      };
    }

    // Return only .arc32.json and .arc56.json files in base64
    return res.json({ ok: true, files: base64Artifacts });
  } catch (err) {
    console.error("compile error:", err);
    // Cleanup on error
    if (tmpRoot) {
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn("Error cleanup warning:", cleanupErr.message);
      }
    }
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

app.post("/generate-client", async (req, res) => {
  let tmpRoot;
  try {
    let arc32Data;
    
    // Handle payload from request body with base64 support
    if (req.body && typeof req.body === "object") {
      if (req.body.arc32JsonBase64) {
        // Decode base64 ARC32 JSON
        try {
          const decoded = Buffer.from(req.body.arc32JsonBase64, 'base64').toString('utf8');
          arc32Data = JSON.parse(decoded);
        } catch (err) {
          return res.status(400).json({ ok: false, error: "Invalid base64 encoding or JSON in arc32JsonBase64 field" });
        }
      } else if (req.body.arc32Json) {
        arc32Data = req.body.arc32Json;
      } else {
        return res.status(400).json({ ok: false, error: "Invalid request body. Expected JSON with { arc32Json } or { arc32JsonBase64 }." });
      }
    } else {
      return res.status(400).json({ ok: false, error: "Invalid request body. Expected JSON with { arc32Json } or { arc32JsonBase64 }." });
    }

    const id = uuidv4();

    // Create temporary directory
    tmpRoot = fs.mkdtempSync(path.join("/tmp", `algokit-${id}-`));
    const arc32Path = path.join(tmpRoot, "contract.arc32.json");
    const clientPath = path.join(tmpRoot, "client.ts");

    // Write ARC32 JSON to file
    const arc32Content = typeof arc32Data === "string" ? arc32Data : JSON.stringify(arc32Data, null, 2);
    fs.writeFileSync(arc32Path, arc32Content, "utf8");
    console.log("ARC32 written to:", arc32Path);

    // Run algokit generate client command
    const args = ["generate", "client", arc32Path, "--output", clientPath];
    console.log("running: algokit", args.join(" "));
    
    await runCommand("algokit", args, { cwd: tmpRoot });

    // Read generated client.ts file
    if (!fs.existsSync(clientPath)) {
      throw new Error("client.ts file was not generated");
    }

    const clientContent = fs.readFileSync(clientPath, "utf8");
    
    // Cleanup temp directory
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.warn("Cleanup warning:", cleanupErr.message);
    }

    return res.json({ 
      ok: true, 
      files: {
        "client.ts": {
          encoding: "base64",
          data: Buffer.from(clientContent, 'utf8').toString('base64')
        }
      }
    });
  } catch (err) {
    console.error("generate-client error:", err);
    // Cleanup on error
    if (tmpRoot) {
      try {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      } catch (cleanupErr) {
        console.warn("Error cleanup warning:", cleanupErr.message);
      }
    }
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Compiler server running on port ${PORT}`);
  console.log(`📋 Available endpoints:`);
  console.log(`   POST /compile - Compile TypeScript contracts`);
  console.log(`   POST /generate-client - Generate TypeScript client from ARC32`);
});
