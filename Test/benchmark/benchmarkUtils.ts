import { TokenTracker, type TokenStats } from "./tokenTracker.ts";

export interface BenchmarkResult {
    name: string;
    category?: string;
    iterations: number;
    totalTimeMs: number;
    meanMs: number;
    minMs: number;
    maxMs: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    stdDevMs: number;
    opsPerSec: number;
    memoryUsedDeltaMB: number;
    heapUsedAvgMB?: number;
    heapUsedPeakMB?: number;
    simulatedLlmTimeMs?: number;
    frameworkOverheadMs?: number;
    overheadPercent?: number;
    tokens?: TokenStats;
}

export interface OverheadBenchmarkResult {
    name: string;
    iterations: number;
    meanTotalMs: number;
    meanSimulatedLlmMs: number;
    meanFrameworkOverheadMs: number;
    overheadPercent: number;
    llmCallsPerRun: number;
}

export interface TokenBenchmarkResult {
    name: string;
    runs: number;
    avgPromptTokens: number;
    avgCompletionTokens: number;
    avgTotalTokens: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    grandTotalTokens: number;
}

export interface MemoryBenchmarkResult {
    name: string;
    iterations: number;
    nodeBaselineHeapMB: number;
    nodeBaselineRssMB: number;
    heapUsedInitialMB: number;
    heapUsedPeakMB: number;
    heapUsedFinalMB: number;
    heapUsedDeltaMB: number;
    heapUsedAvgMB: number;
    compensatedHeapAvgMB: number;
    compensatedHeapPeakMB: number;
    rssMB: number;
    compensatedRssMB: number;
}

export interface ThroughputResult {
    concurrency: number;
    totalRequests: number;
    durationMs: number;
    throughputRps: number;
    meanLatencyMs: number;
    minLatencyMs: number;
    maxLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    successCount: number;
    errorCount: number;
}

export interface BenchmarkOptions {
    iterations?: number;
    warmup?: number;
}

export class BenchmarkRunner {
    /**
     * Executes a benchmark on a given asynchronous function and returns statistical execution metrics.
     */
    static async run(
        name: string,
        fn: () => Promise<void | any>,
        options: BenchmarkOptions = {}
    ): Promise<BenchmarkResult> {
        const iterations = options.iterations ?? 50;
        const warmup = options.warmup ?? 5;

        // Warmup phase
        for (let i = 0; i < warmup; i++) {
            await fn();
        }

        if (global.gc) {
            global.gc();
        }

        const memStart = process.memoryUsage().heapUsed;
        const durations: number[] = [];
        const heapSamples: number[] = [];
        let peakHeap = memStart;

        const startTotal = performance.now();

        for (let i = 0; i < iterations; i++) {
            const currentHeap = process.memoryUsage().heapUsed;
            heapSamples.push(currentHeap);
            if (currentHeap > peakHeap) peakHeap = currentHeap;

            const start = performance.now();
            await fn();
            const end = performance.now();
            durations.push(end - start);
        }

        const endTotal = performance.now();
        const memEnd = process.memoryUsage().heapUsed;

        durations.sort((a, b) => a - b);

        const totalTimeMs = endTotal - startTotal;
        const meanMs = durations.reduce((acc, d) => acc + d, 0) / iterations;
        const minMs = durations[0];
        const maxMs = durations[durations.length - 1];
        const p50Ms = durations[Math.floor(iterations * 0.5)];
        const p95Ms = durations[Math.floor(iterations * 0.95)];
        const p99Ms = durations[Math.floor(iterations * 0.99)];

        const variance = durations.reduce((acc, d) => acc + Math.pow(d - meanMs, 2), 0) / iterations;
        const stdDevMs = Math.sqrt(variance);
        const opsPerSec = totalTimeMs > 0 ? iterations / (totalTimeMs / 1000) : 0;
        const memoryUsedDeltaMB = Math.max(0, (memEnd - memStart) / (1024 * 1024));
        const heapUsedAvgMB = heapSamples.reduce((a, b) => a + b, 0) / (heapSamples.length * 1024 * 1024);
        const heapUsedPeakMB = peakHeap / (1024 * 1024);

        return {
            name,
            iterations,
            totalTimeMs: Number(totalTimeMs.toFixed(2)),
            meanMs: Number(meanMs.toFixed(2)),
            minMs: Number(minMs.toFixed(2)),
            maxMs: Number(maxMs.toFixed(2)),
            p50Ms: Number(p50Ms.toFixed(2)),
            p95Ms: Number(p95Ms.toFixed(2)),
            p99Ms: Number(p99Ms.toFixed(2)),
            stdDevMs: Number(stdDevMs.toFixed(2)),
            opsPerSec: Number(opsPerSec.toFixed(2)),
            memoryUsedDeltaMB: Number(memoryUsedDeltaMB.toFixed(3)),
            heapUsedAvgMB: Number(heapUsedAvgMB.toFixed(2)),
            heapUsedPeakMB: Number(heapUsedPeakMB.toFixed(2)),
        };
    }

