import { describe, expect, it } from "bun:test";
import { processImage, processVideo } from "../src/modules/handlers";

describe("media route responses", () => {
    it("returns a Polish unavailable message for images", () => {
        const set: { status?: number | string } = {};
        const response = processImage({ body: { image: "Zm9v" }, set });

        expect(set.status).toBe(501);
        expect(response).toEqual({
            ok: false,
            error: "Obsługa obrazów nie jest jeszcze dostępna.",
        });
    });

    it("returns a Polish unavailable message for videos", () => {
        const set: { status?: number | string } = {};
        const response = processVideo({ body: { video: "https://example.com/video.mp4" }, set });

        expect(set.status).toBe(501);
        expect(response).toEqual({
            ok: false,
            error: "Obsługa filmów nie jest jeszcze dostępna.",
        });
    });
});
