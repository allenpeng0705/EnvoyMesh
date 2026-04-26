import { runDeveloperCli } from "./developer-cli.js";

try {
  const result = await runDeveloperCli(process.argv.slice(2));

  for (const line of result.lines) {
    console.log(line);
  }

  process.exit(result.exitCode);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
