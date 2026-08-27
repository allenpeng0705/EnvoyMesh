/** Error type thrown by the runner. Carries the exit code. */
export class CliError extends Error {
    exitCode;
    constructor(message, exitCode) {
        super(message);
        this.exitCode = exitCode;
        this.name = "CliError";
    }
}
//# sourceMappingURL=errors.js.map