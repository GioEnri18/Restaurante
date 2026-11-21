const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// Verifica la sintaxis de todos los archivos JavaScript del backend usando `node --check`
function walk(dir) {
  let files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walk(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

const srcDir = path.resolve(__dirname, '..');
const jsFiles = walk(srcDir);
let errors = 0;

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.error(`❌ Error de sintaxis en ${path.relative(srcDir, file)}:\n${result.stderr}`);
    errors++;
  }
}

if (errors > 0) {
  console.error(`❌ Se encontraron ${errors} archivo(s) con errores de sintaxis.`);
  process.exit(1);
}

console.log(`✅ Verificación sintáctica exitosa: ${jsFiles.length} archivos .js sin errores.`);
