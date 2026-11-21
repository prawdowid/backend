import OpenAI from 'openai';

const PROMPT = ``;

export class DeepSeek {
    private static client?: OpenAI;

    public static async Chat(message: string) {
        if(this.client === undefined) {
            this.client = new OpenAI({
                baseURL: process.env['OPENAI_BASE_URL'],
                apiKey: process.env['OPENAI_API_KEY']
            });
        }

        const response = await this.client.responses.create({
            model: process.env['OPENAI_MODEL'],
            instructions: PROMPT,
            input: message,
        });
        
        return response.output_text;
    }
}