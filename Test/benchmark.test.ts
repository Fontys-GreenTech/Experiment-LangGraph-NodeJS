import { describe, it } from "node:test";
import assert from "node:assert";
import { GraphApp } from "../Core/src/GraphApp.ts";
import { MockLLMFactory } from "./benchmark/mockLlm.ts";
import {
    BenchmarkRunner,
    type BenchmarkResult,
    type OverheadBenchmarkResult,
    type TokenBenchmarkResult,
    type MemoryBenchmarkResult,
    type ThroughputResult
} from "./benchmark/benchmarkUtils.ts";
import { TokenTracker } from "./benchmark/tokenTracker.ts";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { fakeModel } from "@langchain/core/testing";
import { ReadCsvTool } from "../Core/src/tools/ReadCsvTool.ts";
import { CalculatorTool } from "../Core/src/tools/CalculatorTool.ts";
import { ArrayCalcTool } from "../Core/src/tools/ArrayCalcTool.ts";
import { MarkdownToPdf } from "../Core/src/tools/MarkdownToPdf.ts";

describe("LangGraph Benchmark & Evaluation Suite", () => {
    // Metric accumulators across test suites
    const executionResults: BenchmarkResult[] = [];
    const overheadResults: OverheadBenchmarkResult[] = [];
    const tokenResults: TokenBenchmarkResult[] = [];
    const memoryResults: MemoryBenchmarkResult[] = [];
    const throughputResults: ThroughputResult[] = [];

    let hasLoggedSummary = false;
    process.once("beforeExit", () => {
        if (hasLoggedSummary) return;
        hasLoggedSummary = true;

        console.log("\n================================================================================");
        console.log("       LANGGRAPH BENCHMARK TEST SUITE: COMPLETE AGGREGATED METRICS SUMMARY      ");
        console.log("================================================================================\n");

        if (executionResults.length > 0) {
            console.log("--- [1] Execution Time Metrics ---");
            BenchmarkRunner.formatResults(executionResults);
            console.log();
        }

        if (overheadResults.length > 0) {
            console.log("--- [2] Framework Overhead Metrics ---");
            BenchmarkRunner.formatOverheadResults(overheadResults);
            console.log();
        }

        if (tokenResults.length > 0) {
            console.log("--- [3] Token Consumption Metrics ---");
            BenchmarkRunner.formatTokenResults(tokenResults);
            console.log();
        }

        if (memoryResults.length > 0) {
            console.log("--- [4] Memory Consumption Across Load Types ---");
            BenchmarkRunner.formatMemoryResults(memoryResults);
            console.log();
        }

        if (throughputResults.length > 0) {
            console.log("--- [5] Throughput & Concurrency Load Metrics ---");
            BenchmarkRunner.formatLoadTestResults(throughputResults);
            console.log();
        }

        console.log("================================================================================\n");
    });
    describe("Mock LLM Integration & Graph State Validation", () => {
        it("should execute direct graph invocation without tools using Mock LLM", async () => {
            const expectedText = "Direct mock test response";
            const mockModel = MockLLMFactory.createSimpleTextMock([expectedText]);
            const app = new GraphApp(0, mockModel);

            const result = await app.invoke([new HumanMessage("Hello")]);

            assert.ok(result.messages);
            assert.strictEqual(result.messages.length, 2);
            assert.strictEqual(result.messages[1].content, expectedText);
        });

        it("should execute CalculatorTool via Mock LLM and produce valid arithmetic result", async () => {
            const mockModel = MockLLMFactory.createToolCallingMock(
                [{ name: "calculator", args: { expression: "(25 * 4) + 50" } }],
                "Calculation completed: 150"
            );
            const app = new GraphApp(0, mockModel);

            const result = await app.invoke([new HumanMessage("Calculate (25 * 4) + 50")]);

            assert.strictEqual(result.messages.length, 4);
            const toolMsg = result.messages.find(
                (m: any) => m instanceof ToolMessage || m._getType?.() === "tool" || m.name === "calculator"
            );
            assert.ok(toolMsg, "ToolMessage should exist in message history");
            const parsedOutput = JSON.parse(toolMsg.content as string);
            assert.strictEqual(parsedOutput.result, 150);
            assert.strictEqual(result.messages[result.messages.length - 1].content, "Calculation completed: 150");
        });

        it("should execute ArrayCalcTool via Mock LLM and compute statistics", async () => {
            const mockModel = MockLLMFactory.createToolCallingMock(
                [{
                    name: "array_calculator",
                    args: {
                        a: [10, 20, 30, 40, 50],
                        b: [1, 2, 3, 4, 5],
                        operation: "multiply",
                    },
                }],
                "Multiplication complete."
            );
            const app = new GraphApp(0, mockModel);

            const result = await app.invoke([new HumanMessage("Multiply arrays")]);

            assert.strictEqual(result.messages.length, 4);
            const toolMsg = result.messages.find((m: any) => m instanceof ToolMessage || m.name === "array_calculator");
            assert.ok(toolMsg, "ToolMessage should exist");
            const parsedOutput = JSON.parse(toolMsg.content as string);
            assert.deepStrictEqual(parsedOutput.result, [10, 40, 90, 160, 250]);
            assert.strictEqual(parsedOutput.operation, "multiply");
        });

        it("should execute ReadCsvTool via Mock LLM and load CSV rows without disk I/O dependency", async () => {
            const mockCsvTool = ReadCsvTool.mockTool("id,name,value\n1,Alpha,100\n2,Beta,200\n3,Gamma,300");
            const mockModel = MockLLMFactory.createToolCallingMock(
                [{ name: "read_csv_file", args: { filePath: "./data.csv" } }],
                "CSV loaded."
            );
            const app = new GraphApp(0, mockModel, [mockCsvTool, CalculatorTool.tool(), ArrayCalcTool.tool()]);

            const result = await app.invoke([new HumanMessage("Read data.csv")]);

            assert.strictEqual(result.messages.length, 4);
            const toolMsg = result.messages.find((m: any) => m instanceof ToolMessage || m.name === "read_csv_file");
            assert.ok(toolMsg, "ToolMessage should exist");
            const parsedOutput = JSON.parse(toolMsg.content as string);
            assert.ok(Array.isArray(parsedOutput));
            assert.strictEqual(parsedOutput.length, 3);
            assert.deepStrictEqual(parsedOutput[0], { id: "1", name: "Alpha", value: "100" });
        });

        it("should execute MarkdownToPdf tool standalone and via mockTool", async () => {
            const mockPdfTool = MarkdownToPdf.mockTool();
            const output = await (mockPdfTool as any).invoke({
                markdownContent: "# Sales Report\nTotal Revenue: $5000",
                outputFileName: "test_report",
            });

            const parsed = JSON.parse(output);
            assert.strictEqual(parsed.success, true);
            assert.strictEqual(parsed.message, "Markdown converted to PDF.");
            assert.ok(parsed.savedTextPath.includes("test_report.txt"));
            assert.ok(parsed.pdfFilePath.includes("test_report.pdf"));
        });

        it("should handle MarkdownToPdf custom writer and writer error gracefully", async () => {
            let writtenPath = "";
            let writtenContent = "";
            const customTool = MarkdownToPdf.tool(async (p, c) => {
                writtenPath = p;
                writtenContent = c;
            });

            const res = await (customTool as any).invoke({
                markdownContent: "## Test content",
                outputFileName: "custom_doc",
            });
            const parsedRes = JSON.parse(res);
            assert.strictEqual(parsedRes.success, true);
            assert.ok(writtenPath.includes("custom_doc.txt"));
            assert.strictEqual(writtenContent, "## Test content");

            const failingTool = MarkdownToPdf.tool(async () => {
                throw new Error("Disk write error");
            });
            const failRes = await (failingTool as any).invoke({
                markdownContent: "## Fail content",
            });
            const parsedFail = JSON.parse(failRes);
            assert.strictEqual(parsedFail.success, false);
            assert.ok(parsedFail.error.includes("Disk write error"));
        });

        it("should execute MarkdownToPdf via Mock LLM in graph", async () => {
            const mockPdfTool = MarkdownToPdf.mockTool();
            const mockModel = MockLLMFactory.createToolCallingMock(
                [{
                    name: "markdown_to_pdf",
                    args: {
                        markdownContent: "# Report\nSummary data",
                        outputFileName: "summary_report",
                    },
                }],
                "PDF report generated."
            );
            const app = new GraphApp(0, mockModel, [ReadCsvTool.tool(), CalculatorTool.tool(), ArrayCalcTool.tool(), mockPdfTool]);

            const result = await app.invoke([new HumanMessage("Generate PDF report")]);
            assert.strictEqual(result.messages.length, 4);

            const toolMsg = result.messages.find((m: any) => m instanceof ToolMessage || m.name === "markdown_to_pdf");
            assert.ok(toolMsg, "ToolMessage for markdown_to_pdf should exist");
            const parsedOutput = JSON.parse(toolMsg.content as string);
            assert.strictEqual(parsedOutput.success, true);
            assert.ok(parsedOutput.pdfFilePath.includes("summary_report.pdf"));
            assert.strictEqual(result.messages[result.messages.length - 1].content, "PDF report generated.");
        });

        it("should execute multi-step tool calls across multiple cycles in the graph (CSV -> Calculations -> PDF generation)", async () => {
            const mockCsvTool = ReadCsvTool.mockTool("id,amount\n1,10\n2,20\n3,30");
            const mockPdfTool = MarkdownToPdf.mockTool();
            const mockModel = fakeModel()
                .respondWithTools([{ name: "read_csv_file", args: { filePath: "./data.csv" } }])
                .respondWithTools([{
                    name: "array_calculator",
                    args: { a: [10, 20, 30], b: [5, 5, 5], operation: "sum" },
                }])
                .respondWithTools([{
                    name: "markdown_to_pdf",
                    args: {
                        markdownContent: "# Financial Summary\nTotal calculated: 75",
                        outputFileName: "finance_summary",
                    },
                }])
                .respond(new AIMessage("PDF summary created successfully."));

            const app = new GraphApp(0, mockModel, [mockCsvTool, CalculatorTool.tool(), ArrayCalcTool.tool(), mockPdfTool]);
            const result = await app.invoke([new HumanMessage("Run full analytics and reporting pipeline")]);

            // Human -> AI (tool 1: csv) -> Tool 1 -> AI (tool 2: calc) -> Tool 2 -> AI (tool 3: pdf) -> Tool 3 -> Final AI
            assert.strictEqual(result.messages.length, 8);
            assert.strictEqual(result.messages[result.messages.length - 1].content, "PDF summary created successfully.");
        });
    });

    describe("1. Execution Time", () => {
        it("should measure total AI process execution time and calculate full latency statistics with Mock LLM", async () => {
            const mockModel = MockLLMFactory.createSimpleTextMock(["Fast response"]);
            const app = new GraphApp(0, mockModel);

            const result = await BenchmarkRunner.run(
                "Execution Time Test (Mock LLM)",
                async () => {
                    await app.invoke([new HumanMessage("Benchmark execution time")]);
                },
                { iterations: 15, warmup: 3 }
            );

            executionResults.push(result);
            assert.strictEqual(result.name, "Execution Time Test (Mock LLM)");
            assert.strictEqual(result.iterations, 15);
            assert.ok(result.totalTimeMs > 0, "totalTimeMs should be positive");
            assert.ok(result.meanMs > 0, "meanMs should be positive");
            assert.ok(result.minMs > 0, "minMs should be positive");
            assert.ok(result.maxMs >= result.minMs, "maxMs should be >= minMs");
            assert.ok(result.p50Ms > 0, "p50Ms should be positive");
            assert.ok(result.p95Ms >= result.p50Ms, "p95Ms should be >= p50Ms");
            assert.ok(result.p99Ms >= result.p95Ms, "p99Ms should be >= p95Ms");
            assert.ok(result.opsPerSec > 0, "opsPerSec should be positive");
        });

        it("should measure total AI process execution time and calculate full latency statistics with Real LLM (Gemini) reading CSV, calculating, and generating PDF", async () => {
            const mockCsvData = `transaction_id,date,customer_name,product_category,item_description,quantity,unit_price,total_revenue,cost_of_goods,net_earnings
TXN-1001,2026-09-01,Alice Smith,Electronics,Wireless Mouse,2,25.00,50.00,20.00,30.00
TXN-1002,2026-09-01,Bob Jones,Office Supplies,Ergonomic Chair,1,180.00,180.00,90.00,90.00
TXN-1003,2026-09-02,Charlie Brown,Electronics,USB-C Hub,3,35.00,105.00,45.00,60.00
TXN-1004,2026-09-02,Diana Prince,Apparel,Branded Hoodie,1,45.00,45.00,15.00,30.00
TXN-1005,2026-09-03,Evan Wright,Office Supplies,Notebook Pack (5pk),4,12.00,48.00,16.00,32.00`;
            const mockCsvTool = ReadCsvTool.mockTool(mockCsvData);
            const mockPdfTool = MarkdownToPdf.mockTool();
            const realApp = new GraphApp(0, undefined, [mockCsvTool, CalculatorTool.tool(), ArrayCalcTool.tool(), mockPdfTool]);

            const result = await BenchmarkRunner.run(
                "Execution Time Test (Real LLM - Gemini: CSV -> Analysis -> PDF)",
                async () => {
                    await realApp.invoke([
                        new HumanMessage(
                            "Read the transaction records from './data.csv', analyze the financial performance by calculating total revenue and total net earnings, and create a markdown summary report converted to PDF using the markdown_to_pdf tool."
                        ),
                    ]);
                },
                { iterations: 3, warmup: 1 }
            );

            executionResults.push(result);
            assert.strictEqual(result.name, "Execution Time Test (Real LLM - Gemini: CSV -> Analysis -> PDF)");
            assert.strictEqual(result.iterations, 3);
            assert.ok(result.totalTimeMs > 0, "totalTimeMs should be positive");
            assert.ok(result.meanMs > 0, "meanMs should be positive");
            assert.ok(result.minMs > 0, "minMs should be positive");
            assert.ok(result.maxMs >= result.minMs, "maxMs should be >= minMs");
            assert.ok(result.p50Ms > 0, "p50Ms should be positive");
            assert.ok(result.p95Ms >= result.p50Ms, "p95Ms should be >= p50Ms");
            assert.ok(result.p99Ms >= result.p95Ms, "p99Ms should be >= p95Ms");
            assert.ok(result.opsPerSec > 0, "opsPerSec should be positive");
        });
    });

    describe("2. Framework Overhead (Constant Latency Mock LLM)", () => {
        it("should measure framework overhead by subtracting constant mock LLM latency from total time", async () => {
            const constantLatencyMs = 15;
            const stats = { callCount: 0, totalLlmLatencyMs: 0 };
            const mockModel = MockLLMFactory.createConstantLatencyMock(
                constantLatencyMs,
                ["Overhead test response"],
                stats
            );
            const app = new GraphApp(0, mockModel);

            const result = await BenchmarkRunner.runOverheadBenchmark(
                "Direct Overhead Measurement",
                async () => {
                    await app.invoke([new HumanMessage("Test overhead")]);
                },
                () => stats,
                { iterations: 10, warmup: 2 }
            );

            overheadResults.push(result);
            assert.strictEqual(result.iterations, 10);
            assert.strictEqual(result.llmCallsPerRun, 1);
            assert.strictEqual(result.meanSimulatedLlmMs, 15);
            assert.ok(result.meanTotalMs >= 15, "meanTotalMs should be >= simulated LLM latency");
            assert.ok(result.meanFrameworkOverheadMs >= 0, "Framework overhead ms should be non-negative");
            assert.ok(result.overheadPercent >= 0 && result.overheadPercent <= 100);
        });

        it("should measure multi-hop framework overhead for tool-calling workflow with constant latency", async () => {
            const constantLatencyMs = 10;
            const stats = { callCount: 0, totalLlmLatencyMs: 0 };
            const mockModel = MockLLMFactory.createConstantLatencyToolMock(
                constantLatencyMs,
                [{ name: "calculator", args: { expression: "10 * 10" } }],
                "Result: 100",
                stats
            );
            const app = new GraphApp(0, mockModel);

            const result = await BenchmarkRunner.runOverheadBenchmark(
                "Tool-Calling Overhead Measurement",
                async () => {
                    await app.invoke([new HumanMessage("Calculate 10 * 10")]);
                },
                () => stats,
                { iterations: 8, warmup: 2 }
            );

            overheadResults.push(result);
            assert.strictEqual(result.llmCallsPerRun, 2);
            assert.strictEqual(result.meanSimulatedLlmMs, 20); // 2 calls * 10ms
            assert.ok(result.meanTotalMs >= 20);
            assert.ok(result.meanFrameworkOverheadMs >= 0);
        });
    });

    describe("3. Token Usage", () => {
        it("should count tokens accurately for messages using TokenTracker", () => {
            const promptMsg = new HumanMessage("What is the capital of France?");
            const aiMsg = new AIMessage("The capital of France is Paris.");

            const promptCount = TokenTracker.countMessage(promptMsg);
            const aiCount = TokenTracker.countMessage(aiMsg);

            assert.ok(promptCount.promptTokens > 0);
            assert.strictEqual(promptCount.completionTokens, 0);

            assert.strictEqual(aiCount.promptTokens, 0);
            assert.ok(aiCount.completionTokens > 0);

            const allCounts = TokenTracker.countMessages([promptMsg, aiMsg]);
            assert.strictEqual(allCounts.promptTokens, promptCount.promptTokens);
            assert.strictEqual(allCounts.completionTokens, aiCount.completionTokens);
            assert.strictEqual(allCounts.totalTokens, promptCount.promptTokens + aiCount.completionTokens);
        });

        it("should run token benchmark across graph invocations and compute average tokens", async () => {
            const result = await BenchmarkRunner.runTokenBenchmark(
                "Direct Query Token Benchmark",
                async () => {
                    const mockModel = MockLLMFactory.createSimpleTextMock(["Simple static answer"]);
                    const app = new GraphApp(0, mockModel);
                    return app.invoke([new HumanMessage("Hello LangGraph, How are you doing?")]);
                },
                5
            );

            tokenResults.push(result);
            assert.strictEqual(result.runs, 5);
            assert.ok(result.avgPromptTokens > 0, "avgPromptTokens should be > 0");
            assert.ok(result.avgCompletionTokens > 0, "avgCompletionTokens should be > 0");
            assert.ok(result.avgTotalTokens > 0, "avgTotalTokens should be > 0");
            assert.strictEqual(result.grandTotalTokens, result.totalPromptTokens + result.totalCompletionTokens);
        });
    });

    describe("4. Memory Consumption under Different Loads", () => {
        it("should profile memory usage with light load (direct invocation baseline)", async () => {
            const result = await BenchmarkRunner.runMemoryBenchmark(
                "Light Load Memory Benchmark",
                async () => {
                    const mockModel = MockLLMFactory.createSimpleTextMock(["Static memory response"]);
                    const app = new GraphApp(0, mockModel);
                    await app.invoke([new HumanMessage("Memory test baseline")]);
                },
                { iterations: 15, warmup: 3 }
            );

            memoryResults.push(result);
            assert.strictEqual(result.iterations, 15);
            assert.ok(result.heapUsedInitialMB > 0, "heapUsedInitialMB should be positive");
            assert.ok(result.heapUsedPeakMB >= result.heapUsedInitialMB, "Peak heap should be >= initial");
            assert.ok(result.heapUsedAvgMB > 0, "heapUsedAvgMB should be positive");
            assert.ok(result.nodeBaselineHeapMB > 0, "nodeBaselineHeapMB should be positive");
            assert.ok(result.compensatedHeapAvgMB >= 0, "compensatedHeapAvgMB should be non-negative");
            assert.ok(result.compensatedHeapPeakMB >= 0, "compensatedHeapPeakMB should be non-negative");
            assert.ok(result.rssMB > 0, "rssMB should be positive");
            assert.ok(result.compensatedRssMB >= 0, "compensatedRssMB should be non-negative");
            assert.ok(result.heapUsedDeltaMB >= 0, "heapUsedDeltaMB should be non-negative");
        });

        it("should profile memory usage with heavy data payload load (large array computations)", async () => {
            const arrA = Array.from({ length: 5000 }, (_, i) => i * 1.5);
            const arrB = Array.from({ length: 5000 }, (_, i) => i * 2.5);

            const result = await BenchmarkRunner.runMemoryBenchmark(
                "Heavy Payload Load Memory Benchmark (5k items)",
                async () => {
                    const mockModel = MockLLMFactory.createToolCallingMock(
                        [{ name: "array_calculator", args: { a: arrA, b: arrB, operation: "sum" } }],
                        "Large sum complete"
                    );
                    const app = new GraphApp(0, mockModel);
                    await app.invoke([new HumanMessage("Sum two 5000-item arrays")]);
                },
                { iterations: 10, warmup: 2 }
            );

            memoryResults.push(result);
            assert.strictEqual(result.iterations, 10);
            assert.ok(result.heapUsedInitialMB > 0);
            assert.ok(result.heapUsedPeakMB >= result.heapUsedInitialMB);
            assert.ok(result.heapUsedAvgMB > 0);
            assert.ok(result.nodeBaselineHeapMB > 0);
            assert.ok(result.compensatedHeapAvgMB >= 0);
            assert.ok(result.rssMB > 0);
        });

        it("should profile memory usage with large context and deep message history", async () => {
            const deepMessages = Array.from({ length: 30 }, (_, i) =>
                i % 2 === 0
                    ? new HumanMessage(`User query message context #${i} with extended textual information.`)
                    : new AIMessage(`Assistant response context #${i} tracking graph state history.`)
            );

            const result = await BenchmarkRunner.runMemoryBenchmark(
                "Large Context Load Memory Benchmark (30 messages)",
                async () => {
                    const mockModel = MockLLMFactory.createSimpleTextMock(["Contextual response"]);
                    const app = new GraphApp(0, mockModel);
                    await app.invoke(deepMessages);
                },
                { iterations: 10, warmup: 2 }
            );

            memoryResults.push(result);
            assert.strictEqual(result.iterations, 10);
            assert.ok(result.heapUsedInitialMB > 0);
            assert.ok(result.heapUsedPeakMB >= result.heapUsedInitialMB);
            assert.ok(result.heapUsedAvgMB > 0);
            assert.ok(result.nodeBaselineHeapMB > 0);
            assert.ok(result.compensatedHeapAvgMB >= 0);
            assert.ok(result.rssMB > 0);
        });

        it("should profile memory usage under concurrent burst load", async () => {
            const result = await BenchmarkRunner.runMemoryBenchmark(
                "Concurrent Burst Load Memory Benchmark (10 parallel requests)",
                async () => {
                    const mockModel = MockLLMFactory.createSimpleTextMock(["Concurrent response"]);
                    const app = new GraphApp(0, mockModel);
                    await Promise.all(
                        Array.from({ length: 10 }, (_, idx) =>
                            app.invoke([new HumanMessage(`Parallel req ${idx}`)])
                        )
                    );
                },
                { iterations: 10, warmup: 2 }
            );

            memoryResults.push(result);
            assert.strictEqual(result.iterations, 10);
            assert.ok(result.heapUsedInitialMB > 0);
            assert.ok(result.heapUsedPeakMB >= result.heapUsedInitialMB);
            assert.ok(result.heapUsedAvgMB > 0);
            assert.ok(result.nodeBaselineHeapMB > 0);
            assert.ok(result.compensatedHeapAvgMB >= 0);
            assert.ok(result.rssMB > 0);
        });
    });

    describe("5. Throughput", () => {
        it("should execute automated load test across multiple concurrency levels and compute throughput", async () => {
            const concurrencyLevels = [1, 3, 5];
            const results = await BenchmarkRunner.runLoadTest(
                "Test Concurrency Load Run",
                async (reqId: number) => {
                    const mockModel = MockLLMFactory.createSimpleTextMock([`Response for ${reqId}`]);
                    const app = new GraphApp(0, mockModel);
                    return app.invoke([new HumanMessage(`Task ${reqId}`)]);
                },
                concurrencyLevels,
                15
            );

            assert.strictEqual(results.length, concurrencyLevels.length);

            for (let i = 0; i < results.length; i++) {
                const item = results[i];
                throughputResults.push(item);
                assert.strictEqual(item.concurrency, concurrencyLevels[i]);
                assert.ok(item.totalRequests >= concurrencyLevels[i]);
                assert.ok(item.durationMs > 0);
                assert.ok(item.throughputRps > 0, "Throughput RPS should be positive");
                assert.ok(item.meanLatencyMs > 0);
                assert.ok(item.p50LatencyMs > 0);
                assert.ok(item.p95LatencyMs >= item.p50LatencyMs);
                assert.strictEqual(item.errorCount, 0);
                assert.strictEqual(item.successCount, item.totalRequests);
            }
        });
    });
});