    /**
     * Executes Framework Overhead benchmark using a constant latency mock LLM.
     * Computes the exact framework time penalty = total execution time - simulated LLM latency.
     */
    static async runOverheadBenchmark(
        name: string,
        runFn: () => Promise<void | any>,
        getStats: () => { callCount: number; totalLlmLatencyMs: number },
        options: BenchmarkOptions = {}
    ): Promise<OverheadBenchmarkResult> {
        const iterations = options.iterations ?? 30;
        const warmup = options.warmup ?? 3;

        for (let i = 0; i < warmup; i++) {
            await runFn();
        }

        const totalTimes: number[] = [];
        const simulatedTimes: number[] = [];
        const overheadTimes: number[] = [];
        let totalCalls = 0;

        for (let i = 0; i < iterations; i++) {
            const statsBefore = { ...getStats() };
            const start = performance.now();
            await runFn();
            const end = performance.now();
            const statsAfter = { ...getStats() };

            const iterTotalTime = end - start;
            const iterLlmLatency = statsAfter.totalLlmLatencyMs - statsBefore.totalLlmLatencyMs;
            const iterLlmCalls = statsAfter.callCount - statsBefore.callCount;
            const iterOverhead = Math.max(0, iterTotalTime - iterLlmLatency);

            totalCalls += iterLlmCalls;
            totalTimes.push(iterTotalTime);
            simulatedTimes.push(iterLlmLatency);
            overheadTimes.push(iterOverhead);
        }

        const meanTotalMs = totalTimes.reduce((a, b) => a + b, 0) / iterations;
        const meanSimulatedLlmMs = simulatedTimes.reduce((a, b) => a + b, 0) / iterations;
        const meanFrameworkOverheadMs = overheadTimes.reduce((a, b) => a + b, 0) / iterations;
        const overheadPercent = meanTotalMs > 0 ? (meanFrameworkOverheadMs / meanTotalMs) * 100 : 0;
        const llmCallsPerRun = totalCalls / iterations;

        return {
            name,
            iterations,
            meanTotalMs: Number(meanTotalMs.toFixed(2)),
            meanSimulatedLlmMs: Number(meanSimulatedLlmMs.toFixed(2)),
            meanFrameworkOverheadMs: Number(meanFrameworkOverheadMs.toFixed(2)),
            overheadPercent: Number(overheadPercent.toFixed(2)),
            llmCallsPerRun: Number(llmCallsPerRun.toFixed(1)),
        };
    }

    /**
     * Executes Token Usage benchmark measuring prompt, completion, and total tokens.
     */
    static async runTokenBenchmark(
        name: string,
        runFn: () => Promise<{ messages: any[] }>,
        runs: number = 10
    ): Promise<TokenBenchmarkResult> {
        let totalPrompt = 0;
        let totalCompletion = 0;
        let totalGrand = 0;

        for (let i = 0; i < runs; i++) {
            const res = await runFn();
            const tokenStats = TokenTracker.countMessages(res.messages || []);
            totalPrompt += tokenStats.promptTokens;
            totalCompletion += tokenStats.completionTokens;
            totalGrand += tokenStats.totalTokens;
        }

        return {
            name,
            runs,
            avgPromptTokens: Number((totalPrompt / runs).toFixed(1)),
            avgCompletionTokens: Number((totalCompletion / runs).toFixed(1)),
            avgTotalTokens: Number((totalGrand / runs).toFixed(1)),
            totalPromptTokens: totalPrompt,
            totalCompletionTokens: totalCompletion,
            grandTotalTokens: totalGrand,
        };
    }

    /**
     * Measures the baseline memory footprint of the NodeJS runtime environment.
     */
    static getNodeBaselineMemory(): { heapUsedMB: number; rssMB: number; heapTotalMB: number; externalMB: number } {
        if (global.gc) {
            global.gc();
        }
        const mem = process.memoryUsage();
        return {
            heapUsedMB: Number((mem.heapUsed / (1024 * 1024)).toFixed(2)),
            rssMB: Number((mem.rss / (1024 * 1024)).toFixed(2)),
            heapTotalMB: Number((mem.heapTotal / (1024 * 1024)).toFixed(2)),
            externalMB: Number((mem.external / (1024 * 1024)).toFixed(2)),
        };
    }

