import { spawn } from 'node:child_process';
import { resolve, sep } from 'node:path';
import { createLocalApi } from './local-api.mjs';

// The dist directory is embedded by Compilar.bat when this file is compiled.
const distDir = resolve(import.meta.dir, '../dist');
const embeddedFiles = new Map(Bun.embeddedFiles.map((file) => [file.name.replaceAll('\\', '/'), file]));

async function getFile(relativePath) {
  const embedded = embeddedFiles.get(`dist/${relativePath}`);
  if (embedded) return embedded;
  const disk = Bun.file(resolve(distDir, relativePath));
  return (await disk.exists()) ? disk : null;
}

const indexFile = await getFile('index.html');

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8',
};

function contentType(path) {
  const extension = path.slice(path.lastIndexOf('.')).toLowerCase();
  return contentTypes[extension] ?? 'application/octet-stream';
}

if (!indexFile) {
  console.error('Arquivos do jogo não encontrados dentro do executável. Recompile com Compilar.bat.');
  process.exit(1);
}

let api;
try {
  api = await createLocalApi();
} catch (error) {
  console.error('Não foi possível conectar ao MySQL do XAMPP. Inicie o MySQL no painel do XAMPP e tente novamente.');
  console.error(error);
  process.exit(1);
}

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: Number(process.env.OPENPOLIS_PORT ?? 18787),
  async fetch(request) {
    if (new URL(request.url).pathname.startsWith('/api/')) return api.handle(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Método não permitido', { status: 405 });
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response('URL inválida', { status: 400 });
    }

    // Do not let URL-encoded backslashes or dot segments escape the embedded dist directory.
    if (pathname.includes('\\') || pathname.split('/').includes('..')) {
      return new Response('URL inválida', { status: 400 });
    }
    const relativePath = pathname.replace(/^\/+/, '');
    const filePath = resolve(distDir, relativePath);
    if (filePath !== distDir && !filePath.startsWith(distDir + sep)) {
      return new Response('URL inválida', { status: 400 });
    }

    const asset = relativePath ? await getFile(relativePath) : null;
    const file = asset ?? (relativePath.includes('.') ? null : indexFile);
    if (!file) return new Response('Não encontrado', { status: 404 });
    return new Response(request.method === 'HEAD' ? null : file, {
      headers: { 'Content-Type': contentType(asset ? relativePath : 'index.html') },
    });
  },
});

const url = `http://127.0.0.1:${server.port}/`;
console.log(`Republica local: ${url}`);
console.log(`Cidade pronta: ${url}demo`);
console.log('Mantenha esta janela aberta enquanto joga. Pressione Ctrl+C para encerrar.');

if (process.argv.includes('--self-test')) {
  const index = await fetch(url);
  const demo = await fetch(`${url}demo`);
  const icon = await fetch(`${url}favicon.svg`);
  const html = await index.text();
  const assetPath = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  const asset = assetPath ? await fetch(`${url.slice(0, -1)}${assetPath}`) : null;
  const health = await fetch(`${url}api/health`);
  const passed = index.status === 200 && demo.status === 200 && icon.status === 200 && asset?.status === 200 && health.status === 200;
  console.log(`Verificação local: ${passed ? 'OK' : 'FALHOU'} (início ${index.status}, demo ${demo.status}, ícone ${icon.status}, JS ${asset?.status ?? 'ausente'}, banco ${health.status})`);
  server.stop(true);
  await api.close();
  process.exit(passed ? 0 : 1);
}

if (!process.argv.includes('--no-browser')) {
  try {
    spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
  } catch {
    console.log('Abra o endereço acima no navegador.');
  }
}
