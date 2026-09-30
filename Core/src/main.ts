import { StateSchema, MessagesValue, type GraphNode, StateGraph, START, END } from "@langchain/langgraph";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "node:fs/promises";

import * as dotenv from 'dotenv';
import {ToolNode} from "@langchain/langgraph/prebuilt";
dotenv.config();

const readCsvTool = tool(
    async ({ filePath }) => {
        try {
            const fileContent = await fs.readFile(filePath, "utf-8");
            const lines = fileContent.trim().split("\n");

            if (lines.length === 0) {
                return JSON.stringify({ message: "The CSV file is empty." });
            }

            const headers = lines[0].split(",").map((h) => h.trim());
            const rows = lines.slice(1).map((line) => {
                const values = line.split(",").map((v) => v.trim());
                const rowObject: Record<string, string> = {};
                headers.forEach((header, index) => {
                    rowObject[header] = values[index] !== undefined ? values[index] : "";
                });
                return rowObject;
            });

            return JSON.stringify(rows, null, 2);
        } catch (error: any) {
            return JSON.stringify({ error: `Failed to read CSV file: ${error.message}` });
        }
    },
    {
        name: "read_csv_file",
        description: "Reads a CSV file from a specified file path, parses it, and returns the data as a JSON string.",
        schema: z.object({
            filePath: z.string().describe("The absolute or relative path to the CSV file."),
        }),
    }
);

export class MockGraphApp {
    private tools = [readCsvTool];

    private state = new StateSchema({
        messages: MessagesValue,
    });

    private model = new ChatGoogleGenerativeAI({
        model: "gemini-3.5-flash-lite",
        temperature: 0.7,
    }).bindTools(this.tools);

    private compiledGraph = this.buildGraph();

    private buildGraph() {
        const callGemini: GraphNode<typeof this.state> = async (state) => {
            const response = await this.model.invoke(state.messages);
            return { messages: [response] };
        };

        const shouldContinue = (state: any) => {
            const lastMessage = state.messages[state.messages.length - 1];
            if (lastMessage?.tool_calls?.length > 0) {
                return "tools";
            }
            return END;
        };

        const toolNode = new ToolNode(this.tools);

        return new StateGraph(this.state)
            .addNode("gemini_node", callGemini)
            .addNode("tools", toolNode)
            .addEdge(START, "gemini_node")
            .addConditionalEdges("gemini_node", shouldContinue, {
                tools: "tools",
                [END]: END,
            })
            .addEdge("tools", "gemini_node")
            .compile();
    }

    public async invoke(messages: Array<{ role: string; content: string }>) {
        return await this.compiledGraph.invoke({ messages });
    }
}

// Usage Example with Timing
const graphApp = new MockGraphApp();

const startTime = performance.now();
const result = await graphApp.invoke([{ role: "user", content: "What is inside the data.csv file?" }]);
const endTime = performance.now();

const durationMs = (endTime - startTime).toFixed(2);

console.log("Result:", result);
console.log(`Request took ${durationMs} ms`);