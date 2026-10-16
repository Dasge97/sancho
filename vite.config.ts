import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({ plugins:[vue()], root:'src/web', build:{outDir:'../../dist',emptyOutDir:true}, server:{port:5173,proxy:{'/api':'http://localhost:3000','/health':'http://localhost:3000','/webhooks':'http://localhost:3000'}} });