    /**
     * Executes Memory Usage benchmark with static Mock LLMs.
     * Computes both raw metrics and compensated metrics that subtract NodeJS baseline memory usage.
     */
    static async runMemoryBenchmark(
        name: string,
        runFn: () => Promise<void | any>,
        options: BenchmarkOptions = {}
    ): Promise<MemoryBenchmarkResult> {
        const iterations = options.iterations ?? 50;
        const warmup = options.warmup ?? 5;

        // Measure runtime baseline before warmup/workload
        const nodeBaseline = BenchmarkRunner.getNodeBaselineMemory();

        for (let i = 0; i < warmup; i++) {
            await runFn();
        }

        if (global.gc) {
            global.gc();
        }

        const memStart = process.memoryUsage();
        const heapSamples: number[] = [];
        let peakHeap = memStart.heapUsed;

        for (let i = 0; i < iterations; i++) {
            await runFn();
            const heap = process.memoryUsage().heapUsed;
            heapSamples.push(heap);
            if (heap > peakHeap) peakHeap = heap;
        }

        const memEnd = process.memoryUsage();
        const nodeBaselineHeapMB = nodeBaseline.heapUsedMB;
        const nodeBaselineRssMB = nodeBaseline.rssMB;
        const heapUsedInitialMB = memStart.heapUsed / (1024 * 1024);
        const heapUsedFinalMB = memEnd.heapUsed / (1024 * 1024);
        const heapUsedDeltaMB = Math.max(0, (memEnd.heapUsed - memStart.heapUsed) / (1024 * 1024));
        const heapUsedPeakMB = peakHeap / (1024 * 1024);
        const heapUsedAvgMB = heapSamples.reduce((a, b) => a + b, 0) / (heapSamples.length * 1024 * 1024);
        const rssMB = memEnd.rss / (1024 * 1024);

        // Compensated metrics: Isolating framework footprint from Node.js runtime baseline
        const compensatedHeapAvgMB = Math.max(0, heapUsedAvgMB - nodeBaselineHeapMB);
        const compensatedHeapPeakMB = Math.max(0, heapUsedPeakMB - nodeBaselineHeapMB);
        const compensatedRssMB = Math.max(0, rssMB - nodeBaselineRssMB);

        return {
            name,
            iterations,
            nodeBaselineHeapMB: Number(nodeBaselineHeapMB.toFixed(2)),
            nodeBaselineRssMB: Number(nodeBaselineRssMB.toFixed(2)),
            heapUsedInitialMB: Number(heapUsedInitialMB.toFixed(2)),
            heapUsedPeakMB: Number(heapUsedPeakMB.toFixed(2)),
            heapUsedFinalMB: Number(heapUsedFinalMB.toFixed(2)),
            heapUsedDeltaMB: Number(heapUsedDeltaMB.toFixed(3)),
            heapUsedAvgMB: Number(heapUsedAvgMB.toFixed(2)),
            compensatedHeapAvgMB: Number(compensatedHeapAvgMB.toFixed(2)),
            compensatedHeapPeakMB: Number(compensatedHeapPeakMB.toFixed(2)),
            rssMB: Number(rssMB.toFixed(2)),
            compensatedRssMB: Number(compensatedRssMB.toFixed(2)),
        };
    }

