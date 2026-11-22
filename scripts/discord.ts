// Uruchomienie bota Discord bez npm (Bun jest w projekcie):
//   cd backend
//   bun run scripts/discord.ts
// Alternatywnie, jeśli masz Node 22+:
//   node --experimental-strip-types scripts/discord.ts
// Wymagane env (z .env lub powłoki): DISCORD_TOKEN
// Brak tokenu nie jest błędem: bot loguje "DISCORD_TOKEN nie ustawiony – bot pominięty" i kończy pracę.
import "dotenv/config";
import { startDiscordBot } from "../src/channels/discord";

await startDiscordBot();
