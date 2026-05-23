// src/index.js - 纯 WebSocket 代理
const PROXY_RULES = [
    { 
        localPrefix: '/okx-wx', 
        targetDomain: 'ws.okx.com', 
        targetPort: 8443, 
        targetProtocol: 'wss' 
    },
    { 
        localPrefix: '/postman', 
        targetDomain: 'ws.postman-echo.com', 
        targetProtocol: 'wss' 
    }
];

function getProxyConfig(pathname) {
    for (const rule of PROXY_RULES) {
        if (pathname.startsWith(rule.localPrefix)) return rule;
    }
    return null;
}

function rewritePath(originalPath, config) {
    const newPath = originalPath.slice(config.localPrefix.length);
    return newPath || '/';
}

async function handleWebSocket(request, config) {
    const url = new URL(request.url);
    const targetPath = rewritePath(url.pathname, config);
    const targetUrl = config.targetPort 
        ? `${config.targetProtocol}://${config.targetDomain}:${config.targetPort}${targetPath}${url.search}`
        : `${config.targetProtocol}://${config.targetDomain}${targetPath}${url.search}`;
    const upstreamWebSocket = new WebSocket(targetUrl);
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    upstreamWebSocket.addEventListener('message', (event) => {
        if (server.readyState === 1) server.send(event.data);
    });
    server.addEventListener('message', (event) => {
        if (upstreamWebSocket.readyState === 1) upstreamWebSocket.send(event.data);
    });
    server.addEventListener('close', () => {
        if (upstreamWebSocket.readyState === 1) upstreamWebSocket.close(1000);
    });
    upstreamWebSocket.addEventListener('close', () => {
        if (server.readyState === 1) server.close(1000);
    });
    return new Response(null, { status: 101, webSocket: client });
}

async function handleRequest(request) {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
        return new Response('WebSocket proxy only', { status: 426 });
    }
    const config = getProxyConfig(url.pathname);
    if (!config) return new Response('Not Found', { status: 404 });
    return handleWebSocket(request, config);
}

addEventListener('fetch', (event) => {
    event.respondWith(handleRequest(event.request));
});
