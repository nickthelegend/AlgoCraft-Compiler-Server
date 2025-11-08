# Unified Algorand Compiler Server

A Docker-based compilation server that supports multiple Algorand smart contract languages including PuyaPy (Python), PuyaTS (TypeScript), and TealScript.

## Quick Start

### Running the Server

```bash
# Build the Docker image (if not already built)
docker build -t unified-compiler .

# Run the server
docker run -d -p 3000:3000 --name unified-compiler-server unified-compiler

# Check server status
curl http://localhost:3000/health
```

## API Endpoints

### 1. Health Check

**Endpoint:** `GET /health`

**Description:** Check if the server is running and healthy.

**Example Request:**
```bash
curl -X GET http://localhost:3000/health
```

**Example Response:**
```json
{
  "status": "OK",
  "timestamp": "2025-11-08T05:29:56.084Z"
}
```

---

### 2. Compile PuyaPy (Python)

**Endpoint:** `POST /compile-puyapy`

**Description:** Compile Python smart contracts using AlgoKit and Puya compiler.

**Request Body:**
```json
{
  "code": "base64_encoded_python_code"
}
```

**Example Request:**
```bash
curl -X POST http://localhost:3000/compile-puyapy \
  -H "Content-Type: application/json" \
  -d '{
    "code": "ZnJvbSBhbGdvcHkgaW1wb3J0IENvbnRyYWN0LCBUeG4sIGxvZwoKCmNsYXNzIEhlbGxvV29ybGRDb250cmFjdChDb250cmFjdCk6CiAgICBkZWYgYXBwcm92YWxfcHJvZ3JhbShzZWxmKSAtPiBib29sOgogICAgICAgIG5hbWUgPSBUeG4uYXBwbGljYXRpb25fYXJncygwKQogICAgICAgIGxvZyhiIkhlbGxvLCAiICsgbmFtZSkKICAgICAgICByZXR1cm4gVHJ1ZQoKICAgIGRlZiBjbGVhcl9zdGF0ZV9wcm9ncmFtKHNlbGYpIC0+IGJvb2w6CiAgICAgICAgcmV0dXJuIFRydWU="
  }'
```

**Decoded Python Code:**
```python
from algopy import Contract, Txn, log

class HelloWorldContract(Contract):
    def approval_program(self) -> bool:
        name = Txn.application_args(0)
        log(b"Hello, " + name)
        return True

    def clear_state_program(self) -> bool:
        return True
```

