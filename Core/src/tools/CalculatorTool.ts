import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { toolInfoLine, toolErrorLine, toolTimeLine } from "../logger.ts";

export abstract class CalculatorTool{
    public static tool(){
        return tool(
            async ({ expression }) => {
                const startTime = performance.now();
                try {
                    toolInfoLine("CalcTool", "Running Calc Tool");

                    // Strip any characters other than digits, math operators, decimals, spaces, and parentheses
                    const sanitized = expression.replace(/[^0-9+\-*/().%\s]/g, "");
                    toolInfoLine("CalcTool", "sanitized data: %o", sanitized);

                    if (!sanitized.trim()) {
                        toolErrorLine("CalcTool", "Invalid or empty expression.");
                        const durationMs = (performance.now() - startTime).toFixed(2);
                        toolTimeLine("CalcTool", `Execution time: ${durationMs}ms`);
                        return JSON.stringify({ error: "Invalid or empty expression." });
                    }

                    // Evaluate the sanitized arithmetic expression safely without arbitrary code execution
                    const calculate = new Function(`"use strict"; return (${sanitized});`);
                    const result = calculate();

                    toolInfoLine("CalcTool", "Calculator tool result: %o", result);

                    if (typeof result !== "number" || Number.isNaN(result) || !Number.isFinite(result)) {
                        toolErrorLine("CalcTool", "Expression did not evaluate to a valid finite number.");
                        const durationMs = (performance.now() - startTime).toFixed(2);
                        toolTimeLine("CalcTool", `Execution time: ${durationMs}ms`);
                        return JSON.stringify({ error: "Expression did not evaluate to a valid finite number." });
                    }

                    toolInfoLine("CalcTool", "Calculator tool finished");
                    const durationMs = (performance.now() - startTime).toFixed(2);
                    toolTimeLine("CalcTool", `Execution time: ${durationMs}ms`);

                    return JSON.stringify({ expression: sanitized, result });
                } catch (error: any) {
                    toolErrorLine("CalcTool", "Failed to calculate:", error.message);
                    const durationMs = (performance.now() - startTime).toFixed(2);
                    toolTimeLine("CalcTool", `Execution time: ${durationMs}ms`);
                    return JSON.stringify({ error: `Failed to calculate: ${error.message}` });
                }
            },
            {
                name: "calculator",
                description: "Evaluates standard arithmetic expressions (addition, subtraction, multiplication, division, parentheses). Use this tool for singular calculations. Use the ArrayCalcTool when doing larger calculations.",
                schema: z.object({
                    expression: z.string().describe("The mathematical expression to evaluate, e.g. '(145 * 12) / 3'."),
                }),
            }
        );
    }
}