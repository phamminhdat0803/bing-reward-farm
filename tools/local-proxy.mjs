#!/usr/bin/env node
// Proxy HTTP toi gian chay noi bo (127.0.0.1:18080) de nghiem thu chain/fallback va lam prototype
// cho Local Proxy Gateway (Phase 6). Ho tro CONNECT (HTTPS) + HTTP thuong.
//   node tools/local-proxy.mjs [port]
import http from 'node:http'
import net from 'node:net'

const PORT = Number(process.argv[2] ?? 18080)
let n = 0

const server = http.createServer((req, res) => {
  n += 1
  let target
  try {
    target = new URL(req.url)
  } catch {
    res.writeHead(400).end('bad url')
    return
  }
  const proxyReq = http.request(
    {
      host: target.hostname,
      port: target.port || 80,
      method: req.method,
      path: target.pathname + target.search,
      headers: req.headers
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers)
      proxyRes.pipe(res)
    }
  )
  proxyReq.on('error', () => res.writeHead(502).end('upstream error'))
  req.pipe(proxyReq)
})

server.on('connect', (req, clientSocket, head) => {
  n += 1
  const [host, port] = String(req.url).split(':')
  const upstream = net.connect(Number(port || 443), host, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    if (head?.length) upstream.write(head)
    upstream.pipe(clientSocket)
    clientSocket.pipe(upstream)
  })
  const kill = () => {
    upstream.destroy()
    clientSocket.destroy()
  }
  upstream.on('error', kill)
  clientSocket.on('error', kill)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`local-proxy: http://127.0.0.1:${PORT} (CONNECT + HTTP)`)
  setInterval(() => console.log(`local-proxy: da phuc vu ${n} ket noi`), 30000).unref?.()
})
