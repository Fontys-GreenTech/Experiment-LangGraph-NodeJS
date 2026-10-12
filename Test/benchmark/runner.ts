import { GraphApp } from "../../Core/src/GraphApp.ts";
import { MockLLMFactory } from "./mockLlm.ts";
import {
    BenchmarkRunner,
    type BenchmarkResult,
    type OverheadBenchmarkResult,
    type TokenBenchmarkResult,
    type MemoryBenchmarkResult,
    type ThroughputResult,
} from "./benchmarkUtils.ts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { fakeModel } from "@langchain/core/testing";
import { setLoggingEnabled } from "../../Core/src/logger.ts";
import { ReadCsvTool } from "../../Core/src/tools/ReadCsvTool.ts";
import { CalculatorTool } from "../../Core/src/tools/CalculatorTool.ts";
import { ArrayCalcTool } from "../../Core/src/tools/ArrayCalcTool.ts";
import { MarkdownToPdf } from "../../Core/src/tools/MarkdownToPdf.ts";

export interface FullBenchmarkSuiteResult {
    executionTime: BenchmarkResult[];
    frameworkOverhead: OverheadBenchmarkResult[];
    tokenUsage: TokenBenchmarkResult[];
    memoryUsage: MemoryBenchmarkResult[];
    throughputLoadTest: ThroughputResult[];
}

