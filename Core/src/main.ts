import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import boxen from "boxen";
import chalk from "chalk";
import { GraphApp } from "./GraphApp.ts";

export function formatMarkdown(text: string): string {
    return text
        .replace(/(\*\*\*|___)([\s\S]+?)\1/g, (_, __, content) => chalk.bold.italic(content))
        .replace(/(\*\*|__)([\s\S]+?)\1/g, (_, __, content) => chalk.bold(content))
        .replace(/(\*|_)([\s\S]+?)\1/g, (_, __, content) => chalk.italic(content));
}

function formatMessageContent(content: unknown): string {
    let text = "";
    if (typeof content === "string") {
        text = content;
    } else if (Array.isArray(content)) {
        text = content
            .map((item) => {
                if (typeof item === "string") return item;
                if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
                    return item.text;
                }
                return "";
            })
            .filter(Boolean)
            .join("\n");
    } else if (content !== null && content !== undefined) {
        text = String(content);
    }
    return text ? formatMarkdown(text) : "";
}

async function startChatBot() {
    const graphApp = new GraphApp();
    const rl = readline.createInterface({ input, output });

    const welcomeBox = boxen(
        `${chalk.bold.cyan("Welcome to the LangGraph Chat Bot!")}\n\n` +
        `${chalk.dim("• Type your message and press Enter.")}\n` +
        `${chalk.dim("• Type")} ${chalk.yellow("exit")} ${chalk.dim("or")} ${chalk.yellow("quit")} ${chalk.dim("to end the conversation.")}`,
        {
            padding: 1,
            margin: 1,
            borderStyle: "round",
            borderColor: "cyan",
            title: chalk.bold.green(" Chat Bot "),
            titleAlignment: "center",
        }
    );

    console.log(welcomeBox);

    const messages: any[] = [];

    try {
        while (true) {
            const userInput = await rl.question(chalk.bold.green("You > "));
            const trimmedInput = userInput.trim();

            if (!trimmedInput) {
                continue;
            }

            if (trimmedInput.toLowerCase() === "exit" || trimmedInput.toLowerCase() === "quit") {
                const exitBox = boxen(chalk.yellow("Goodbye! Thanks for chatting."), {
                    padding: { top: 0, bottom: 0, left: 1, right: 1 },
                    margin: 1,
                    borderStyle: "round",
                    borderColor: "yellow",
                });
                console.log(exitBox);
                break;
            }

            messages.push({ role: "user", content: trimmedInput });

            console.log(chalk.gray("Thinking..."));

            try {
                const startTime = performance.now();
                const result = await graphApp.invoke(messages);
                const endTime = performance.now();
                const durationMs = (endTime - startTime).toFixed(0);

                if (result?.messages && Array.isArray(result.messages)) {
                    messages.length = 0;
                    messages.push(...result.messages);

                    const lastMessage = result.messages[result.messages.length - 1];
                    // @ts-ignore
                    const rawContent = lastMessage?.kwargs?.content ?? lastMessage?.content ?? "";
                    const responseText = formatMessageContent(rawContent) || chalk.dim("(No response content)");

                    const responseBox = boxen(responseText, {
                        padding: 1,
                        margin: { top: 1, bottom: 1, left: 0, right: 0 },
                        borderStyle: "round",
                        borderColor: "magenta",
                        title: chalk.bold.magenta(" Assistant ") + chalk.dim(`(${durationMs}ms)`),
                        titleAlignment: "left",
                    });

                    console.log(responseBox);
                } else {
                    console.log(chalk.red("Unexpected response format received from assistant."));
                }
            } catch (err: any) {
                const errorBox = boxen(
                    chalk.red(`Error: ${err?.message || "An unexpected error occurred."}`),
                    {
                        padding: 1,
                        margin: 1,
                        borderStyle: "double",
                        borderColor: "red",
                        title: chalk.bold.red(" Error "),
                    }
                );
                console.error(errorBox);
            }
        }
    } finally {
        rl.close();
    }
}

await startChatBot();