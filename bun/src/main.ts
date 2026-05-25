const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({
  port,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }
    return Response.json({ message: "hello from bun cookbook sample" });
  },
});

console.log(`listening on :${server.port}`);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    console.log(`received ${sig}, shutting down`);
    server.stop();
    process.exit(0);
  });
}
