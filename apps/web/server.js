// Custom entry point instead of `next start`/`next dev`. This is required
// (not just a style choice) because the bind/auth guard below must run and
// be able to refuse to start BEFORE any socket is opened — middleware runs
// too late for that (acceptance criterion: binding to a non-loopback host
// without a password must mean the process never listens at all).
import { createServer } from "node:http";
import next from "next";

const dev = process.argv.includes("--dev");
const hostname = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT) || 3000;

function isLoopback(host) {
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}

if (!isLoopback(hostname) && !process.env.GLAB2GH_AUTH_PASSWORD) {
  console.error(
    `[glab2gh] Refusing to start: HOST=${hostname} is not loopback, but GLAB2GH_AUTH_PASSWORD is not set.\n` +
      `This app holds GitLab/GitHub tokens that can read and write every repo it's pointed at — ` +
      `binding it to a non-local address without a password would expose that to anyone on the network.\n` +
      `Set GLAB2GH_AUTH_PASSWORD to a strong password, or bind to 127.0.0.1 (the default).`,
  );
  process.exit(1);
}

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer((req, res) => {
      handle(req, res);
    }).listen(port, hostname, () => {
      console.log(`[glab2gh] ready on http://${hostname}:${port}${dev ? " (dev)" : ""}`);
    });
  })
  .catch((err) => {
    console.error("[glab2gh] failed to start:", err);
    process.exit(1);
  });