**Example Response:**
```json
{
  "ok": true,
  "files": {
    "HelloWorldContract.approval.teal": {
      "encoding": "base64",
      "data": "I3ByYWdtYSB2ZXJzaW9uIDExCiNwcmFnbWEgdHlwZXRyYWNrIGZhbHNlCi8vIHRlbXBfY29udHJhY3QuSGVsbG9Xb3JsZENvbnRyYWN0LmFwcHJvdmFsX3Byb2dyYW0oKSAtPiB1aW50NjQ6Cm1haW46CiAgICAvLyB0ZW1wX2NvbnRyYWN0LnB5OjcKICAgIC8vIGxvZyhiIkhlbGxvLCAiICsgbmFtZSkKICAgIHB1c2hieXRlcyAweDQ4NjU2YzZjNmYyYzIwCiAgICAvLyB0ZW1wX2NvbnRyYWN0LnB5OjYKICAgIC8vIG5hbWUgPSBUeG4uYXBwbGljYXRpb25fYXJncygwKQogICAgdHhuYSBBcHBsaWNhdGlvbkFyZ3MgMAogICAgLy8gdGVtcF9jb250cmFjdC5weTo3CiAgICAvLyBsb2coYiJIZWxsbywgIiArIG5hbWUpCiAgICBjb25jYXQKICAgIGxvZwogICAgLy8gdGVtcF9jb250cmFjdC5weTo4CiAgICAvLyByZXR1cm4gVHJ1ZQogICAgcHVzaGludCAxIC8vIDEKICAgIHJldHVybgo="
    },
    "HelloWorldContract.clear.teal": {
      "encoding": "base64",
      "data": "I3ByYWdtYSB2ZXJzaW9uIDExCiNwcmFnbWEgdHlwZXRyYWNrIGZhbHNlCi8vIHRlbXBfY29udHJhY3QuSGVsbG9Xb3JsZENvbnRyYWN0LmNsZWFyX3N0YXRlX3Byb2dyYW0oKSAtPiB1aW50NjQ6Cm1haW46CiAgICAvLyB0ZW1wX2NvbnRyYWN0LnB5OjExCiAgICAvLyByZXR1cm4gVHJ1ZQogICAgcHVzaGludCAxIC8vIDEKICAgIHJldHVybgo="
    },
    "HelloWorldContract.approval.puya.map": {
      "encoding": "base64",
      "data": "ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsKICAgICJ0ZW1wX2NvbnRyYWN0LnB5IgogIF0sCiAgIm1hcHBpbmdzIjogIjtBQU1ZOzs7Ozs7Ozs7QUFERzs7O0FBQ0g7QUFBSjtBQUNPOztBQUFQIiwKICAib3BfcGNfb2Zmc2V0IjogMCwKICAicGNfZXZlbnRzIjogewogICAgIjEiOiB7CiAgICAgICJzdWJyb3V0aW5lIjogInRlbXBfY29udHJhY3QuSGVsbG9Xb3JsZENvbnRyYWN0LmFwcHJvdmFsX3Byb2dyYW0iLAogICAgICAicGFyYW1zIjoge30sCiAgICAgICJibG9jayI6ICJtYWluIiwKICAgICAgInN0YWNrX2luIjogW10sCiAgICAgICJvcCI6ICJwdXNoYnl0ZXMgMHg0ODY1NmM2YzZmMmMyMCIsCiAgICAgICJkZWZpbmVkX291dCI6IFsKICAgICAgICAiMHg0ODY1NmM2YzZmMmMyMCIKICAgICAgXSwKICAgICAgInN0YWNrX291dCI6IFsKICAgICAgICAiMHg0ODY1NmM2YzZmMmMyMCIKICAgICAgXQogICAgfSwKICAgICIxMCI6IHsKICAgICAgIm9wIjogInR4bmEgQXBwbGljYXRpb25BcmdzIDAiLAogICAgICAiZGVmaW5lZF9vdXQiOiBbCiAgICAgICAgIjB4NDg2NTZjNmM2ZjJjMjAiLAogICAgICAgICJuYW1lIzAiCiAgICAgIF0sCiAgICAgICJzdGFja19vdXQiOiBbCiAgICAgICAgIjB4NDg2NTZjNmM2ZjJjMjAiLAogICAgICAgICJuYW1lIzAiCiAgICAgIF0KICAgIH0sCiAgICAiMTMiOiB7CiAgICAgICJvcCI6ICJjb25jYXQiLAogICAgICAiZGVmaW5lZF9vdXQiOiBbCiAgICAgICAgInRtcCUxIzAiCiAgICAgIF0sCiAgICAgICJzdGFja19vdXQiOiBbCiAgICAgICAgInRtcCUxIzAiCiAgICAgIF0KICAgIH0sCiAgICAiMTQiOiB7CiAgICAgICJvcCI6ICJsb2ciLAogICAgICAic3RhY2tfb3V0IjogW10KICAgIH0sCiAgICAiMTUiOiB7CiAgICAgICJvcCI6ICJwdXNoaW50IDEgLy8gMSIsCiAgICAgICJkZWZpbmVkX291dCI6IFsKICAgICAgICAiMSIKICAgICAgXSwKICAgICAgInN0YWNrX291dCI6IFsKICAgICAgICAiMSIKICAgICAgXQogICAgfSwKICAgICIxNyI6IHsKICAgICAgIm9wIjogInJldHVybiIsCiAgICAgICJzdGFja19vdXQiOiBbXQogICAgfQogIH0KfQ=="
    },
    "HelloWorldContract.clear.puya.map": {
      "encoding": "base64",
      "data": "ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsKICAgICJ0ZW1wX2NvbnRyYWN0LnB5IgogIF0sCiAgIm1hcHBpbmdzIjogIjtBQVVlOztBQUFQIiwKICAib3BfcGNfb2Zmc2V0IjogMCwKICAicGNfZXZlbnRzIjogewogICAgIjEiOiB7CiAgICAgICJzdWJyb3V0aW5lIjogInRlbXBfY29udHJhY3QuSGVsbG9Xb3JsZENvbnRyYWN0LmNsZWFyX3N0YXRlX3Byb2dyYW0iLAogICAgICAicGFyYW1zIjoge30sCiAgICAgICJibG9jayI6ICJtYWluIiwKICAgICAgInN0YWNrX2luIjogW10sCiAgICAgICJvcCI6ICJwdXNoaW50IDEgLy8gMSIsCiAgICAgICJkZWZpbmVkX291dCI6IFsKICAgICAgICAiMSIKICAgICAgXSwKICAgICAgInN0YWNrX291dCI6IFsKICAgICAgICAiMSIKICAgICAgXQogICAgfSwKICAgICIzIjogewogICAgICAib3AiOiAicmV0dXJuIiwKICAgICAgInN0YWNrX291dCI6IFtdCiAgICB9CiAgfQp9"
    }
  }
}
```

