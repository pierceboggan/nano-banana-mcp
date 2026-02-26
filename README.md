# nano-banana-mcp

An MCP (Model Context Protocol) server that generates AI headshots using Google Gemini. Use it from VS Code agent mode, Claude Desktop, or any MCP-compatible client.

## Quick start

```bash
npm install
npm run build
```

## Tools

| Tool | Description |
|------|-------------|
| `list_styles` | List all available headshot styles (professional, cinematic, editorial, etc.) |
| `generate_headshot` | Generate an AI headshot from a photo using a chosen style |

### generate_headshot parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `image` | ✅ | File path, data URL, or raw base64 image data |
| `style` | | Style to apply (default: `professional`). Run `list_styles` for options. |
| `google_api_key` | | Google AI Studio API key. Falls back to `GOOGLE_API_KEY` env var. |
| `output_dir` | | Directory to save images. If omitted, images are returned inline. |

## VS Code configuration

Add to your `.vscode/settings.json` (or user settings):

```json
{
  "mcp": {
    "servers": {
      "nano-banana-headshot": {
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

Then in VS Code agent mode, ask something like:
> Generate a cyberpunk headshot from ~/selfie.jpg

## Claude Desktop configuration

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "nano-banana-headshot": {
      "command": "node",
      "args": ["<path-to-this-repo>/dist/index.js"],
      "env": {
        "GOOGLE_API_KEY": "your-google-api-key"
      }
    }
  }
}
```

## Available styles

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
