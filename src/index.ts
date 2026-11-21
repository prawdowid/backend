import "dotenv/config";
import { Elysia } from "elysia";

const port = Number(process.env.PORT ?? 3000);

const app = new Elysia()
  .get("/", () => ({ message: "Hello World" }))
  .listen(port);

console.log(
  `Elysia is running at http://${app.server?.hostname}:${app.server?.port}`,
);

export default app;
