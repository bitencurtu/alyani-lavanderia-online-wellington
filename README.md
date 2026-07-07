# Alyani Lavanderia - Sistema de Gestão

Sistema de gestão para lavanderia industrial, desenvolvido com TanStack Start, React, Supabase e Tailwind CSS.

## Tecnologias

- **Framework**: TanStack Start (React + Vite)
- **Banco de Dados**: Supabase PostgreSQL
- **UI**: Radix UI + Tailwind CSS
- **Deploy**: Vercel

## Instalação e Execução Local

1. Instale as dependências:
```bash
npm install
```

2. Configure as variáveis de ambiente:
   - Copie o arquivo `.env.example` para `.env`
   - Preencha as credenciais do Supabase

3. Execute o servidor de desenvolvimento:
```bash
npm run dev
```

A aplicação estará disponível em: http://localhost:8081

## Deploy no Vercel

### Passo 1: Inicialize o Git
```bash
git init
```

### Passo 2: Configure seu usuário Git
```bash
git config --global user.name "Seu Nome"
git config --global user.email "seu-email@exemplo.com"
```

### Passo 3: Adicione os arquivos e faça o primeiro commit
```bash
git add .
git commit -m "Primeiro commit: Sistema Alyani Lavanderia"
```

### Passo 4: Conecte ao repositório GitHub
Substitua `SEU-USUARIO` e `NOME-REPOSITORIO` pelos seus dados:
```bash
git remote add origin https://github.com/SEU-USUARIO/NOME-REPOSITORIO.git
git branch -M main
git push -u origin main
```

### Passo 5: Conecte o repositório ao Vercel
1. Vá para: https://vercel.com/dashboard
2. Clique em **Add New Project**
3. Selecione o repositório do GitHub que você acabou de criar
4. Configure as variáveis de ambiente no painel do Vercel:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
5. Clique em **Deploy**

## Pronto!
Agora toda vez que você fizer um `git push`, o Vercel fará um novo deploy automaticamente!

