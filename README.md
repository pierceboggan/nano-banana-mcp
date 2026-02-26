# nano-banana-mcp

An MCP (Model Context Protocol) server for AI image generation using Google Gemini. Generate images from text prompts, edit existing images, or create styled headshots — all from VS Code agent mode, Claude Desktop, or any MCP client.

## Quick start

```bash
npm install
npm run build
```

## Tools

| Tool | Description |
|------|-------------|
| `generate_image` | Generate an image from a text prompt (app icons, illustrations, designs, logos, concept art…) |
| `edit_image` | Edit or transform an existing image with a text prompt (restyle, recolor, add elements…) |
| `list_headshot_styles` | List preset headshot style options |
| `generate_headshot` | Generate a styled portrait from a photo using a preset |

### generate_image

| Parameter | Required | Description |
|-----------|----------|-------------|
| `prompt` | ✅ | Detailed description of the image to generate |
| `google_api_key` | | Google AI Studio API key (falls back to `GOOGLE_API_KEY` env var) |
| `output_dir` | | Directory to save images; if omitted, returned inline |
| `output_name` | | Filename prefix (default: `generated`) |

### edit_image

| Parameter | Required | Description |
|-----------|----------|-------------|
| `image` | ✅ | File path, data URL, or raw base64 image data |
| `prompt` | ✅ | Instructions for how to edit or transform the image |
| `google_api_key` | | Google AI Studio API key |
| `output_dir` | | Directory to save images |
| `output_name` | | Filename prefix (default: `edited`) |

### generate_headshot

| Parameter | Required | Description |
|-----------|----------|-------------|
| `image` | ✅ | File path, data URL, or raw base64 image data |
| `style` | | Style preset (default: `professional`). Run `list_headshot_styles` for options. |
| `google_api_key` | | Google AI Studio API key |
| `output_dir` | | Directory to save images |

## VS Code configuration

Add to your `.vscode/settings.json` (or user settings):

```json
{
  "mcp": {
    "servers": {
      "nano-banana": {
        "type": "stdio",
        "command": "node",
        "args": ["<path-to-this-repo>/dist/index.js"],
        "env": {
          "GOOGLE_API_KEY": "your-google-api-key"
        }
      }
    }
  }
}
```

Example prompts in agent mode:
> Design a minimalist app icon for a weather app
> Edit ~/logo.png to use a blue and purple gradient
> Generate a cyberpunk headshot from ~/selfie.jpg

## Claude Desktop configuration

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "nano-banana": {
      "command": "node",
      "args": ["<path-to-this-repo>/dist/index.js"],
      "env": {
        "GOOGLE_API_KEY": "your-google-api-key"
      }
    }
  }
}
```

## Headshot style presets

- 📸 **professional** — Polished corporate portrait
- 🎬 **cinematic** — Dramatic movie lighting
- 📰 **editorial** — Glossy magazine polish
- 💎 **artdeco** — 1920s glamour
- 🌿 **lifestyle** — Golden-hour outdoor
- 🪄 **fantasy** — Regal fantasy portrait
- 🎶 **80s** — Retro neon synthwave
- 🌴 **vacation** — Tropical vibes
- 🕰️ **1800s** — Oil-painted portrait
- 🌌 **cyberpunk** — Holographic neon grit

## Development

```bash
npm run dev    # Run with tsx (no build step)
npm run build  # Compile TypeScript
npm start      # Run compiled output
```
An MCP server for generating images.
