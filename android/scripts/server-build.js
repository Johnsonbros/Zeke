import { build } from 'esbuild';
import { rm, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

async function buildServer() {
  console.log('Building server...');
  
  // Ensure dist directory exists
  if (!existsSync('dist')) {
    await mkdir('dist', { recursive: true });
  }
  
  // Clean previous server build
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

buildServer().catch((err) => {
  console.error('Server build failed:', err);
  process.exit(1);
});
