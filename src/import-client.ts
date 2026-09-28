import type { Workspace } from "./model";

// Parse and normalize large collections without blocking the desktop UI thread.
export function parseImportAsync(text: string): Promise<Workspace> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./import-worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (
      event: MessageEvent<{ workspace?: Workspace; error?: string }>,
    ) => {
      worker.terminate();
      if (event.data.workspace) resolve(event.data.workspace);
      else
        reject(
          new Error(event.data.error ?? "Could not parse the collection."),
        );
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(
        new Error(
          event.message ||
            "Could not process the collection. Available memory may be insufficient.",
        ),
      );
    };
    worker.onmessageerror = () => {
      worker.terminate();
      reject(
        new Error(
          "Could not transfer the parsed collection. Available memory may be insufficient.",
        ),
      );
    };
    try {
      worker.postMessage(text);
    } catch (error) {
      worker.terminate();
      reject(error);
    }
  });
}
