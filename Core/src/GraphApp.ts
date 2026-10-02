import { StateSchema, MessagesValue, type GraphNode, StateGraph, START, END } from "@langchain/langgraph";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import * as dotenv from 'dotenv';
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ReadCsvTool } from "./tools/ReadCsvTool.ts";
import { CalculatorTool } from "./tools/CalculatorTool.ts";
import { ArrayCalcTool } from "./tools/ArrayCalcTool.ts";

dotenv.config();

export class GraphApp {
    private tools = [ReadCsvTool.tool(), CalculatorTool.tool(), ArrayCalcTool.tool()];

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

    public async invoke(messages: Array<any>) {
        return await this.compiledGraph.invoke({ messages });
    }
}