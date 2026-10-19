import http from "node:http";

// Disposable preview only: preserve React's streamed HTML through a temporary
// Cloudflare tunnel. Bind to loopback; this is not a production hosting server.
const port = Number(process.env.PREVIEW_PROXY_PORT || 3400);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid preview proxy port");
const server = http.createServer((req, res) => {
  const path = req.url || "/";
  const upstream = http.request({
    hostname: "127.0.0.1", port: 3000, path, method: req.method,
    headers: { ...req.headers, "x-forwarded-host": req.headers["x-forwarded-host"] || req.headers.host, "x-forwarded-proto": req.headers["x-forwarded-proto"] || "https" },
  }, response => {
    const headers = { ...response.headers };
    const cache = String(headers["cache-control"] || "private, no-store");
    headers["cache-control"] = cache.includes("no-transform") ? cache : `${cache}, no-transform`;
    res.writeHead(response.statusCode || 502, headers);
    response.pipe(res);
    response.on("error", () => res.destroy());
  });
  upstream.setTimeout(60000, () => upstream.destroy(new Error("Upstream timeout")));
  upstream.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store, no-transform" });
      res.end("The temporary preview server is restarting. Please try again shortly.");
    } else res.destroy();
  });
  req.on("aborted", () => upstream.destroy());
  req.pipe(upstream);
});
server.listen(port, "127.0.0.1", () => console.log(`Temporary no-transform preview proxy listening on loopback port ${port}`));
const stop = () => server.close(() => process.exit(0));
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
