import { getEncoding } from "js-tiktoken";
import { AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";

export interface TokenStats {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
}

export class TokenTracker {
    private static encoder: any = null;

    private static getEncoder() {
        if (!this.encoder) {
            this.encoder = getEncoding("cl100k_base");
        }
        return this.encoder;
    }

    /**
     * Counts the number of tokens in a plain text string.
     */
    static countText(text: string): number {
        if (!text || typeof text !== "string") return 0;
        try {
            return this.getEncoder().encode(text).length;
        } catch {
            return Math.ceil(text.length / 4);
        }
    }

    /**
     * Counts prompt vs completion tokens for a single message.
     */
    static countMessage(msg: BaseMessage | any): { promptTokens: number; completionTokens: number } {
        let contentStr = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
        
        if (msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
            contentStr += " " + JSON.stringify(msg.tool_calls);
        }

        const tokens = this.countText(contentStr);

        // If message has usage_metadata directly from LLM, use it when available
        if (msg.usage_metadata && typeof msg.usage_metadata.total_tokens === "number") {
            return {
                promptTokens: msg.usage_metadata.input_tokens ?? 0,
                completionTokens: msg.usage_metadata.output_tokens ?? 0,
            };
        }

        const isAI = msg instanceof AIMessage || msg._getType?.() === "ai";
        if (isAI) {
            return { promptTokens: 0, completionTokens: tokens };
        } else {
            return { promptTokens: tokens, completionTokens: 0 };
        }
    }

    /**
     * Counts all tokens in a message history sequence.
     */
    static countMessages(messages: Array<BaseMessage | any>): TokenStats {
        let promptTokens = 0;
        let completionTokens = 0;

        for (const msg of messages) {
            const counts = this.countMessage(msg);
            promptTokens += counts.promptTokens;
            completionTokens += counts.completionTokens;
        }

        return {
            promptTokens,
            completionTokens,
            totalTokens: promptTokens + completionTokens,
        };
    }
}
