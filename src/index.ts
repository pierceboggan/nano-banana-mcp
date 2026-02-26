#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Headshot style presets ───────────────────────────────────────────────────

interface StyleDetails {
  label: string;
  emoji: string;
  description: string;
  prompt: string;
}

const headshotStyles: Record<string, StyleDetails> = {
  professional: {
    label: "Professional Studio",
    emoji: "📸",
    description: "Polished corporate portrait with natural warmth.",
    prompt:
      "You are an experienced portrait retoucher. Create a clean, executive headshot of the provided person suitable for professional profiles. Maintain their identity, natural skin texture, and realistic clothing. Use soft studio lighting, a neutral blurred background, and a crisp professional finish. Do not add any text, logos, or decorative overlays.",
  },
  cinematic: {
    label: "Cinematic Spotlight",
    emoji: "🎬",
    description: "Dramatic movie lighting with rich depth.",
    prompt:
      "Reimagine the provided person as if captured on a cinematic movie set. Keep their likeness while adding dramatic lighting, shallow depth of field, and a refined wardrobe. Use moody backlighting, subtle film grain, and a dark gradient background. Do not add any text, logos, or on-screen graphics.",
  },
  editorial: {
    label: "Editorial Magazine",
    emoji: "📰",
    description: "Glossy magazine polish with bold posing.",
    prompt:
      "Create a high-end magazine editorial portrait of the uploaded person. Preserve their identity while enhancing styling with modern fashion details, crisp lighting, and a minimalist studio backdrop. Emphasize confident posing and art direction. Do not add any text, headlines, or cover callouts.",
  },
  artdeco: {
    label: "Art Deco Glam",
    emoji: "💎",
    description: "1920s-inspired glamour with geometric shine.",
    prompt:
      "Render the provided person with 1920s Art Deco glamour. Keep their facial features accurate while adding elegant hair styling, luxe attire, and geometric gold accents. Use warm studio lighting, a stylized backdrop, and subtle film grain. Do not add any text, typography, or signage.",
  },
  lifestyle: {
    label: "Outdoor Lifestyle",
    emoji: "🌿",
    description: "Golden-hour greenery with relaxed confidence.",
    prompt:
      "Produce a natural outdoor lifestyle headshot of the provided person. Maintain their likeness and natural complexion while placing them in softly blurred greenery or city park scenery at golden hour. Keep wardrobe casual-professional and lighting bright yet flattering. Do not add any text, logos, or signage.",
  },
  fantasy: {
    label: "Fantasy Royalty",
    emoji: "🪄",
    description: "Regal portrait with luminous magic accents.",
    prompt:
      "Transform the uploaded person into a majestic fantasy royal portrait. Preserve their identity while adding ornate wardrobe, soft magical lighting, and a cinematic, misty backdrop. Keep the finish elegant and painterly. Do not add any text, sigils, or runes.",
  },
  "80s": {
    label: "Retro 80s Neon",
    emoji: "🎶",
    description: "Big hair, neon lasers, and synthwave glow galore.",
    prompt:
      "Create a vibrant 1980s-inspired studio portrait of the uploaded person. Keep their facial structure and expression recognizable. Style the scene with neon gradients, laser beams, and glam lighting straight from an 80s mall studio session. Embrace bold colors, soft airbrushed finishes, and playful accessories that match the decade. Do not add any text, logos, or retro typography.",
  },
  vacation: {
    label: "Vacation Vibes",
    emoji: "🌴",
    description: "Sun-drenched postcards with tropical color pops.",
    prompt:
      "Turn the person in the reference image into a joyful vacation postcard portrait. Keep them instantly recognizable. Surround them with tropical sunlight, turquoise water, and lush greenery. Add playful wardrobe touches like breezy resort wear, sunglasses, or bright accessories. Capture relaxed happiness and saturated holiday colors. Do not add any text, postcards, or travel logos.",
  },
  "1800s": {
    label: "1800s Portrait",
    emoji: "🕰️",
    description: "Oil-painted charm with museum frame energy.",
    prompt:
      "Reimagine the provided person as an 1800s oil painting. Preserve their unique facial features and expression. Use painterly brush strokes, rich warm lighting, and a dramatic museum-style backdrop. Dress them in period-appropriate attire with ornate detailing, and finish the portrait with subtle canvas texture and vignette lighting. Do not add any signatures, plaques, or text.",
  },
  cyberpunk: {
    label: "Cyberpunk Glow",
    emoji: "🌌",
    description: "Holographic grit with neon city highlights.",
    prompt:
      "Render the uploaded person as a cinematic cyberpunk hero. Maintain their identity while giving them futuristic styling. Bathe the portrait in holographic lighting, neon reflections, and rainy city ambience. Incorporate high-tech wardrobe or accessories and dramatic contrast, as if captured in a neon-lit alleyway. Do not add any text, HUD elements, or holographic captions.",
  },
};

const HEADSHOT_STYLE_KEYS = Object.keys(headshotStyles);

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

/** Send a prompt (with optional reference image) to Gemini and extract generated images. */
async function callGemini(
  apiKey: string,
  prompt: string,
  referenceImage?: { base64: string; mimeType: string },
): Promise<{ images: GeneratedImage[]; text: string }> {
  const parts: ContentPart[] = [{ text: prompt }];
  if (referenceImage) {
    parts.push({ inlineData: { mimeType: referenceImage.mimeType, data: referenceImage.base64 } });
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

// ── Helper: resolve image input ──────────────────────────────────────────────

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

// ── Helper: resolve API key ──────────────────────────────────────────────────

function resolveApiKey(provided?: string): string | null {
  return provided || process.env.GOOGLE_API_KEY || null;
}

// ── Helper: save or return images ────────────────────────────────────────────

function saveImages(
  images: GeneratedImage[],
  outputDir: string,
  filenamePrefix: string,
): string[] {
  fs.mkdirSync(outputDir, { recursive: true });
  const savedPaths: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const ext = img.mimeType.split("/")[1] ?? "png";
    const filename = `${filenamePrefix}${images.length > 1 ? `-${i + 1}` : ""}.${ext}`;
    const filePath = path.join(outputDir, filename);
    fs.writeFileSync(filePath, Buffer.from(img.data, "base64"));
    savedPaths.push(filePath);
  }
  return savedPaths;
}

type ToolContent = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };

