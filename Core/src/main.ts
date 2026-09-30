import { StateSchema, MessagesValue, type GraphNode, StateGraph, START, END } from "@langchain/langgraph";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

import { GoogleGenAI } from '@google/genai';

import * as dotenv from 'dotenv';
dotenv.config();

import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

export class MockGraphApp {
    private state = new StateSchema({
        messages: MessagesValue,
    });

    private model = new ChatGoogleGenerativeAI({
        model: "gemini-3.5-flash-lite",
        temperature: 0.7,
    });

    private compiledGraph = this.buildGraph();

    private buildGraph() {
        const callGemini: GraphNode<typeof this.state> = async (state) => {
            const response = await this.model.invoke(state.messages);
            return { messages: [response] };
        };

        return new StateGraph(this.state)
            .addNode("gemini_node", callGemini)
            .addEdge(START, "gemini_node")
            .addEdge("gemini_node", END)
            .compile();
    }

    public async invoke(messages: Array<{ role: string; content: string }>) {
        return await this.compiledGraph.invoke({ messages });
    }
}

// Usage Example with Timing
const graphApp = new MockGraphApp();

const startTime = performance.now();
const result = await graphApp.invoke([{ role: "user", content: "Hello Gemini, tell me a quick joke!" }]);
const endTime = performance.now();

const durationMs = (endTime - startTime).toFixed(2);

console.log("Result:", result);
console.log(`Request took ${durationMs} ms`);