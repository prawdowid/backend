/**
 * Discord adapter: DM and @mention messages -> verifyInput -> formatted reply.
 * No network calls happen at import time; the client only connects in startDiscordBot().
 */
import { Client, Events, GatewayIntentBits, type Message } from "discord.js";
import type { VerifyResponse } from "../pipeline/types";
import { verifyInput } from "../pipeline/verify";
import { formatVerdictMessage } from "./format";

/** Simple URL detection; intentionally not a full URL parser. */
const URL_PATTERN = /https?:\/\/[^\s<>"']+/i;
const MAX_MESSAGE_CHARS = 2000;
const TYPING_REFRESH_MS = 8000;
const CLARIFICATION_TEXT = "Napisz twierdzenie albo wklej link — wtedy sprawdzę. To nie jest werdykt.";

function stripMention(content: string, botId: string): string {
    return content.replace(new RegExp(`<@!?${botId}>`, "g"), " ").trim();
}

function extractUrl(text: string): string | undefined {
    const match = URL_PATTERN.exec(text);
    if (!match) return undefined;
    return match[0].replace(/[.,;:!?)\]]+$/, "");
}

function shortReason(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error);
    const text = raw.replace(/\s+/g, " ").trim();
    return text ? text.slice(0, 200) : "nieznany błąd";
}

function sendOptions(content: string): { content: string; allowedMentions: { parse: [] } } {
    return {
        content: content.slice(0, MAX_MESSAGE_CHARS),
        // Claim text and titles come from the outside; never let them ping anyone.
        allowedMentions: { parse: [] },
    };
}

async function sendChunks(message: Message, chunks: string[]): Promise<void> {
    const channel = message.channel;
    // PartialGroupDMChannel has no send(); everywhere else send exists.
    if (!("send" in channel)) return;
    for (const chunk of chunks) {
        await channel.send(sendOptions(chunk));
    }
}

async function handleIncomingMessage(message: Message, client: Client): Promise<void> {
    if (message.author.bot) return;

    const isDirect = message.channel.isDMBased();
    const botId = client.user?.id;
    if (!isDirect && (!botId || !message.mentions.has(botId))) return;

    const raw = message.content ?? "";
    const text = botId ? stripMention(raw, botId) : raw.trim();
    if (!text) {
        await message.reply(sendOptions(CLARIFICATION_TEXT));
        return;
    }

    const url = extractUrl(text);
    const typingChannel = "sendTyping" in message.channel ? message.channel : null;
    const keepTyping = (): void => {
        void typingChannel?.sendTyping().catch(() => undefined);
    };

    // Show "typing…" right away, then refresh while the pipeline works.
    keepTyping();
    const typingTimer = setInterval(keepTyping, TYPING_REFRESH_MS);

    try {
        const result: VerifyResponse = await verifyInput({ text, url, channel: "discord" });
        try {
            await sendChunks(message, formatVerdictMessage(result));
        } catch (sendError) {
            console.error("[discord] nie udało się wysłać odpowiedzi:", sendError);
        }
    } catch (error) {
        console.error("[discord] sprawdzanie nie powiodło się:", error);
        await message.reply(
            sendOptions(`Nie udało się sprawdzić. To nie jest werdykt.\nPowód: ${shortReason(error)}`),
        );
    } finally {
        clearInterval(typingTimer);
    }
}

export async function startDiscordBot(): Promise<void> {
    const token = process.env.DISCORD_TOKEN?.trim();
    if (!token) {
        console.log("DISCORD_TOKEN nie ustawiony – bot pominięty");
        return;
    }

    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.DirectMessages,
        ],
    });

    // discord.js 14.28 renamed the event value to "clientReady"; Events.ClientReady tracks that.
    client.once(Events.ClientReady, (ready) => {
        console.log(`[discord] zalogowano jako ${ready.user.tag}`);
    });

    client.on(Events.Error, (error) => {
        console.error("[discord] błąd klienta:", error);
    });

    client.on(Events.MessageCreate, (message) => {
        void handleIncomingMessage(message, client).catch((error: unknown) => {
            console.error("[discord] błąd obsługi wiadomości:", error);
        });
    });

    try {
        await client.login(token);
    } catch (error) {
        console.error("[discord] logowanie nie powiodło się:", error);
    }
}
