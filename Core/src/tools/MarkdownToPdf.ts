import { tool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { toolInfoLine, toolErrorLine, toolTimeLine } from "../logger.ts";

export class MarkdownToPdf {
    public static tool(
        fileWriter?: (filePath: string, content: string) => Promise<void> | void
    ) {
        return tool(
            async ({ markdownContent, outputFileName }) => {
                const startTime = performance.now();
                const toolName = "MarkdownToPdfTool";

                try {
                    toolInfoLine(toolName, "Running Markdown to PDF Tool");

                    const safeBaseName = (outputFileName || `document_${Date.now()}`)
                        .replace(/\.[^/.]+$/, "");

                    const txtFilePath = path.resolve(`output/${safeBaseName}.txt`);
                    const fakePdfFilePath = path.resolve(`output/${safeBaseName}.pdf`);

                    toolInfoLine(toolName, "Saving markdown content as text file to: ", txtFilePath);

                    if (fileWriter) {
                        await fileWriter(txtFilePath, markdownContent);
                    } else {
                        await fs.mkdir(path.dirname(txtFilePath), { recursive: true });
                        await fs.writeFile(txtFilePath, markdownContent, "utf-8");
                    }

                    toolInfoLine(toolName, "Generated fake PDF destination: ", fakePdfFilePath);
                    toolInfoLine(toolName, "Markdown to PDF Tool finished");

                    const durationMs = (performance.now() - startTime).toFixed(2);
                    toolTimeLine(toolName, `Execution time: ${durationMs}ms`);

                    return JSON.stringify({
                        success: true,
                        message: "Markdown converted to PDF.",
                        savedTextPath: txtFilePath,
                        pdfFilePath: fakePdfFilePath,
                    });
                } catch (error: any) {
                    toolErrorLine(toolName, "Failed to process markdown to PDF: ", error.message);

                    const durationMs = (performance.now() - startTime).toFixed(2);
                    toolTimeLine(toolName, `Execution time: ${durationMs}ms`);

                    return JSON.stringify({
                        success: false,
                        error: `Failed to convert markdown to PDF: ${error.message}`,
                    });
                }
            },
            {
                name: "markdown_to_pdf",
                description: "Converts Markdown content into a PDF file and returns the generated PDF file path.",
                schema: z.object({
                    markdownContent: z
                        .string()
                        .describe("The raw markdown string content to convert."),
                    outputFileName: z
                        .string()
                        .optional()
                        .describe("Optional target base filename or path (without extension or with .pdf)."),
                }),
            }
        );
    }

    public static mockTool() {
        const memoryStorage: Record<string, string> = {};
        return MarkdownToPdf.tool(async (filePath, content) => {
            memoryStorage[filePath] = content;
        });
    }
}