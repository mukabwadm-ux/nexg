/* Serve this sample-data design collection on the local computer only. */
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const root = path.resolve(__dirname);
const types = {
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".zip": "application/zip",
};
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    const pathname = decodeURIComponent(
      url.pathname === "/" ? "/index.html" : url.pathname,
    );
    const filename = path.resolve(root, "." + pathname);
    if (!filename.startsWith(root + path.sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const body = await fs.readFile(filename);
    response.writeHead(200, {
      "Content-Type":
        types[path.extname(filename)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(body);
  } catch {
    response.writeHead(404).end("Not found");
  }
});
server.listen(0, "127.0.0.1", () =>
  process.stdout.write(
    JSON.stringify({ url: "http://127.0.0.1:" + server.address().port }) + "\n",
  ),
);
