export class DefaultMcpClientRegistry {
    clients = new Map();
    register(client) {
        if (this.clients.has(client.serverName)) {
            throw new Error(`MCP client already registered for server "${client.serverName}"`);
        }
        this.clients.set(client.serverName, client);
    }
    async unregister(serverName) {
        const client = this.clients.get(serverName);
        if (client === undefined)
            return;
        this.clients.delete(serverName);
        await client.close();
    }
    get(serverName) {
        return this.clients.get(serverName);
    }
    list() {
        return [...this.clients.keys()];
    }
    /**
     * Collect every tool from every client. The
     * tool name in the returned list is the bare
     * name (the agent prepends `mcp__<server>__`
     * when registering with the model). We return
     * the serverName alongside so the caller can
     * build the namespaced name.
     */
    async collectTools() {
        const all = [];
        for (const [serverName, client] of this.clients) {
            const tools = await client.listTools();
            for (const tool of tools) {
                all.push({ ...tool, serverName });
            }
        }
        return all;
    }
    async closeAll() {
        const all = [...this.clients.values()];
        this.clients.clear();
        await Promise.all(all.map((c) => c.close()));
    }
}
//# sourceMappingURL=registry.js.map