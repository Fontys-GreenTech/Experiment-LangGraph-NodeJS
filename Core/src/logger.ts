import chalk from "chalk";

let loggingEnabled = false;

export function setLoggingEnabled(enabled: boolean): void {
    loggingEnabled = enabled;
}

export function isLoggingEnabled(): boolean {
    return loggingEnabled && process.env.SILENT_LOGS !== "true";
}

export function toolInfoLine(toolName: string, message: string, data: any = undefined): void {
    if (!isLoggingEnabled()) return;
    if (data !== undefined) {
        console.log(`${chalk.blue(toolName + ": ")}${chalk.white(message)} %o`, data);
    } else {
        console.log(`${chalk.blue(toolName + ": ")}${chalk.white(message)}`);
    }
}

export function toolErrorLine(toolName: string, message: string, data: any = undefined): void {
    if (!isLoggingEnabled()) return;
    if (data !== undefined) {
        console.log(`${chalk.blue(toolName + ": ")}${chalk.red(message)} %o`, data);
    } else {
        console.log(`${chalk.blue(toolName + ": ")}${chalk.red(message)}`);
    }
}

export function toolTimeLine(toolName: string, message: string, data: any = undefined): void {
    if (!isLoggingEnabled()) return;
    if (data !== undefined) {
        console.log(`${chalk.blue(toolName + ": ")}${chalk.yellow(message)} %o`, data);
    } else {
        console.log(`${chalk.blue(toolName + ": ")}${chalk.yellow(message)}`);
    }
}

export function toolTimeDebugLine(toolName: string, message: string, data: any = undefined): void {
    toolTimeLine(toolName, message, data);
}