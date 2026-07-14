import { describe, expect, it } from "vitest";
import { catalogWithLocalOllamaModels, fetchOllamaModelNames } from "./settings.js";

describe("settings model catalog", () => {
  it("reads installed Ollama model names from /api/tags", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ models: [{ name: "llama3.2:latest" }, { model: "qwen2.5:latest" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    await expect(fetchOllamaModelNames(fetchImpl)).resolves.toEqual(["llama3.2:latest", "qwen2.5:latest"]);
  });

  it("adds local Ollama models to the dashboard catalog", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ models: [{ name: "mistral:latest" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    const catalog = await catalogWithLocalOllamaModels(fetchImpl);
    const ollama = catalog.providers.find((p) => p.id === "ollama");
    expect(ollama?.models[0]).toBe("mistral:latest");
    expect(ollama?.models).toContain("llama3");
  });
});
