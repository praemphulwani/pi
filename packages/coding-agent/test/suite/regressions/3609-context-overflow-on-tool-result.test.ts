import assert from "node:assert";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { describe, it } from "vitest";
import { createHarness } from "../harness.ts";

describe("3609: Context overflow on tool result", () => {
	it("should trigger compaction when a large toolResult is added", async () => {
		const contextWindow = 100;
		const largeText = "a".repeat(150);
		const largeTool: AgentTool = {
			name: "large-tool",
			description: "A tool that returns a lot of text",
			label: "large-tool",
			parameters: {
				type: "object",
				properties: {},
			},
			execute: async () => {
				return {
					content: [{ type: "text", text: largeText }],
					details: { exitCode: 0 },
				} as any;
			},
		};

		const harness = await createHarness({
			models: [
				{
					id: "test-model",
					name: "Test Model",
					contextWindow,
					maxTokens: 50,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				},
			],
			tools: [largeTool],
		});

		try {
			// Setup responses:
			// 1. Assistant calls the tool
			// 2. Assistant responds after tool call
			harness.setResponses([
				fauxAssistantMessage(
					[fauxText("I will use the tool."), fauxToolCall("large-tool", { some_arg: "value" }, { id: "call_1" })],
					{ stopReason: "stop" },
				),
				fauxAssistantMessage("The tool returned a lot of text."),
			]);

			// Start conversation
			await harness.session.sendUserMessage("Use large-tool");

			// Verify compaction occurred
			const entries = harness.sessionManager.getEntries();
			const hasCompaction = entries.some((e) => e.type === "compaction");

			assert.strictEqual(hasCompaction, true, "Compaction should have been triggered by toolResult");
			assert.ok(harness.eventsOfType("compaction_end").length > 0, "Should have emitted compaction_end event");
		} finally {
			harness.cleanup();
		}
	});
});
