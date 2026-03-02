#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Gemini API helpers ───────────────────────────────────────────────────────

const MODEL_NAME = "gemini-3.1-flash-image-preview";
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
  const content: ToolContent[] = [{ type: "text", text: summary }];
  if (outputDir) {
    const saved = saveImages(images, outputDir, prefix);
    content[0] = { type: "text", text: `${summary}\nSaved to:\n${saved.join("\n")}` };
  }
  // Always include inline image data so MCP App can render them
  for (const img of images) {
    content.push({ type: "image", data: img.data, mimeType: img.mimeType });
  }
  return { content };
}

const NO_KEY_ERROR = {
  isError: true as const,
  content: [{ type: "text" as const, text: "No API key provided. Pass google_api_key or set GOOGLE_API_KEY environment variable." }],
};

// ── MCP App UI ───────────────────────────────────────────────────────────────

const APP_RESOURCE_URI = "ui://generate-image/app.html";

function buildImageViewerHtml(appSdkJs: string): string {
  // The bundle ends with ES module export syntax: export{..., _c as App, ...}
  // Extract the minified variable name for App to use directly in the same module scope.
  const appVarMatch = appSdkJs.match(/\bexport\{[^}]*\b(\w+)\s+as\s+App\b/);
  if (!appVarMatch) throw new Error("Could not find App export in ext-apps bundle");
  const appVar = appVarMatch[1];

  // Strip the export statement — we'll reference the class directly in the same module.
  const sdkCode = appSdkJs.replace(/export\{[^}]+\};\s*$/, "");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Generated Image</title>
  <style>
    body { margin: 0; padding: 16px; font-family: system-ui, sans-serif; background: #fff; color: #111; }
    #status { font-size: 14px; color: #666; margin-bottom: 12px; }
    #images { display: flex; flex-wrap: wrap; gap: 12px; }
    #images img { max-width: 100%; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,.15); }
    #caption { margin-top: 10px; font-size: 13px; color: #555; white-space: pre-wrap; }
    #error { color: #c00; font-size: 14px; }
  </style>
</head>
<body>
  <div id="status">✨ Generating image…</div>
  <div id="error" style="display:none"></div>
  <div id="images"></div>
  <div id="caption"></div>
  <script type="module">
${sdkCode}
const statusEl = document.getElementById("status");
const errorEl  = document.getElementById("error");
const imagesEl = document.getElementById("images");
const captionEl = document.getElementById("caption");

const app = new ${appVar}({ name: "Image Viewer", version: "1.0.0" });

app.ontoolresult = (result) => {
  statusEl.style.display = "none";
  if (result.isError) {
    const msg = result.content?.find(c => c.type === "text")?.text ?? "Unknown error";
    errorEl.textContent = "⚠️ " + msg;
    errorEl.style.display = "";
    return;
  }
  const imgs = (result.content ?? []).filter(c => c.type === "image");
  const text = (result.content ?? []).filter(c => c.type === "text").map(c => c.text).join("\\n").trim();
  if (text) captionEl.textContent = text;
  if (imgs.length === 0) {
    statusEl.textContent = text || "No image returned.";
    statusEl.style.display = "";
    return;
  }
  for (const img of imgs) {
    const el = document.createElement("img");
    el.src = \`data:\${img.mimeType};base64,\${img.data}\`;
    el.alt = "Generated image";
    imagesEl.appendChild(el);
  }
};

app.connect().catch(err => {
  statusEl.textContent = "⚠️ " + (err?.message ?? String(err));
  statusEl.style.display = "";
});
  </script>
</body>
</html>`;
}

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "nano-banana",
  version: "1.0.0",
});

registerAppTool(
  server,
  "generate_image",
  {
    title: "Generate Image",
    description: "Generate or edit images using Google Gemini. Provide a text prompt describing what you want. Optionally include one or more reference images to inform the output (e.g. edit a photo, restyle an icon, combine references).",
    inputSchema: {
      prompt: z.string().describe("Text prompt describing the image to generate or how to edit the reference image(s)"),
      images: z
        .array(z.string())
        .optional()
        .describe("Optional reference images — file paths, data URLs, or raw base64 strings. The model uses these to inform the output."),
      google_api_key: z.string().optional().describe("Google AI Studio API key. Falls back to GOOGLE_API_KEY env var."),
      output_dir: z.string().optional().describe("Directory to save generated images. If omitted, images are returned inline."),
      output_name: z.string().default("generated").describe("Filename prefix for saved images (without extension)"),
    },
    _meta: { ui: { resourceUri: APP_RESOURCE_URI } },
  },
  async ({ prompt, images, google_api_key, output_dir, output_name }: {
    prompt: string;
    images?: string[];
    google_api_key?: string;
    output_dir?: string;
    output_name: string;
  }) => {
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

registerAppResource(
  server,
  APP_RESOURCE_URI,
  APP_RESOURCE_URI,
  { mimeType: RESOURCE_MIME_TYPE },
  async () => {
    const sdkPath = new URL("../node_modules/@modelcontextprotocol/ext-apps/dist/src/app-with-deps.js", import.meta.url);
    const appSdkJs = fs.readFileSync(sdkPath, "utf-8");
    const html = buildImageViewerHtml(appSdkJs);
    return {
      contents: [{ uri: APP_RESOURCE_URI, mimeType: RESOURCE_MIME_TYPE, text: html }],
    };
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
