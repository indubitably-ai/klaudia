export const DEFAULT_GRANT_FLAGS = Object.freeze({
  clipboardRead: false,
  clipboardWrite: false,
  systemKeyCombos: false,
});

export const API_RESIZE_PARAMS = Object.freeze({});

export function targetImageSize(width, height) {
  return [width, height];
}

export function buildComputerUseTools() {
  return [];
}

export function createComputerUseMcpServer() {
  return {
    async connect() {},
    async close() {},
    setRequestHandler() {},
  };
}

export function bindSessionContext() {
  return async () => ({
    content: [
      {
        type: "text",
        text: "Computer use is unavailable in the public-safe build.",
      },
    ],
  });
}
