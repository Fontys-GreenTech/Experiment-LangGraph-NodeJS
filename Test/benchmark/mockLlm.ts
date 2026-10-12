import { fakeModel, FakeBuiltModel } from "@langchain/core/testing";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, BaseMessage } from "@langchain/core/messages";

export interface MockToolCallSpec {
    name: string;
    args: Record<string, any>;
    id?: string;
}

export interface LatencyMockStats {
    callCount: number;
    totalLlmLatencyMs: number;
}

export type MockResponseType = string | AIMessage | { toolCalls: MockToolCallSpec[]; content?: string };

/**
 * Custom Mock LLM implementation that simulates constant latency per LLM call.
 * Used specifically to measure Framework Overhead time penalties.
 */
export class ConstantLatencyMockChatModel extends BaseChatModel {
    latencyMs: number;
    responses: MockResponseType[];
    stats: LatencyMockStats;
    boundTools: any[] = [];

    constructor(
        latencyMs: number,
        responses: MockResponseType[] = ["Default mock response"],
        stats?: LatencyMockStats
    ) {
        super({});
        this.latencyMs = latencyMs;
        this.responses = responses;
        this.stats = stats ?? { callCount: 0, totalLlmLatencyMs: 0 };
    }

    _llmType(): string {
        return "constant_latency_mock";
    }

    bindTools(tools: any[]): ConstantLatencyMockChatModel {
        const copy = new ConstantLatencyMockChatModel(this.latencyMs, this.responses, this.stats);
        copy.boundTools = tools;
        return copy;
    }

    async _generate(messages: BaseMessage[], _options: any): Promise<any> {
        if (this.latencyMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
        }

        const currentCallIndex = this.stats.callCount;
        this.stats.callCount++;
        this.stats.totalLlmLatencyMs += this.latencyMs;

        const resp = this.responses[currentCallIndex % this.responses.length];
        let message: AIMessage;

        if (typeof resp === "string") {
            message = new AIMessage(resp);
        } else if (resp instanceof AIMessage) {
            message = resp;
        } else if (resp && (resp as any).toolCalls) {
            const toolCalls = (resp as any).toolCalls.map((tc: MockToolCallSpec, idx: number) => ({
                id: tc.id || `call_${idx}_${Date.now()}`,
                name: tc.name,
                args: tc.args || {},
            }));
            message = new AIMessage({
                content: (resp as any).content || "",
                tool_calls: toolCalls,
            });
        } else {
            message = new AIMessage(String(resp));
        }

        return {
            generations: [
                {
                    text: typeof message.content === "string" ? message.content : "",
                    message,
                },
            ],
        };
    }
}

/**
 * Helper factory to create Mock LLMs from the LangGraph / LangChain ecosystem
 * for benchmarking and testing graph workflows without external API calls.
 */
export class MockLLMFactory {
    /**
     * Creates a simple mock model that returns fixed textual responses.
     */
    static createSimpleTextMock(responses: string[] = ["Mock response"]): FakeListChatModel {
        return new FakeListChatModel({ responses });
    }

    /**
     * Creates a tool-calling mock model using fakeModel().
     * First returns tool call(s), then a final text answer.
     */
    static createToolCallingMock(
        toolCalls: MockToolCallSpec[],
        finalAnswer: string = "Mock tool execution completed."
    ): FakeBuiltModel {
        return fakeModel()
            .respondWithTools(toolCalls)
            .respond(new AIMessage(finalAnswer));
    }

    /**
     * Creates a multi-step tool-calling mock model that executes multiple tool rounds.
     */
    static createMultiStepToolMock(
        steps: Array<{ toolCalls: MockToolCallSpec[]; response?: string }>,
        finalAnswer: string = "Multi-step tool execution completed."
    ): FakeBuiltModel {
        const model = fakeModel();
        for (const step of steps) {
            model.respondWithTools(step.toolCalls);
            if (step.response) {
                model.respond(new AIMessage(step.response));
            }
        }
        model.respond(new AIMessage(finalAnswer));
        return model;
    }

    /**
     * Creates a dynamic mock model that responds based on the incoming message history.
     */
    static createDynamicMock(
        handler: (messages: BaseMessage[]) => BaseMessage | Error
    ): FakeBuiltModel {
        return fakeModel().respond(handler);
    }

    /**
     * Creates a constant latency mock LLM to test and measure Framework Overhead.
     */
    static createConstantLatencyMock(
        latencyMs: number,
        responses: MockResponseType[] = ["Mock response with constant latency"],
        stats?: LatencyMockStats
    ): ConstantLatencyMockChatModel {
        return new ConstantLatencyMockChatModel(latencyMs, responses, stats);
    }

    /**
     * Creates a tool-calling constant latency mock LLM.
     */
    static createConstantLatencyToolMock(
        latencyMs: number,
        toolCalls: MockToolCallSpec[],
        finalAnswer: string = "Mock tool execution completed.",
        stats?: LatencyMockStats
    ): ConstantLatencyMockChatModel {
        return new ConstantLatencyMockChatModel(
            latencyMs,
            [{ toolCalls, content: "" }, finalAnswer],
            stats
        );
    }
}
