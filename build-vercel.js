import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distDir = path.join(__dirname, 'dist');
const vercelDir = path.join(__dirname, '.vercel', 'output');

// Limpar diretório .vercel/output se existir
if (fs.existsSync(vercelDir)) {
  fs.rmSync(vercelDir, { recursive: true, force: true });
}

// Criar estrutura básica
fs.mkdirSync(path.join(vercelDir, 'static'), { recursive: true });

// Função para copiar diretórios recursivamente
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copiar arquivos client para static
if (fs.existsSync(path.join(distDir, 'client'))) {
  copyDir(path.join(distDir, 'client'), path.join(vercelDir, 'static'));
}

// Encontrar o arquivo JS principal
const assetsDir = path.join(vercelDir, 'static', 'assets');
const jsFiles = fs.readdirSync(assetsDir).filter(file => file.startsWith('index-') && file.endsWith('.js'));
const mainJsFile = jsFiles[0] || 'index.js';

// Criar index.html SPA fallback
const indexHtml = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sistema Alyani Lavanderia</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/${mainJsFile}"></script>
  </body>
</html>`;

fs.writeFileSync(path.join(vercelDir, 'static', 'index.html'), indexHtml);

// Criar config.json do Vercel
fs.writeFileSync(
  path.join(vercelDir, 'config.json'),
  JSON.stringify({
    version: 3,
    routes: [
      {
        handle: 'filesystem'
      },
      {
        src: '/(.*)',
        dest: '/index.html'
      }
    ]
  })
);

console.log('✅ Build para Vercel concluído com sucesso!');
