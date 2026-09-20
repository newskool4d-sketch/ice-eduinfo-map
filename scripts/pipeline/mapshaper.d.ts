// mapshaper ships no TypeScript types (verified: no `types`/`exports` field in
// its package.json and no `@types/mapshaper` package exists). This is a
// minimal ambient declaration covering only the Node API surface this
// pipeline uses: `applyCommands(commands, inputFiles) -> Promise<outputFiles>`.
// See https://github.com/mbloch/mapshaper/wiki/Command-Reference and the
// "Programmatic use" section of the mapshaper README for the full API.
declare module "mapshaper" {
  /** Virtual input filename -> file contents (text for GeoJSON/CSV, Buffer for binary formats). */
  type MapshaperInputFiles = Record<string, string | Buffer>;
  /** Virtual output filename -> file contents produced by the command string. */
  type MapshaperOutputFiles = Record<string, string>;

  interface MapshaperApi {
    /** Runs a mapshaper command-line string against in-memory virtual files and returns the output files. */
    applyCommands(
      commands: string,
      input: MapshaperInputFiles,
    ): Promise<MapshaperOutputFiles>;
    runCommands(commands: string, callback: (err: Error | null) => void): void;
    enableLogging(): MapshaperApi;
  }

  const mapshaper: MapshaperApi;
  export default mapshaper;
}