**Error Response:**
```json
{
  "ok": false,
  "error": "Base64 code is required"
}
```

---

### 3. Compile PuyaTS (TypeScript)

**Endpoint:** `POST /compile-puyats`

**Description:** Compile TypeScript smart contracts using PuyaTS compiler.

**Request Body:**
```json
{
  "filename": "contract.algo.ts",
  "code": "typescript_code_string",
  "codeBase64": "base64_encoded_typescript_code"
}
```

**Example Request:**
```bash
curl -X POST http://localhost:3000/compile-puyats \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "HelloWorld.algo.ts",
    "code": "import { Contract } from '\''@algorandfoundation/algorand-typescript'\''\n\nexport class HelloWorld extends Contract {\n  public hello(name: string): string {\n    return '\''Hello '\'' + name\n  }\n}"
  }'
```

**Example Response:**
```json
{
  "ok": true,
  "files": {
    "HelloWorld.arc32.json": {
      "encoding": "base64",
      "data": "eyJuYW1lIjoiSGVsbG9Xb3JsZCIsImRlc2NyaXB0aW9uIjoiIiwibWV0aG9kcyI6W3sibmFtZSI6ImhlbGxvIiwiYXJncyI6W3sibmFtZSI6Im5hbWUiLCJ0eXBlIjoic3RyaW5nIn1dLCJyZXR1cm5zIjp7InR5cGUiOiJzdHJpbmcifX1dfQ=="
    },
    "HelloWorld.arc56.json": {
      "encoding": "base64",
      "data": "eyJuYW1lIjoiSGVsbG9Xb3JsZCIsImRlc2NyaXB0aW9uIjoiIiwibWV0aG9kcyI6W3sibmFtZSI6ImhlbGxvIiwiYXJncyI6W3sibmFtZSI6Im5hbWUiLCJ0eXBlIjoic3RyaW5nIn1dLCJyZXR1cm5zIjp7InR5cGUiOiJzdHJpbmcifX1dfQ=="
    }
  }
}
```

**Error Response:**
```json
{
  "ok": false,
  "error": "Code must be a non-empty string"
}
```

---

### 4. Compile TealScript

**Endpoint:** `POST /compile-tealscript`

**Description:** Compile TypeScript smart contracts using TealScript compiler.

**Request Body:**
```json
{
  "filename": "contract.algo.ts",
  "code": "typescript_code_string",
  "encoded": "base64"
}
```

**Example Request:**
```bash
curl -X POST http://localhost:3000/compile-tealscript \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "HelloWorld.algo.ts",
    "code": "import { Contract } from '\''@algorandfoundation/tealscript'\''\n\nexport class HelloWorld extends Contract {\n  hello(name: string): string {\n    return '\''Hello '\'' + name;\n  }\n}"
  }'
```

**Example Response (Plain Text):**
```
=== HelloWorld.arc32.json ===
{
  "name": "HelloWorld",
  "description": "",
  "methods": [
    {
      "name": "hello",
      "args": [
        {
          "name": "name",
          "type": "string"
        }
      ],
      "returns": {
        "type": "string"
      }
    }
  ]
}
```

**Error Response:**
```json
{
  "ok": false,
  "error": "Field 'code' must be a non-empty string"
}
```

---

### 5. Generate Client

**Endpoint:** `POST /generate-client`

**Description:** Generate Python client code from ARC32 JSON specification.

**Request Body:**
```json
{
  "arc32Json": { /* ARC32 JSON object */ },
  "arc32JsonBase64": "base64_encoded_arc32_json"
}
```

