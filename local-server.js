const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const mime = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'application/javascript; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp'
};

http.createServer((request, response) => {
    let requestPath = decodeURIComponent(request.url.split('?')[0]);
    if (requestPath === '/') requestPath = '/administrativo.html';

    const filePath = path.resolve(root, `.${requestPath}`);
    if (!filePath.startsWith(root)) {
        response.writeHead(403);
        response.end();
        return;
    }

    fs.readFile(filePath, (error, data) => {
        if (error) {
            response.writeHead(404);
            response.end('Not found');
            return;
        }

        response.writeHead(200, {
            'Cache-Control': 'no-store',
            'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream'
        });
        response.end(data);
    });
}).listen(8080);
