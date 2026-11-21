import "dotenv/config";
import { Elysia, t } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { ProcessURLSchema } from "./modules/schemas";

const port = Number(process.env.PORT ?? 3000);

const app = new Elysia()
  .use(swagger({ path: "/docs" }))
  .get("/", () => ({ message: "Hello World" }))
  .group("/process", (app) => {
    return app
      .post("/url", ({ body })=>({ message: body }), {body: ProcessURLSchema}) 
  })
  .listen(port);

console.log(
  `Elysia is running at http://${app.server?.hostname}:${app.server?.port}`,
);

export default app;
