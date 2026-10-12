import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { toolInfoLine, toolErrorLine, toolTimeLine } from "../logger.ts";

export class ArrayCalcTool {
    public static sum(a: number[], b: number[]): number[] {
        if (!Array.isArray(a) || !Array.isArray(b)) {
            throw new Error("Inputs 'a' and 'b' must be arrays.");
        }
        const length = Math.min(a.length, b.length);
        const c: number[] = new Array(length);
        for (let i = 0; i < length; i++) {
            if (typeof a[i] !== "number" || typeof b[i] !== "number" || !Number.isFinite(a[i]) || !Number.isFinite(b[i])) {
                throw new Error(`Both arrays must contain valid finite numbers at index ${i}.`);
            }
            c[i] = a[i] + b[i];
        }
        return c;
    }

    public static add(a: number[], b: number[]): number[] {
        return this.sum(a, b);
    }

    public static subtract(a: number[], b: number[]): number[] {
        if (!Array.isArray(a) || !Array.isArray(b)) {
            throw new Error("Inputs 'a' and 'b' must be arrays.");
        }
        const length = Math.min(a.length, b.length);
        const c: number[] = new Array(length);
        for (let i = 0; i < length; i++) {
            if (typeof a[i] !== "number" || typeof b[i] !== "number" || !Number.isFinite(a[i]) || !Number.isFinite(b[i])) {
                throw new Error(`Both arrays must contain valid finite numbers at index ${i}.`);
            }
            c[i] = a[i] - b[i];
        }
        return c;
    }

    public static sub(a: number[], b: number[]): number[] {
        return this.subtract(a, b);
    }

    public static multiply(a: number[], b: number[]): number[] {
        if (!Array.isArray(a) || !Array.isArray(b)) {
            throw new Error("Inputs 'a' and 'b' must be arrays.");
        }
        const length = Math.min(a.length, b.length);
        const c: number[] = new Array(length);
        for (let i = 0; i < length; i++) {
            if (typeof a[i] !== "number" || typeof b[i] !== "number" || !Number.isFinite(a[i]) || !Number.isFinite(b[i])) {
                throw new Error(`Both arrays must contain valid finite numbers at index ${i}.`);
            }
            c[i] = a[i] * b[i];
        }
        return c;
    }

    public static mul(a: number[], b: number[]): number[] {
        return this.multiply(a, b);
    }

    public static divide(a: number[], b: number[]): number[] {
        if (!Array.isArray(a) || !Array.isArray(b)) {
            throw new Error("Inputs 'a' and 'b' must be arrays.");
        }
        const length = Math.min(a.length, b.length);
        const c: number[] = new Array(length);
        for (let i = 0; i < length; i++) {
            if (typeof a[i] !== "number" || typeof b[i] !== "number" || !Number.isFinite(a[i]) || !Number.isFinite(b[i])) {
                throw new Error(`Both arrays must contain valid finite numbers at index ${i}.`);
            }
            if (b[i] === 0) {
                throw new Error(`Division by zero is not allowed at index ${i}.`);
            }
            c[i] = a[i] / b[i];
        }
        return c;
    }

    public static devide(a: number[], b: number[]): number[] {
        return this.divide(a, b);
    }

    public static div(a: number[], b: number[]): number[] {
        return this.divide(a, b);
    }

    public static tool() {
        return tool(
            async ({ a, b, operation = "sum" }) => {
                const startTime = performance.now();
                try {
                    toolInfoLine("ArrayCalcTool", "Running Array Calc Tool");
                    toolInfoLine("ArrayCalcTool", `Operation: ${operation}, a: ${JSON.stringify(a)}, b: ${JSON.stringify(b)}`);

                    if (!Array.isArray(a) || !Array.isArray(b)) {
                        toolErrorLine("ArrayCalcTool", "Inputs 'a' and 'b' must be arrays.");
                        const durationMs = (performance.now() - startTime).toFixed(2);
                        toolTimeLine("ArrayCalcTool", `Execution time: ${durationMs}ms`);
                        return JSON.stringify({ error: "Inputs 'a' and 'b' must be arrays." });
                    }

                    const normalizedOp = operation ? operation.trim().toLowerCase() : "sum";
                    let c: number[];

                    if (normalizedOp === "sum" || normalizedOp === "add" || normalizedOp === "+") {
                        c = ArrayCalcTool.sum(a, b);
                    } else if (normalizedOp === "subtract" || normalizedOp === "sub" || normalizedOp === "-") {
                        c = ArrayCalcTool.subtract(a, b);
                    } else if (normalizedOp === "multiply" || normalizedOp === "mul" || normalizedOp === "mult" || normalizedOp === "*") {
                        c = ArrayCalcTool.multiply(a, b);
                    } else if (normalizedOp === "divide" || normalizedOp === "devide" || normalizedOp === "div" || normalizedOp === "/") {
                        c = ArrayCalcTool.divide(a, b);
                    } else {
                        toolErrorLine("ArrayCalcTool", `Unsupported operation: ${operation}`);
                        const durationMs = (performance.now() - startTime).toFixed(2);
                        toolTimeLine("ArrayCalcTool", `Execution time: ${durationMs}ms`);
                        return JSON.stringify({ error: `Unsupported operation: ${operation}. Supported operations are 'sum', 'subtract', 'multiply', and 'divide'.` });
                    }

                    toolInfoLine("ArrayCalcTool", "Calculator tool result: %o", c);
                    toolInfoLine("ArrayCalcTool", "Calculator tool finished");
                    const durationMs = (performance.now() - startTime).toFixed(2);
                    toolTimeLine("ArrayCalcTool", `Execution time: ${durationMs}ms`);

                    return JSON.stringify({
                        operation: normalizedOp,
                        a,
                        b,
                        c,
                        result: c,
                    });
                } catch (error: any) {
                    toolErrorLine("ArrayCalcTool", "Failed to calculate:", error.message);
                    const durationMs = (performance.now() - startTime).toFixed(2);
                    toolTimeLine("ArrayCalcTool", `Execution time: ${durationMs}ms`);
                    return JSON.stringify({ error: `Failed to calculate: ${error.message}` });
                }
            },
            {
                name: "array_calculator",
                description: "Calculates the element-wise sum, subtraction, multiplication, or division of array a and array b into array c. Use this tool when needing to do a lot of calculations of the same kind. Use the CalcTool for singular calculations.",
                schema: z.object({
                    a: z.array(z.number()).describe("The first array of numbers."),
                    b: z.array(z.number()).describe("The second array of numbers."),
                    operation: z.string().optional().default("sum").describe("The calculation operation to perform: 'sum', 'subtract', 'multiply', or 'divide' (or 'devide'). Defaults to 'sum'."),
                }),
            }
        );
    }
}

export const arrayCalcTool = ArrayCalcTool.tool();