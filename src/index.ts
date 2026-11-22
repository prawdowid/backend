import "dotenv/config";
import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { verificationApi } from "./server";

const port = Number(process.env.PORT ?? 3000);

const app = new Elysia()
    .use(swagger({ path: "/docs" }))
    .use(verificationApi)
    .listen(port);

console.log(`Prawdowid działa: http://${app.server?.hostname}:${app.server?.port}`);

export default app;
