#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const STATIC_DIR = path.join(__dirname, '../jupyterlite/extensions/@jupyterlite/pyodide-kernel-extension/static');

function patchFile(fileName, isCoincident) {
  const filePath = path.join(STATIC_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    console.warn(`Worker static file not found: ${filePath}`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf-8');

  // 1. Remove delete opts.packages;
  content = content.replace('if(opts.packages)delete opts.packages;', '');

  // 2. Patch initKernel
  const varName = isCoincident ? 'i' : 's';
  const regex = new RegExp(`async initKernel\\(e\\)\\{.*?await this\\._pyodide\\.runPythonAsync\\(${varName}\\.join\\(`, 's');

  const replacement = `async initKernel(e){let t=(e.loadPyodideOptions||{}).packages||[],p=e.piplitePreloadPackages||[],${varName}=[];const basePy=["ipython","jedi"];const allPy=Array.from(new Set([...t,...basePy]));await this._pyodide.loadPackage(allPy);for(let e of["ipykernel","comm","pyodide-kernel"]){if(!t.includes(e)){${varName}.push(\`try:\\n    await piplite.install('\${e}', keep_going=True, deps=False)\\nexcept Exception:\\n    pass\`);}}for(let pkg of p){${varName}.push(\`await piplite.install('\${pkg}', keep_going=True)\`);}${varName}.push("import importlib\\nimportlib.invalidate_caches()\\nimport pyodide_kernel"),e.mountDrive&&this._localPath&&${varName}.push("import os",\`os.chdir("\${this._localPath}")\`),await this._pyodide.runPythonAsync(${varName}.join(`;

  content = content.replace(regex, replacement);

  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`Successfully patched worker: ${fileName}`);
}

function main() {
  if (!fs.existsSync(STATIC_DIR)) {
    console.warn(`Static directory does not exist: ${STATIC_DIR}`);
    return;
  }

  const files = fs.readdirSync(STATIC_DIR).filter(f => f.endsWith('.js'));
  for (const file of files) {
    if (file.startsWith('coincident.worker.')) {
      patchFile(file, true);
    } else if (file.startsWith('comlink.worker.')) {
      patchFile(file, false);
    }
  }
}

if (require.main === module) {
  main();
}
