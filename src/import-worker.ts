import { parseImport } from "./model";
self.onmessage = (event: MessageEvent<string>) => {
  try {
    self.postMessage({ workspace: parseImport(event.data) });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
