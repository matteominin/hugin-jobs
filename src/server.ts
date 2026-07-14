import { createServer, type Server } from 'node:http';

import { config } from './config.js';

export function startServer(): Server {
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('OK');
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not Found');
  });

  server.listen(config.port, () => {
    console.log(`[server] listening on :${config.port}`);
  });

  return server;
}
