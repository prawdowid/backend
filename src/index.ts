import "dotenv/config";
import { Elysia } from "elysia";
import { swagger } from "@elysiajs/swagger";
import { verificationApi } from "./server";
import { startDiscordBot } from "./channels/discord";

const port = Number(process.env.PORT ?? 3000);

const app = new Elysia()
    .use(swagger({ path: "/docs" }))
    .use(verificationApi)
    .listen(port);

console.log(`Prawdowid działa: http://${app.server?.hostname}:${app.server?.port}`);

if (process.env["DISCORD_TOKEN"]) {
    startDiscordBot().catch((error) => {
        console.error("[discord] nie udało się uruchomić bota:", (error as Error).message);
    });
} else {
    console.log("[discord] DISCORD_TOKEN nie ustawiony – bot pominięty");
}

export default app;
