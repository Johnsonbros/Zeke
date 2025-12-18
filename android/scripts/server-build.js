import { build } from 'esbuild';
import { rm, mkdir, cp } from 'fs/promises';
import { existsSync } from 'fs';
import { spawn } from 'child_process';

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    console.log(`Running: ${command} ${args.join(' ')}`);
    const proc = spawn(command, args, { 
      stdio: 'inherit',
      shell: true 
    });
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
    proc.on('error', reject);
  });
}

async function buildWebApp() {
  console.log('Building Expo web app...');
  
  try {
    await runCommand('npx', ['expo', 'export', '--platform', 'web', '--output-dir', 'dist/web']);
    console.log('Web build complete: dist/web');
  } catch (err) {
    console.warn('Web build failed (non-critical for Expo Go deployment):', err.message);
  }
}

async function buildServer() {
  console.log('Building server...');
  
  if (!existsSync('dist')) {
    await mkdir('dist', { recursive: true });
  }
  
  if (existsSync('dist/server.cjs')) {
    await rm('dist/server.cjs', { force: true });
  }
  
  await build({
    entryPoints: ['server/index.ts'],
    platform: 'node',
    bundle: true,
    format: 'cjs',
    outfile: 'dist/server.cjs',
    packages: 'external',
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    minify: true,
    logLevel: 'info',
  });
  
  console.log('Server build complete: dist/server.cjs');
}

async function copyTemplates() {
  console.log('Copying server templates...');
  
  const templatesDir = 'dist/server/templates';
  if (!existsSync(templatesDir)) {
    await mkdir(templatesDir, { recursive: true });
  }
  
  if (existsSync('server/templates')) {
    await cp('server/templates', templatesDir, { recursive: true });
    console.log('Templates copied to dist/server/templates');
  }
}

async function main() {
  try {
    await buildWebApp();
    await buildServer();
    await copyTemplates();
    console.log('Full build complete!');
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

main();
