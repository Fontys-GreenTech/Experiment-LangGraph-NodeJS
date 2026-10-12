import { tool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "node:fs/promises";
import { toolInfoLine, toolErrorLine, toolTimeLine } from "../logger.ts";

export class ReadCsvTool{
    public static tool(fileReader?: (filePath: string) => Promise<string> | string){
        return tool(
            async ({ filePath }) => {
                const startTime = performance.now();
                try {
                    toolInfoLine("ReadCsvTool", "Running Read CSV Tool");
                    toolInfoLine("ReadCsvTool", "Reading CSV file: ", filePath);

                    const fileContent = fileReader
                        ? await fileReader(filePath)
                        : await fs.readFile(filePath, "utf-8");
                    const lines = fileContent.trim().split("\n");

                    if (lines.length === 0 || (lines.length === 1 && lines[0] === "")) {
                        toolErrorLine("ReadCsvTool", "CSV file is empty!");
                        const durationMs = (performance.now() - startTime).toFixed(2);
                        toolTimeLine("ReadCsvTool", `Execution time: ${durationMs}ms`);
                        return JSON.stringify({ message: "The CSV file is empty." });
                    }

                    const headers = lines[0].split(",").map((h) => h.trim());
                    toolInfoLine("ReadCsvTool", "CSV file headers: ", filePath);

                    const rows = lines.slice(1).map((line) => {
                        const values = line.split(",").map((v) => v.trim());
                        const rowObject: Record<string, string> = {};
                        headers.forEach((header, index) => {
                            rowObject[header] = values[index] !== undefined ? values[index] : "";
                        });
                        return rowObject;
                    });

                    toolInfoLine("ReadCsvTool", "Found %o rows: ", rows.length);
                    toolInfoLine("ReadCsvTool", "Read CSV Tool finished");
                    const durationMs = (performance.now() - startTime).toFixed(2);
                    toolTimeLine("ReadCsvTool", `Execution time: ${durationMs}ms`);

                    return JSON.stringify(rows, null, 2);
                } catch (error: any) {
                    toolErrorLine("ReadCsvTool", "Failed to read CSV file: ", error.message);
                    const durationMs = (performance.now() - startTime).toFixed(2);
                    toolTimeLine("ReadCsvTool", `Execution time: ${durationMs}ms`);
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
    }

    public static mockTool(mockContent: string = "id,name,value\n1,Alpha,100\n2,Beta,200\n3,Gamma,300") {
        return ReadCsvTool.tool(async () => mockContent);
    }
}