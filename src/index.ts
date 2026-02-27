#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Gemini API helpers ───────────────────────────────────────────────────────

const MODEL_NAME = "gemini-2.5-flash-preview-image-generation";
const GENERATE_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

interface ContentPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface ContentCandidate {
  content?: { parts?: ContentPart[] };
}

interface GenerateContentResponse {
  candidates?: ContentCandidate[];
  promptFeedback?: { blockReason?: string };
  error?: { message?: string };
}

interface GeneratedImage {
  mimeType: string;
  data: string;
}

async function callGemini(
  apiKey: string,
  prompt: string,
  referenceImages: { base64: string; mimeType: string }[],
): Promise<{ images: GeneratedImage[]; text: string }> {
  const parts: ContentPart[] = [{ text: prompt }];
  for (const ref of referenceImages) {
    parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.base64 } });
  }

  const response = await fetch(
    `${GENERATE_ENDPOINT}/${MODEL_NAME}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["Text", "Image"],
          temperature: 0.95,
          topP: 0.9,
        },
      }),
    },
  );

  let payload: GenerateContentResponse | null = null;

  if (!response.ok) {
    try {
      payload = (await response.json()) as GenerateContentResponse;
    } catch {
      // ignore parse errors
    }
    const message = payload?.error?.message ?? `Generation failed with status ${response.status}.`;
    throw new Error(message);
  }

  payload = (await response.json()) as GenerateContentResponse;

  const allParts = (payload.candidates ?? []).flatMap((c) => c.content?.parts ?? []);

  const images = allParts
    .filter((p): p is { inlineData: { mimeType: string; data: string } } =>
      Boolean(p.inlineData?.data),
    )
    .map((p) => ({ mimeType: p.inlineData.mimeType, data: p.inlineData.data }));

  const text = allParts
    .filter((p): p is { text: string } => typeof p.text === "string")
    .map((p) => p.text)
    .join("\n")
    .trim();

  if (!images.length) {
    const blockReason = payload.promptFeedback?.blockReason;
    if (blockReason) throw new Error(`Generation blocked: ${blockReason}.`);
    throw new Error("The Gemini API did not return any images. " + (text || ""));
  }

  return { images, text };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveImage(input: string): { base64: string; mimeType: string } {
  if (fs.existsSync(input)) {
    const ext = path.extname(input).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif",
    };
    const mimeType = mimeMap[ext] ?? "image/jpeg";
    const base64 = fs.readFileSync(input, "base64");
    return { base64, mimeType };
  }

  if (input.startsWith("data:")) {
    const match = input.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return { mimeType: match[1], base64: match[2] };
    }
  }

  return { base64: input, mimeType: "image/jpeg" };
}

function resolveApiKey(provided?: string): string | null {
  return provided || process.env.GOOGLE_API_KEY || null;
}

type ToolContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

function saveImages(images: GeneratedImage[], outputDir: string, prefix: string): string[] {
  fs.mkdirSync(outputDir, { recursive: true });
  const paths: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const ext = img.mimeType.split("/")[1] ?? "png";
    const filename = `${prefix}${images.length > 1 ? `-${i + 1}` : ""}.${ext}`;
    const filePath = path.join(outputDir, filename);
    fs.writeFileSync(filePath, Buffer.from(img.data, "base64"));
    paths.push(filePath);
  }
  return paths;
}

function buildResponse(
  images: GeneratedImage[],
  summary: string,
  outputDir?: string,
  prefix = "generated",
): { content: ToolContent[] } {
  if (outputDir) {
    const saved = saveImages(images, outputDir, prefix);
    return { content: [{ type: "text", text: `${summary}\nSaved to:\n${saved.join("\n")}` }] };
  }
  const content: ToolContent[] = [{ type: "text", text: summary }];
  for (const img of images) {
    content.push({ type: "image", data: img.data, mimeType: img.mimeType });
  }
  return { content };
}

const NO_KEY_ERROR = {
  isError: true as const,
  content: [{ type: "text" as const, text: "No API key provided. Pass google_api_key or set GOOGLE_API_KEY environment variable." }],
};

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "nano-banana",
  version: "1.0.0",
});

server.tool(
  "generate_image",
  "Generate or edit images using Google Gemini. Provide a text prompt describing what you want. Optionally include one or more reference images to inform the output (e.g. edit a photo, restyle an icon, combine references).",
  {
    prompt: z.string().describe("Text prompt describing the image to generate or how to edit the reference image(s)"),
    images: z
      .array(z.string())
      .optional()
      .describe("Optional reference images — file paths, data URLs, or raw base64 strings. The model uses these to inform the output."),
    google_api_key: z.string().optional().describe("Google AI Studio API key. Falls back to GOOGLE_API_KEY env var."),
    output_dir: z.string().optional().describe("Directory to save generated images. If omitted, images are returned inline."),
    output_name: z.string().default("generated").describe("Filename prefix for saved images (without extension)"),
  },
  async ({ prompt, images, google_api_key, output_dir, output_name }) => {
    const apiKey = resolveApiKey(google_api_key);
    if (!apiKey) return NO_KEY_ERROR;

    const refs = (images ?? []).map(resolveImage);

    try {
      const result = await callGemini(apiKey, prompt, refs);
      const summary = `🎨 Generated ${result.images.length} image(s).${result.text ? `\n${result.text}` : ""}`;
      return buildResponse(result.images, summary, output_dir, output_name);
    } catch (err) {
      return { isError: true, content: [{ type: "text" as const, text: `Generation failed: ${(err as Error).message}` }] };
    }
  },
);

// ── Start ────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
