import test from "node:test";
import assert from "node:assert/strict";
import { GivingService } from "../packages/server/dist/service.js";
import { ProviderRegistry } from "../packages/registry/dist/index.js";
import {
  createGivingTools,
  givingToolDefinition,
} from "../packages/server/dist/tools.js";

const principal = {
  id: "guest",
  clientId: "fictional-agent",
  scopes: ["opportunities:read"],
};

test("existing MCP servers can embed scoped tools without a second transport", async () => {
  const tools = createGivingTools(
    new GivingService(new ProviderRegistry([])),
    principal,
    "catalog-test",
  );
  assert.ok(!tools.some((tool) => tool.name === "prepare_checkout"));
  const tool = tools.find((tool) => tool.name === "list_providers");
  const definition = givingToolDefinition(tool);
  assert.equal(definition.inputSchema.type, "object");
  assert.equal(definition.annotations.readOnlyHint, true);
  assert.equal("call" in definition, false);
  const result = await tool.call({});
  assert.deepEqual(result.structuredContent, { providers: [] });
  assert.equal(result.isError, undefined);
});

test("tool errors do not masquerade as success-shaped structured content", async () => {
  const tools = createGivingTools(
    new GivingService(new ProviderRegistry([])),
    principal,
    "catalog-test",
  );
  const result = await tools
    .find((tool) => tool.name === "list_providers")
    .call({ approved: true });
  assert.equal(result.isError, true);
  // Older official MCP clients validate structuredContent against outputSchema
  // even for an error. Text errors work across those clients and newer servers.
  assert.equal("structuredContent" in result, false);
  const error = JSON.parse(result.content[0].text).error;
  assert.equal(error.code, "invalid_request");
  assert.equal(error.requestId, "catalog-test");
});
