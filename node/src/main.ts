import express, { Request, Response } from "express";

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "hello from node cookbook sample" });
});

const server = app.listen(port, () => {
  console.log(`listening on :${port}`);
});

const shutdown = (signal: NodeJS.Signals) => {
  console.log(`received ${signal}, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
