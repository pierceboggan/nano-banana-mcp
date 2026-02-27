# nano-banana-mcp

An MCP (Model Context Protocol) server for AI image generation using Google Gemini. Generate images from text prompts and optionally provide reference images to inform the output. Use it from VS Code agent mode, Claude Desktop, or any MCP client.

## Quick start

```bash
npm install
npm run build
```

## Tool: `generate_image`

A single, flexible tool that handles all image generation — from scratch or informed by reference images.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `prompt` | ✅ | Text prompt describing what to generate or how to transform the input |
| `images` | | Optional array of reference images (file paths, data URLs, or base64 strings) to inform the output |
| `google_api_key` | | Google AI Studio API key (falls back to `GOOGLE_API_KEY` env var) |
| `output_dir` | | Directory to save images; if omitted, returned inline |
| `output_name` | | Filename prefix (default: `generated`) |

### Examples

- **From scratch:** `prompt: "A minimalist app icon for a weather app, flat design, blue gradient"`
- **Edit an image:** `prompt: "Change the background to a sunset", images: ["./photo.jpg"]`
- **Combine references:** `prompt: "Merge these two logo concepts into one", images: ["./logo1.png", "./logo2.png"]`

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

## Development

```bash
npm run dev    # Run with tsx (no build step)
npm run build  # Compile TypeScript
npm start      # Run compiled output
```
An MCP server for generating images.