export async function runAllBenchmarks(): Promise<FullBenchmarkSuiteResult> {
    setLoggingEnabled(false);
    console.log("===============================================================================");
    console.log("             LangGraph Node.js Full Benchmark & Evaluation Suite              ");
    console.log("===============================================================================\n");

    const mockTransactionCsvData = `transaction_id,date,customer_name,product_category,item_description,quantity,unit_price,total_revenue,cost_of_goods,net_earnings
TXN-1001,2026-09-01,Alice Smith,Electronics,Wireless Mouse,2,25.00,50.00,20.00,30.00
TXN-1002,2026-09-01,Bob Jones,Office Supplies,Ergonomic Chair,1,180.00,180.00,90.00,90.00
TXN-1003,2026-09-02,Charlie Brown,Electronics,USB-C Hub,3,35.00,105.00,45.00,60.00
TXN-1004,2026-09-02,Diana Prince,Apparel,Branded Hoodie,1,45.00,45.00,15.00,30.00
TXN-1005,2026-09-03,Evan Wright,Office Supplies,Notebook Pack (5pk),4,12.00,48.00,16.00,32.00`;
    const mockCsvTool = ReadCsvTool.mockTool(mockTransactionCsvData);
    const mockPdfTool = MarkdownToPdf.mockTool();

    // =========================================================================
    // 1. EXECUTIE TIJD (Execution Time)
    // =========================================================================
    console.log(">>> [1/5] Running Category: Executie tijd (Execution Time Benchmarks)...");
    const executionResults: BenchmarkResult[] = [];

    // 1.1 Direct Invocation (Mock LLM)
    console.log("  - Direct Graph Invocation (Mock LLM - No Tools)...");
    const directMock = MockLLMFactory.createSimpleTextMock(["Direct mock response"]);
    const directApp = new GraphApp(directMock);
    executionResults.push(
        await BenchmarkRunner.run(
            "Direct Graph Invocation (Mock LLM)",
            async () => {
                await directApp.invoke([new HumanMessage("Hello LangGraph!")]);
            },
            { iterations: 60, warmup: 5 }
        )
    );

    // 1.2 End-to-End Pipeline (Real LLM - Gemini: CSV -> Analysis -> PDF)
    console.log("  - End-to-End Pipeline (Real LLM - Gemini: CSV -> Analysis -> PDF)...");
    const realApp = new GraphApp(undefined, [mockCsvTool, CalculatorTool.tool(), ArrayCalcTool.tool(), mockPdfTool]);
    executionResults.push(
        await BenchmarkRunner.run(
            "End-to-End Pipeline (Real LLM - Gemini: CSV -> Analysis -> PDF)",
            async () => {
                await realApp.invoke([
                    new HumanMessage(
                        "Read the transaction records from './data.csv', analyze the financial performance by calculating the total revenue and total net earnings, and create a markdown summary report converted to PDF using the markdown_to_pdf tool."
                    ),
                ]);
            },
            { iterations: 3, warmup: 1 }
        )
    );

    // 1.3 CalculatorTool
    console.log("  - Single Tool: CalculatorTool...");
    executionResults.push(
        await BenchmarkRunner.run(
            "Single Tool (CalculatorTool)",
            async () => {
                const model = MockLLMFactory.createToolCallingMock(
                    [{ name: "calculator", args: { expression: "(45 * 12) + 180 / 4" } }],
                    "The calculation is complete."
                );
                const app = new GraphApp(model);
                await app.invoke([new HumanMessage("Calculate (45 * 12) + 180 / 4")]);
            },
            { iterations: 40, warmup: 5 }
        )
    );

    // 1.4 ArrayCalcTool Standard
    console.log("  - ArrayCalcTool (Standard)...");
    executionResults.push(
        await BenchmarkRunner.run(
            "ArrayCalcTool (Standard)",
            async () => {
                const model = MockLLMFactory.createToolCallingMock(
                    [{
                        name: "array_calculator",
                        args: {
                            a: [12.5, 45.2, 88.1, 104.0, 32.7, 56.9, 78.3, 91.2, 14.6, 63.8],
                            b: [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0],
                            operation: "multiply",
                        },
                    }],
                    "The multiplication is calculated."
                );
                const app = new GraphApp(model);
                await app.invoke([new HumanMessage("Multiply the two arrays.")]);
            },
            { iterations: 40, warmup: 5 }
        )
    );

    // 1.5 ArrayCalcTool Heavy
    console.log("  - ArrayCalcTool (Heavy 5,000 items)...");
    const largeDatasetA = Array.from({ length: 5000 }, (_, i) => (i * 1.5) % 100);
    const largeDatasetB = Array.from({ length: 5000 }, (_, i) => (i * 2.5) % 100);
    executionResults.push(
        await BenchmarkRunner.run(
            "ArrayCalcTool (Heavy 5k items: sum)",
            async () => {
                const model = MockLLMFactory.createToolCallingMock(
                    [{
                        name: "array_calculator",
                        args: {
                            a: largeDatasetA,
                            b: largeDatasetB,
                            operation: "sum",
                        },
                    }],
                    "The sum is calculated."
                );
                const app = new GraphApp(model);
                await app.invoke([new HumanMessage("Calculate sum for large arrays.")]);
            },
            { iterations: 25, warmup: 3 }
        )
    );

    // 1.6 ReadCsvTool (Mocked Disk I/O)
    console.log("  - ReadCsvTool (Mocked Disk I/O)...");
    executionResults.push(
        await BenchmarkRunner.run(
            "ReadCsvTool (Mocked Disk I/O)",
            async () => {
                const model = MockLLMFactory.createToolCallingMock(
                    [{ name: "read_csv_file", args: { filePath: "./data.csv" } }],
                    "CSV data loaded."
                );
                const app = new GraphApp(model, [mockCsvTool, CalculatorTool.tool(), ArrayCalcTool.tool(), mockPdfTool]);
                await app.invoke([new HumanMessage("Read ./data.csv")]);
            },
            { iterations: 30, warmup: 5 }
        )
    );

    // 1.7 MarkdownToPdf Tool
    console.log("  - MarkdownToPdf Tool (Mocked Writer)...");
    executionResults.push(
        await BenchmarkRunner.run(
            "Single Tool (MarkdownToPdf)",
            async () => {
                const model = MockLLMFactory.createToolCallingMock(
                    [{
                        name: "markdown_to_pdf",
                        args: {
                            markdownContent: "# Sales Report\nTotal Revenue: $25000\nTotal Net: $12000",
                            outputFileName: "benchmark_report",
                        },
                    }],
                    "PDF report generated."
                );
                const app = new GraphApp(model, [mockCsvTool, CalculatorTool.tool(), ArrayCalcTool.tool(), mockPdfTool]);
                await app.invoke([new HumanMessage("Generate PDF report")]);
            },
            { iterations: 30, warmup: 5 }
        )
    );

    // 1.8 Multi-Step Pipeline (CSV -> ArrayCalc -> Calculator -> MarkdownToPdf)
    console.log("  - Multi-Step Pipeline (4 hops: CSV -> ArrayCalc -> Calc -> PDF)...");
    executionResults.push(
        await BenchmarkRunner.run(
            "Multi-Step Pipeline (4 hops)",
            async () => {
                const model = fakeModel()
                    .respondWithTools([{ name: "read_csv_file", args: { filePath: "./data.csv" } }])
                    .respondWithTools([{
                        name: "array_calculator",
                        args: { a: [100, 200, 300, 400], b: [10, 20, 30, 40], operation: "sum" },
                    }])
                    .respondWithTools([{
                        name: "calculator",
                        args: { expression: "1000 * 1.21" },
                    }])
                    .respondWithTools([{
                        name: "markdown_to_pdf",
                        args: {
                            markdownContent: "# Financial Summary\nTotal calculated: 1210",
                            outputFileName: "financial_summary",
                        },
                    }])
                    .respond(new AIMessage("Completed end-to-end data processing and PDF generation."));

                const app = new GraphApp(model, [mockCsvTool, CalculatorTool.tool(), ArrayCalcTool.tool(), mockPdfTool]);
                await app.invoke([new HumanMessage("Process CSV data, calculate totals and create PDF report.")]);
            },
            { iterations: 20, warmup: 3 }
        )
    );

    console.log("\n--- [1] EXECUTIE TIJD RESULTATEN ---");
    BenchmarkRunner.formatResults(executionResults);

    // =========================================================================
    // 2. FRAMEWORK OVERHEAD (Constant Latency Mock LLM)
    // =========================================================================
    console.log("\n>>> [2/5] Running Category: Framework Overhead (Constant Latency Mock)...");
    const overheadResults: OverheadBenchmarkResult[] = [];
    const constantLatencyMs = 20;

    // 2.1 Direct invocation overhead
    console.log(`  - Direct Invocation Overhead (LLM Latency = ${constantLatencyMs}ms)...`);
    const directLatencyStats = { callCount: 0, totalLlmLatencyMs: 0 };
    const directLatencyModel = MockLLMFactory.createConstantLatencyMock(
        constantLatencyMs,
        ["Overhead direct response"],
        directLatencyStats
    );
    const directLatencyApp = new GraphApp(directLatencyModel);
    overheadResults.push(
        await BenchmarkRunner.runOverheadBenchmark(
            `Direct Invocation (${constantLatencyMs}ms Mock LLM)`,
            async () => {
                await directLatencyApp.invoke([new HumanMessage("Check overhead")]);
            },
            () => directLatencyStats,
            { iterations: 25, warmup: 3 }
        )
    );

    // 2.2 Tool calling workflow overhead (2 LLM steps)
    console.log(`  - Tool Calling Overhead (2 LLM calls, ${constantLatencyMs}ms each)...`);
    const toolLatencyStats = { callCount: 0, totalLlmLatencyMs: 0 };
    const toolLatencyModel = MockLLMFactory.createConstantLatencyToolMock(
        constantLatencyMs,
        [{ name: "calculator", args: { expression: "15 * 8" } }],
        "Calculation complete: 120",
        toolLatencyStats
    );
    const toolLatencyApp = new GraphApp(toolLatencyModel);
    overheadResults.push(
        await BenchmarkRunner.runOverheadBenchmark(
            `Tool Calling Workflow (${constantLatencyMs}ms Mock LLM)`,
            async () => {
                await toolLatencyApp.invoke([new HumanMessage("Calculate 15 * 8")]);
            },
            () => toolLatencyStats,
            { iterations: 25, warmup: 3 }
        )
    );

    console.log("\n--- [2] FRAMEWORK OVERHEAD RESULTATEN ---");
    BenchmarkRunner.formatOverheadResults(overheadResults);

    // =========================================================================
    // 3. TOKENVERBRUIK (Token Usage Across Tests)
    // =========================================================================
    console.log("\n>>> [3/5] Running Category: Tokenverbruik (Token Usage Comparison)...");
    const tokenResults: TokenBenchmarkResult[] = [];

    // 3.1 Direct query token usage
    tokenResults.push(
        await BenchmarkRunner.runTokenBenchmark(
            "Direct Graph Query",
            async () => {
                const model = MockLLMFactory.createSimpleTextMock(["This is a concise direct AI answer."]);
                const app = new GraphApp(model);
                return app.invoke([new HumanMessage("Explain the purpose of LangGraph in one sentence.")]);
            },
            10
        )
    );

    // 3.2 Calculator Tool token usage
    tokenResults.push(
        await BenchmarkRunner.runTokenBenchmark(
            "Calculator Tool Query",
            async () => {
                const model = MockLLMFactory.createToolCallingMock(
                    [{ name: "calculator", args: { expression: "Math.sqrt(144) + Math.pow(3, 4)" } }],
                    "The computed mathematical result is 93."
                );
                const app = new GraphApp(model);
                return app.invoke([new HumanMessage("Calculate the square root of 144 plus 3 to the 4th power.")]);
            },
            10
        )
    );

    // 3.3 ArrayCalcTool token usage
    tokenResults.push(
        await BenchmarkRunner.runTokenBenchmark(
            "ArrayCalc Tool Query",
            async () => {
                const model = MockLLMFactory.createToolCallingMock(
                    [{
                        name: "array_calculator",
                        args: { a: [10, 25, 50, 75], b: [2, 5, 10, 15], operation: "multiply" },
                    }],
                    "Array element-wise multiplication completed."
                );
                const app = new GraphApp(model);
                return app.invoke([new HumanMessage("Multiply the arrays [10, 25, 50, 75] and [2, 5, 10, 15].")]);
            },
            10
        )
    );

    // 3.4 ReadCsvTool token usage (Mocked Disk I/O)
    tokenResults.push(
        await BenchmarkRunner.runTokenBenchmark(
            "ReadCsv Tool Query",
            async () => {
                const model = MockLLMFactory.createToolCallingMock(
                    [{ name: "read_csv_file", args: { filePath: "./data.csv" } }],
                    "Parsed CSV dataset with rows."
                );
                const app = new GraphApp(model, [mockCsvTool, CalculatorTool.tool(), ArrayCalcTool.tool(), mockPdfTool]);
                return app.invoke([new HumanMessage("Load and parse the CSV dataset from ./data.csv.")]);
            },
            10
        )
    );

    // 3.5 MarkdownToPdf Tool token usage
    tokenResults.push(
        await BenchmarkRunner.runTokenBenchmark(
            "MarkdownToPdf Tool Query",
            async () => {
                const model = MockLLMFactory.createToolCallingMock(
                    [{
                        name: "markdown_to_pdf",
                        args: {
                            markdownContent: "# Report\nSummary data table.",
                            outputFileName: "summary",
                        },
                    }],
                    "Converted markdown to PDF file."
                );
                const app = new GraphApp(model, [mockCsvTool, CalculatorTool.tool(), ArrayCalcTool.tool(), mockPdfTool]);
                return app.invoke([new HumanMessage("Convert summary report to PDF document.")]);
            },
            10
        )
    );

    // 3.6 Multi-step Workflow token usage
    tokenResults.push(
        await BenchmarkRunner.runTokenBenchmark(
            "Multi-Step 4-Hop Workflow",
            async () => {
                const model = fakeModel()
                    .respondWithTools([{ name: "read_csv_file", args: { filePath: "./data.csv" } }])
                    .respondWithTools([{
                        name: "array_calculator",
                        args: { a: [100, 200, 300], b: [1, 2, 3], operation: "sum" },
                    }])
                    .respondWithTools([{
                        name: "markdown_to_pdf",
                        args: {
                            markdownContent: "# Summary Report\nTotal amount: 606",
                            outputFileName: "summary_final",
                        },
                    }])
                    .respond(new AIMessage("Completed data loading, calculation, and PDF generation."));
                const app = new GraphApp(model, [mockCsvTool, CalculatorTool.tool(), ArrayCalcTool.tool(), mockPdfTool]);
                return app.invoke([new HumanMessage("Read data.csv, sum with [1,2,3], and generate PDF report.")]);
            },
            10
        )
    );

    // Calculate grand average
    const totalPromptAll = tokenResults.reduce((acc, t) => acc + t.avgPromptTokens, 0) / tokenResults.length;
    const totalCompletionAll = tokenResults.reduce((acc, t) => acc + t.avgCompletionTokens, 0) / tokenResults.length;
    const totalTokensAll = tokenResults.reduce((acc, t) => acc + t.avgTotalTokens, 0) / tokenResults.length;

    console.log("\n--- [3] TOKENVERBRUIK RESULTATEN ---");
    BenchmarkRunner.formatTokenResults(tokenResults);
    console.log(`>>> Gemiddeld Tokenverbruik over alle tests: Prompt: ${totalPromptAll.toFixed(1)}, Completion: ${totalCompletionAll.toFixed(1)}, Totaal: ${totalTokensAll.toFixed(1)} tokens\n`);

    // =========================================================================
    // 4. GEHEUGENVERBRUIK (Memory Consumption with Different Kinds of Loads)
    // =========================================================================
    console.log(">>> [4/5] Running Category: Geheugenverbruik (Memory Usage under Different Kinds of Loads)...");
    const memoryResults: MemoryBenchmarkResult[] = [];

    // 4.1 Light Load (Direct Graph Invocation - Baseline)
    console.log("  - [Load 1: Light / Baseline] Direct Graph Invocation...");
    memoryResults.push(
        await BenchmarkRunner.runMemoryBenchmark(
            "1. Light Load (Direct Invocation Baseline)",
            async () => {
                const model = MockLLMFactory.createSimpleTextMock(["Static baseline memory response"]);
                const app = new GraphApp(model);
                await app.invoke([new HumanMessage("Memory baseline prompt")]);
            },
            { iterations: 40, warmup: 5 }
        )
    );

    // 4.2 Standard Tool Load (CalculatorTool)
    console.log("  - [Load 2: Standard Tool] Calculator Tool Invocation...");
    memoryResults.push(
        await BenchmarkRunner.runMemoryBenchmark(
            "2. Standard Tool Load (Calculator)",
            async () => {
                const model = MockLLMFactory.createToolCallingMock(
                    [{ name: "calculator", args: { expression: "999 * 888 + 12345" } }],
                    "Result: 899457"
                );
                const app = new GraphApp(model);
                await app.invoke([new HumanMessage("Calculate 999 * 888 + 12345")]);
            },
            { iterations: 40, warmup: 5 }
        )
    );

    // 4.3 Heavy Data Payload Load (ArrayCalcTool with 10,000 array elements)
    console.log("  - [Load 3: Heavy Data Payload] ArrayCalcTool (10,000 elements)...");
    const largeMemoryArrayA = Array.from({ length: 10000 }, (_, i) => (i * 1.25) % 100);
    const largeMemoryArrayB = Array.from({ length: 10000 }, (_, i) => (i * 2.75) % 100);
    memoryResults.push(
        await BenchmarkRunner.runMemoryBenchmark(
            "3. Heavy Payload Load (ArrayCalc 10k items)",
            async () => {
                const model = MockLLMFactory.createToolCallingMock(
                    [{
                        name: "array_calculator",
                        args: { a: largeMemoryArrayA, b: largeMemoryArrayB, operation: "sum" },
                    }],
                    "Summed 10,000 array elements."
                );
                const app = new GraphApp(model);
                await app.invoke([new HumanMessage("Sum two 10k arrays")]);
            },
            { iterations: 30, warmup: 3 }
        )
    );

    // 4.4 Large Context & Deep History Load (50 conversation turns + large prompt)
    console.log("  - [Load 4: Large Context / Deep History] 50-Message History...");
    const deepHistoryMessages = Array.from({ length: 50 }, (_, i) => {
        return i % 2 === 0
            ? new HumanMessage(`Message #${i}: This is simulated user query context containing repetitive prompt tokens to fill graph state memory.`)
            : new AIMessage(`Message #${i}: This is simulated assistant response context maintaining state throughout conversation turns.`);
    });
    memoryResults.push(
        await BenchmarkRunner.runMemoryBenchmark(
            "4. Large Context Load (50-Message History)",
            async () => {
                const model = MockLLMFactory.createSimpleTextMock(["Contextual memory response acknowledging 50 previous messages."]);
                const app = new GraphApp(model);
                await app.invoke(deepHistoryMessages);
            },
            { iterations: 30, warmup: 3 }
        )
    );

    // 4.5 CSV Processing Load (ReadCsvTool - Mocked Disk I/O)
    console.log("  - [Load 5: CSV Parsing & Data Processing] ReadCsvTool (Mocked Disk I/O)...");
    memoryResults.push(
        await BenchmarkRunner.runMemoryBenchmark(
            "5. CSV Processing Load (Mocked Disk I/O)",
            async () => {
                const model = MockLLMFactory.createToolCallingMock(
                    [{ name: "read_csv_file", args: { filePath: "./data.csv" } }],
                    "Parsed CSV dataset"
                );
                const app = new GraphApp(model, [mockCsvTool, CalculatorTool.tool(), ArrayCalcTool.tool(), mockPdfTool]);
                await app.invoke([new HumanMessage("Read CSV dataset from disk")]);
            },
            { iterations: 30, warmup: 3 }
        )
    );

    // 4.6 Concurrent Batch Burst Load (20 parallel requests per iteration)
    console.log("  - [Load 6: Concurrent Burst Load] 20 Parallel Invocations per Iteration...");
    memoryResults.push(
        await BenchmarkRunner.runMemoryBenchmark(
            "6. Concurrent Burst Load (20 Parallel Invocations)",
            async () => {
                const model = MockLLMFactory.createSimpleTextMock(["Concurrent response"]);
                const app = new GraphApp(model);
                await Promise.all(
                    Array.from({ length: 20 }, (_, idx) =>
                        app.invoke([new HumanMessage(`Parallel concurrent task #${idx}`)])
                    )
                );
            },
            { iterations: 20, warmup: 2 }
        )
    );

    console.log("\n--- [4] GEHEUGENVERBRUIK RESULTATEN (VERSCHILLENDE LOADS) ---");
    BenchmarkRunner.formatMemoryResults(memoryResults);

    // =========================================================================
    // 5. THROUGHPUT (Load Tests with Ramping Concurrency)
    // =========================================================================
    console.log("\n>>> [5/5] Running Category: Throughput (Load Test met Oplopende Concurrency)...");
    const concurrencyLevels = [1, 5, 10, 25, 50];
    const throughputResults = await BenchmarkRunner.runLoadTest(
        "Ramping Concurrency Load Test",
        async (reqId: number) => {
            const model = MockLLMFactory.createToolCallingMock(
                [{ name: "calculator", args: { expression: `${reqId} * 2 + 10` } }],
                `Load test response for req ${reqId}`
            );
            const app = new GraphApp(model);
            return app.invoke([new HumanMessage(`Request ${reqId}`)]);
        },
        concurrencyLevels,
        50
    );

    console.log("\n--- [5] THROUGHPUT & LOAD TEST RESULTATEN ---");
    BenchmarkRunner.formatLoadTestResults(throughputResults);

    const maxRps = Math.max(...throughputResults.map((r) => r.throughputRps));
    const maxRpsResult = throughputResults.find((r) => r.throughputRps === maxRps);
    console.log(`>>> Maximale Throughput: ${maxRps.toFixed(2)} requests/sec (bij Concurrency ${maxRpsResult?.concurrency}, p50 latency: ${maxRpsResult?.p50LatencyMs}ms, p95 latency: ${maxRpsResult?.p95LatencyMs}ms)\n`);

    console.log("===============================================================================");
    console.log("                     BENCHMARK SUITE COMPLETED SUCCESSFULLY                    ");
    console.log("===============================================================================\n");

    setLoggingEnabled(true);
    return {
        executionTime: executionResults,
        frameworkOverhead: overheadResults,
        tokenUsage: tokenResults,
        memoryUsage: memoryResults,
        throughputLoadTest: throughputResults,
    };
}

// Auto-run if executed directly
if (process.argv[1] && process.argv[1].endsWith("runner.ts")) {
    runAllBenchmarks().catch((err) => {
        console.error("Benchmark failed:", err);
        process.exit(1);
    });
}
