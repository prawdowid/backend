import "dotenv/config";
import { Elysia, t } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { ProcessImageSchema, ProcessTextSchema, ProcessURLSchema, ProcessVideoSchema } from "./modules/schemas";
import { processUrl, processText, processImage, processVideo } from "./modules/handlers";

const port = Number(process.env.PORT ?? 3000);

const app = new Elysia()
  .use(swagger({ path: "/docs" }))
  .get("/", () => ({ message: "Hello World" }))
  .group("/process", (app) => {
    return app
      .post("/url", processUrl, {body: ProcessURLSchema}) 
      .post("/text", processText, {body: ProcessTextSchema}) 
      .post("/image", processImage, {body: ProcessImageSchema}) 
      .post("/video", processVideo, {body: ProcessVideoSchema}) 
  })
  .listen(port);

console.log(
  `Elysia is running at http://${app.server?.hostname}:${app.server?.port}`,
);

export default app;
