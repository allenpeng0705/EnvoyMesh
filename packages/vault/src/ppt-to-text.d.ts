declare module "ppt-to-text" {
  interface PptToTextModule {
    extractText(
      input: string | Buffer,
      options?: {
        outputPath?: string;
        separator?: string;
        encoding?: string;
        readOpts?: Record<string, unknown>;
      },
    ): string;
  }

  const PPT: PptToTextModule;
  export default PPT;
}
