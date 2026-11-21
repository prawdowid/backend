import "dotenv/config";
import { Elysia, t } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { ProcessImageSchema, ProcessTextSchema, ProcessURLSchema, ProcessVideoSchema } from "./modules/schemas";
import { processUrl, processText, processImage, processVideo } from "./modules/handlers";

const port = Number(process.env.PORT ?? 3000);

const app = new Elysia()
  .use(swagger({ path: "/docs" }))
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 422;
      return { ok: false, error: "Dane żądania są nieprawidłowe." };
    }

    if (code === "PARSE") {
      set.status = 400;
      return { ok: false, error: "Nie udało się odczytać danych żądania." };
    }

    if (code === "NOT_FOUND") {
      set.status = 404;
      return { ok: false, error: "Nie znaleziono żądanego adresu API." };
    }

    console.error("Nieobsłużony błąd API:", error);
    set.status = 500;
    return { ok: false, error: "Wystąpił nieoczekiwany błąd serwera." };
  })
  .get("/", () => ({ message: "Serwer działa." }))
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
