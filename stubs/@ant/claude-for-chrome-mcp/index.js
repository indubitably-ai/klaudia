export const BROWSER_TOOLS = [];

function createNoopServer() {
  return {
    async connect() {},
    async close() {},
    setRequestHandler() {},
  };
}

export function createClaudeForChromeMcpServer() {
  return createNoopServer();
}
