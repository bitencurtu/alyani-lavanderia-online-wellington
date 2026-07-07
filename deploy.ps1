# Script de deploy para Git + Vercel
# Execute este arquivo no PowerShell após reiniciar o terminal!

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  AYANI LAVANDERIA - DEPLOY SCRIPT" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Verifica se o Git está disponível
try {
    Write-Host "1. Verificando Git..." -ForegroundColor Yellow
    $gitVersion = git --version
    Write-Host "   ✓ Git encontrado: $gitVersion" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Git não encontrado! Reinicie o terminal/VS Code." -ForegroundColor Red
    Write-Host "   Ou instale o Git: https://git-scm.com/downloads" -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

Write-Host ""

# Inicializa o repositório Git (se não tiver)
Write-Host "2. Inicializando repositório Git..." -ForegroundColor Yellow
git init
Write-Host "   ✓ Repositório inicializado!" -ForegroundColor Green

Write-Host ""

# Verifica se tem arquivo .gitignore
if (-not (Test-Path ".gitignore")) {
    Write-Host "⚠️  Arquivo .gitignore não encontrado, criando..." -ForegroundColor Yellow
    @"
# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*

# Dependencies
node_modules
.pnp
.pnp.js

# Build outputs
dist
.output

# Testing
coverage
*.lcov
.nyc_output

# Temporary files
*.swp
*.swo
*~
*.tmp

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Editor directories
.vscode/*
!.vscode/extensions.json
.idea
.DS_Store
*.suo
*.ntvs*
*.njsproj
*.sln
*.sw?

# Misc
.cache
.temp

# TanStack Start
dist
.output
"@ | Out-File -FilePath ".gitignore" -Encoding UTF8
    Write-Host "   ✓ Arquivo .gitignore criado!" -ForegroundColor Green
}

Write-Host ""

# Adiciona os arquivos ao Git
Write-Host "3. Adicionando arquivos..." -ForegroundColor Yellow
git add .
Write-Host "   ✓ Arquivos adicionados!" -ForegroundColor Green

Write-Host ""

# Faz o commit
Write-Host "4. Criando commit..." -ForegroundColor Yellow
git commit -m "Primeiro deploy: Sistema Alyani Lavanderia"
Write-Host "   ✓ Commit criado!" -ForegroundColor Green

Write-Host ""

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  PRÓXIMOS PASSOS!" -ForegroundColor Yellow
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Agora você precisa:" -ForegroundColor White
Write-Host ""
Write-Host "1. Conectar o repositório ao GitHub:" -ForegroundColor White
Write-Host "   Substitua SEU-USUARIO abaixo:" -ForegroundColor Gray
Write-Host ""
Write-Host "   git remote add origin https://github.com/SEU-USUARIO/alyani-lavanderia.git" -ForegroundColor Cyan
Write-Host "   git branch -M main" -ForegroundColor Cyan
Write-Host "   git push -u origin main" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. Depois vá para:" -ForegroundColor White
Write-Host "   https://vercel.com/dashboard" -ForegroundColor Cyan
Write-Host "   Clique em Add New Project e selecione o repositório" -ForegroundColor Gray
Write-Host ""
Read-Host "Pressione Enter para finalizar"
