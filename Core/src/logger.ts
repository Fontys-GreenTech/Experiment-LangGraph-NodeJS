import chalk from "chalk";

export function toolInfoLine(toolName: string, message: string, data: any = undefined): void {
    if (data !== undefined) {
        console.log(`${chalk.blue(toolName + ": ")}${chalk.white(message)} %o`, data);
    } else {
        console.log(`${chalk.blue(toolName + ": ")}${chalk.white(message)}`);
    }
}

export function toolErrorLine(toolName: string, message: string, data: any = undefined): void {
    if (data !== undefined) {
        console.log(`${chalk.blue(toolName + ": ")}${chalk.red(message)} %o`, data);
    } else {
        console.log(`${chalk.blue(toolName + ": ")}${chalk.red(message)}`);
    }
}

export function toolTimeLine(toolName: string, message: string, data: any = undefined): void {
    if (data !== undefined) {
        console.log(`${chalk.blue(toolName + ": ")}${chalk.yellow(message)} %o`, data);
    } else {
        console.log(`${chalk.blue(toolName + ": ")}${chalk.yellow(message)}`);
    }
}

export function toolTimeDebugLine(toolName: string, message: string, data: any = undefined): void {
    toolTimeLine(toolName, message, data);
}