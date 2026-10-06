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
    let requestPath;
    try { requestPath = decodeURIComponent(request.url.split('?')[0]); }
    catch { response.writeHead(400); response.end('Bad request'); return; }
    if (requestPath === '/') requestPath = '/administrativo.html';

    const filePath = path.resolve(root, `.${requestPath}`);
    const relative = path.relative(root, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative) ||
        relative.split(path.sep).some(part => part.startsWith('.') || /private|chrome-temp|edge-temp/i.test(part)) ||
        !mime[path.extname(filePath)] || /\.bak$|google-.*\.png$|publicacion-preparada\.png$/i.test(relative)) {
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
            'Content-Type': mime[path.extname(filePath)],
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
            'X-Frame-Options': 'DENY'
        });
        response.end(data);
    });
}).listen(8080, '127.0.0.1');