    /**
     * Executes automated Load Testing with ramping concurrency levels.
     * Evaluates maximum throughput (Requests/sec) and latency percentiles under load.
     */
    static async runLoadTest(
        name: string,
        taskFactory: (requestId: number) => Promise<any>,
        concurrencyLevels: number[] = [1, 5, 10, 25, 50],
        requestsPerLevel: number = 50
    ): Promise<ThroughputResult[]> {
        const results: ThroughputResult[] = [];

        // Warmup
        for (let i = 0; i < 5; i++) {
            await taskFactory(i);
        }

        for (const concurrency of concurrencyLevels) {
            const totalRequests = Math.max(concurrency * 2, requestsPerLevel);
            const latencies: number[] = [];
            let successCount = 0;
            let errorCount = 0;

            const startTotal = performance.now();

            let requestIndex = 0;
            const worker = async () => {
                while (requestIndex < totalRequests) {
                    const currentId = requestIndex++;
                    const startReq = performance.now();
                    try {
                        await taskFactory(currentId);
                        successCount++;
                    } catch {
                        errorCount++;
                    } finally {
                        const endReq = performance.now();
                        latencies.push(endReq - startReq);
                    }
                }
            };

            const workers = Array.from({ length: concurrency }, () => worker());
            await Promise.all(workers);

            const endTotal = performance.now();
            const durationMs = endTotal - startTotal;
            latencies.sort((a, b) => a - b);

            const throughputRps = durationMs > 0 ? (totalRequests / (durationMs / 1000)) : 0;
            const meanLatencyMs = latencies.reduce((a, b) => a + b, 0) / latencies.length;
            const minLatencyMs = latencies[0] ?? 0;
            const maxLatencyMs = latencies[latencies.length - 1] ?? 0;
            const p50LatencyMs = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
            const p95LatencyMs = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
            const p99LatencyMs = latencies[Math.floor(latencies.length * 0.99)] ?? 0;

            results.push({
                concurrency,
                totalRequests,
                durationMs: Number(durationMs.toFixed(2)),
                throughputRps: Number(throughputRps.toFixed(2)),
                meanLatencyMs: Number(meanLatencyMs.toFixed(2)),
                minLatencyMs: Number(minLatencyMs.toFixed(2)),
                maxLatencyMs: Number(maxLatencyMs.toFixed(2)),
                p50LatencyMs: Number(p50LatencyMs.toFixed(2)),
                p95LatencyMs: Number(p95LatencyMs.toFixed(2)),
                p99LatencyMs: Number(p99LatencyMs.toFixed(2)),
                successCount,
                errorCount,
            });
        }

        return results;
    }

    /**
     * Formats and logs Execution Time benchmark results as a console table.
     */
    static formatResults(results: BenchmarkResult[]): void {
        console.table(
            results.map((r) => ({
                Benchmark: r.name,
                "Iterations": r.iterations,
                "Mean (ms)": r.meanMs,
                "Min (ms)": r.minMs,
                "Max (ms)": r.maxMs,
                "p50 (ms)": r.p50Ms,
                "p95 (ms)": r.p95Ms,
                "p99 (ms)": r.p99Ms,
                "StdDev (ms)": r.stdDevMs,
                "Ops/sec": r.opsPerSec,
            }))
        );
    }

    /**
     * Formats and logs Framework Overhead benchmark results as a console table.
     */
    static formatOverheadResults(results: OverheadBenchmarkResult[]): void {
        console.table(
            results.map((r) => ({
                "Workflow": r.name,
                "Iterations": r.iterations,
                "LLM Calls/Run": r.llmCallsPerRun,
                "Total Mean (ms)": r.meanTotalMs,
                "Simulated LLM (ms)": r.meanSimulatedLlmMs,
                "Framework Overhead (ms)": r.meanFrameworkOverheadMs,
                "Overhead (%)": `${r.overheadPercent}%`,
            }))
        );
    }

    /**
     * Formats and logs Token Usage results as a console table.
     */
    static formatTokenResults(results: TokenBenchmarkResult[]): void {
        console.table(
            results.map((r) => ({
                "Test Case": r.name,
                "Runs": r.runs,
                "Avg Prompt Tokens": r.avgPromptTokens,
                "Avg Completion Tokens": r.avgCompletionTokens,
                "Avg Total Tokens": r.avgTotalTokens,
                "Grand Total Tokens": r.grandTotalTokens,
            }))
        );
    }

    /**
     * Formats and logs Memory Usage results as a console table.
     */
    static formatMemoryResults(results: MemoryBenchmarkResult[]): void {
        console.table(
            results.map((r) => ({
                "Test Case": r.name,
                "Runs": r.iterations,
                "Node Base (MB)": r.nodeBaselineHeapMB,
                "Heap Avg (MB)": r.heapUsedAvgMB,
                "Comp. Avg (MB)": r.compensatedHeapAvgMB,
                "Peak (MB)": r.heapUsedPeakMB,
                "Comp. Peak (MB)": r.compensatedHeapPeakMB,
                "RSS (MB)": r.rssMB,
                "Comp. RSS (MB)": r.compensatedRssMB,
            }))
        );
    }

    /**
     * Formats and logs Throughput Load Test results as a console table.
     */
    static formatLoadTestResults(results: ThroughputResult[]): void {
        console.table(
            results.map((r) => ({
                "Concurrency": r.concurrency,
                "Total Requests": r.totalRequests,
                "Duration (ms)": r.durationMs,
                "Throughput (req/s)": r.throughputRps,
                "Mean Latency (ms)": r.meanLatencyMs,
                "p50 Latency (ms)": r.p50LatencyMs,
                "p95 Latency (ms)": r.p95LatencyMs,
                "p99 Latency (ms)": r.p99LatencyMs,
                "Success": r.successCount,
                "Errors": r.errorCount,
            }))
        );
    }
}
