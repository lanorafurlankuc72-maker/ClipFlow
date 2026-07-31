import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(currentDirectory, '../../../.env'), quiet: true });

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
  console.log(`ClipFlow API listening on http://localhost:${port}`);
});