function buildImageResponse(
  images: GeneratedImage[],
  summaryText: string,
  outputDir?: string,
  filenamePrefix = "generated",
): { content: ToolContent[] } {
  if (outputDir) {
    const savedPaths = saveImages(images, outputDir, filenamePrefix);
    return {
      content: [
        { type: "text", text: `${summaryText}\nSaved to:\n${savedPaths.join("\n")}` },
      ],
    };
  }
  const content: ToolContent[] = [{ type: "text", text: summaryText }];
  for (const img of images) {
    content.push({ type: "image", data: img.data, mimeType: img.mimeType });
  }
  return { content };
}

const NO_KEY_ERROR = {
  isError: true as const,
  content: [
    { type: "text" as const, text: "No API key provided. Pass google_api_key or set GOOGLE_API_KEY environment variable." },
  ],
};

// ── MCP Server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "nano-banana",
  version: "1.0.0",
});

// ── Tool: generate_image (text-to-image) ─────────────────────────────────────

server.tool(
  "generate_image",
  "Generate an image from a text prompt using Google Gemini. Use this for creating images from scratch — app icons, illustrations, designs, concept art, logos, and more.",
  {
    prompt: z.string().describe("Detailed description of the image to generate"),
    google_api_key: z.string().optional().describe("Google AI Studio API key. Falls back to GOOGLE_API_KEY env var."),
    output_dir: z.string().optional().describe("Directory to save generated images. If omitted, images are returned inline."),
    output_name: z.string().default("generated").describe("Filename prefix for saved images (without extension)"),
  },
  async ({ prompt, google_api_key, output_dir, output_name }) => {
    const apiKey = resolveApiKey(google_api_key);
    if (!apiKey) return NO_KEY_ERROR;

    try {
      const { images, text } = await callGemini(apiKey, prompt);
      const summary = `🎨 Generated ${images.length} image(s).${text ? `\n${text}` : ""}`;
      return buildImageResponse(images, summary, output_dir, output_name);
    } catch (err) {
      return { isError: true, content: [{ type: "text" as const, text: `Generation failed: ${(err as Error).message}` }] };
    }
  },
);

// ── Tool: edit_image (image-to-image) ────────────────────────────────────────

server.tool(
  "edit_image",
  "Edit or transform an existing image using a text prompt and Google Gemini. Provide a reference image and describe the desired changes — restyle, recolor, add elements, convert formats, etc.",
  {
    image: z.string().describe("File path to the source image, data URL, or raw base64 image data"),
    prompt: z.string().describe("Instructions for how to edit or transform the image"),
    google_api_key: z.string().optional().describe("Google AI Studio API key. Falls back to GOOGLE_API_KEY env var."),
    output_dir: z.string().optional().describe("Directory to save generated images. If omitted, images are returned inline."),
    output_name: z.string().default("edited").describe("Filename prefix for saved images (without extension)"),
  },
  async ({ image, prompt, google_api_key, output_dir, output_name }) => {
    const apiKey = resolveApiKey(google_api_key);
    if (!apiKey) return NO_KEY_ERROR;

    const ref = resolveImage(image);

    try {
      const { images, text } = await callGemini(apiKey, prompt, ref);
      const summary = `✏️ Generated ${images.length} edited image(s).${text ? `\n${text}` : ""}`;
      return buildImageResponse(images, summary, output_dir, output_name);
    } catch (err) {
      return { isError: true, content: [{ type: "text" as const, text: `Edit failed: ${(err as Error).message}` }] };
    }
  },
);

// ── Tool: list_headshot_styles ───────────────────────────────────────────────

server.tool(
  "list_headshot_styles",
  "List all available preset headshot styles with descriptions. Use with generate_headshot for quick styled portraits.",
  {},
  async () => {
    const lines = HEADSHOT_STYLE_KEYS.map((key) => {
      const s = headshotStyles[key];
      return `${s.emoji} **${key}** — ${s.label}: ${s.description}`;
    });
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
);

// ── Tool: generate_headshot (preset-based portrait) ──────────────────────────

server.tool(
  "generate_headshot",
  "Generate a styled AI headshot from a photo using a preset style. Shortcut that combines edit_image with curated headshot prompts.",
  {
    image: z.string().describe("File path to the source photo, data URL, or raw base64 image data"),
    style: z
      .enum(HEADSHOT_STYLE_KEYS as [string, ...string[]])
      .default("professional")
      .describe("Headshot style preset to apply"),
    google_api_key: z.string().optional().describe("Google AI Studio API key. Falls back to GOOGLE_API_KEY env var."),
    output_dir: z.string().optional().describe("Directory to save generated images. If omitted, images are returned inline."),
  },
  async ({ image, style, google_api_key, output_dir }) => {
    const apiKey = resolveApiKey(google_api_key);
    if (!apiKey) return NO_KEY_ERROR;

    const ref = resolveImage(image);
    const details = headshotStyles[style] ?? headshotStyles.professional;

    try {
      const { images } = await callGemini(apiKey, details.prompt, ref);
      const summary = `${details.emoji} Generated ${images.length} ${details.label} headshot(s).`;
      return buildImageResponse(images, summary, output_dir, `headshot-${style}`);
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