**Example Request:**
```bash
curl -X POST http://localhost:3000/generate-client \
  -H "Content-Type: application/json" \
  -d '{
    "arc32Json": {
      "name": "HelloWorld",
      "description": "A simple Hello World contract",
      "methods": [
        {
          "name": "hello",
          "args": [
            {
              "name": "name",
              "type": "string"
            }
          ],
          "returns": {
            "type": "string"
          }
        }
      ]
    }
  }'
```

**Example Response:**
```json
{
  "ok": true,
  "files": {
    "client.py": {
      "encoding": "base64",
      "data": "ZnJvbSBhbGdvc2RrIGltcG9ydCAqCmZyb20gYWxnb3NkayBpbXBvcnQgYWNjb3VudCwgbW5lbW9uaWMKZnJvbSBhbGdvc2RrLnYyY2xpZW50IGltcG9ydCBhbGdvZApmcm9tIGFsZ29zZGsuZnV0dXJlIGltcG9ydCB0cmFuc2FjdGlvbgoKY2xhc3MgSGVsbG9Xb3JsZENsaWVudDoKICAgIGRlZiBfX2luaXRfXyhzZWxmLCBhbGdvZF9jbGllbnQsIGFwcF9pZCk6CiAgICAgICAgc2VsZi5hbGdvZF9jbGllbnQgPSBhbGdvZF9jbGllbnQKICAgICAgICBzZWxmLmFwcF9pZCA9IGFwcF9pZAoKICAgIGRlZiBoZWxsbyhzZWxmLCBuYW1lOiBzdHIpOgogICAgICAgICMgSW1wbGVtZW50YXRpb24gZm9yIGhlbGxvIG1ldGhvZAogICAgICAgIHBhc3M="
    }
  }
}
```

**Error Response:**
```json
{
  "ok": false,
  "error": "Invalid request body. Expected JSON with { arc32Json } or { arc32JsonBase64 }."
}
```

---

## Test Files

The repository includes several test files for easy testing:

- `test-puyapy.json` - Test data for PuyaPy compilation
- `test-simple-puyapy.json` - Simple PuyaPy test case
- `test-puya-ts.json` - Test data for PuyaTS compilation
- `test-tealscript.json` - Test data for TealScript compilation

### Running Tests

```bash
# Test PuyaPy endpoint
curl -X POST http://localhost:3000/compile-puyapy \
  -H "Content-Type: application/json" \
  -d @test-puyapy.json

# Test PuyaTS endpoint
curl -X POST http://localhost:3000/compile-puyats \
  -H "Content-Type: application/json" \
  -d @test-puya-ts.json

# Test TealScript endpoint
curl -X POST http://localhost:3000/compile-tealscript \
  -H "Content-Type: application/json" \
  -d @test-tealscript.json
```

---

## Docker Configuration

### Environment Variables

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Node environment (default: production)
- `ALGOD_PORT` - Algorand node port (default: 443)
- `ALGOD_SERVER` - Algorand node server URL

### Dockerfile Features

- Python 3.12 slim base image
- Node.js 22 installation
- AlgoKit and Puya compiler setup
- Pre-seeded templates for faster compilation
- Optimized for production use

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "ok": false,
  "error": "Error description"
}
```

Common error scenarios:
- Missing or invalid request body
- Invalid base64 encoding
- Compilation failures
- Timeout errors (60 second limit)
- File system errors

---

## Development

### Building the Docker Image

```bash
docker build -t unified-compiler .
```

### Running in Development Mode

```bash
# Run with logs
docker run -p 3000:3000 --name unified-compiler-server unified-compiler

# Run in background
docker run -d -p 3000:3000 --name unified-compiler-server unified-compiler
```

### Stopping the Server

```bash
docker stop unified-compiler-server
docker rm unified-compiler-server
```

---

## Supported Languages and Features

### PuyaPy (Python)
- Full AlgoKit integration
- TEAL output generation
- ARC32/ARC56 metadata generation
- Source map generation
- Error handling and debugging

### PuyaTS (TypeScript)
- Algorand TypeScript support
- ARC32/ARC56 compliance
- Type safety
- Modern JavaScript features

### TealScript
- TypeScript-based smart contracts
- Direct TEAL compilation
- ARC32 metadata generation
- Template optimization

---

## License

This project is licensed under the MIT License.