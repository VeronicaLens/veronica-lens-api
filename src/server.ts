import { createApp } from './app.js';
import { loadEnv } from './config/env.js';

const env = loadEnv();
const app = createApp();

app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`API rodando na porta ${env.PORT}`);
});