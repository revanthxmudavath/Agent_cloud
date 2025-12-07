# Agent Cloud - AI Personal Assistant

An AI-powered personal assistant built on Cloudflare's platform, featuring:
- Real-time chat interface with WebSockets
- Multi-layer memory (session, persistent, semantic)
- Task management and reminders
- RAG-powered knowledge retrieval
- JSON-based tool calling with user confirmation
- External API integrations (Weather, Email)

## Architecture

- **Frontend**: Cloudflare Pages + React + WebSockets
- **Backend**: Agents SDK + Durable Objects
- **LLM**: Workers AI (Llama 3.3 70B fp8-fast)
- **Memory**: Durable Objects (session) + D1 (persistent) + Vectorize (semantic)
- **Orchestration**: Cloudflare Workflows
- **Tool Calling**: Pre-compilation JSON-based with Zod validation
- **External APIs**: OpenWeatherMap, PostMarkApp

## Tool Calling Flow

The assistant can perform actions through a confirmation-based tool calling system:

```
User: "Create a task for groceries"
  ↓
LLM generates JSON tool call:
  {
    "tool": "createTask",
    "params": { "title": "Buy groceries" }
  }
  ↓
User receives confirmation request via WebSocket
  ↓
User approves → Tool executes → Task created in D1
```

**Available Tools:**
- Task management: `createTask`, `listTasks`, `updateTask`, `completeTask`, `deleteTask`
- Weather lookup: `getWeather` (OpenWeatherMap API)
- Email sending: `sendEmail` (PostMarkApp API)

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Login to Cloudflare

```bash
npx wrangler login
```

### 3. Create D1 Database

```bash
npx wrangler d1 create agent-db
```

Copy the database ID and update `wrangler.toml`:
```toml
database_id = "YOUR_DATABASE_ID_HERE"
```

### 4. Run Migrations

```bash
npm run d1:migrate
```

Or for local development:
```bash
npm run d1:local
```

### 5. Create Vectorize Index

```bash
npm run vectorize:create
```

### 6. Create AI Gateway

```bash
npx wrangler ai-gateway create agent-gateway
```

### 7. Configure API Keys (Optional)

For external tool functionality, create a `.dev.vars` file:

```bash
# OpenWeatherMap API (for weather lookup tool)
OPENWEATHER_API_KEY=your-key-here

# PostMarkApp API (for email sending tool)
POSTMARK_API_KEY=your-key-here
POSTMARK_FROM_EMAIL=noreply@yourdomain.com
```

**Get API Keys:**
- OpenWeatherMap: https://home.openweathermap.org/api_keys
- PostMarkApp: https://account.postmarkapp.com/servers

> Note: The assistant works without API keys, but weather and email tools will be unavailable.

### 8. Run Development Server

```bash
npm run dev
```

## Project Structure

```
agent-cloud/
├── src/
│   ├── agent/              # Agent logic
│   │   ├── PersonalAssistant.ts    # Durable Object agent
│   │   ├── memory.ts               # Memory management & context building
│   │   └── vectorize.ts            # Semantic search & embeddings
│   ├── mcp/                # MCP tools & confirmation
│   │   ├── tools/
│   │   │   ├── TaskTools.ts        # Task CRUD operations
│   │   │   ├── WeatherTool.ts      # OpenWeatherMap integration
│   │   │   ├── EmailTool.ts        # PostMarkApp integration
│   │   │   └── index.ts            # Tool registry
│   │   ├── CodeModeAPI.ts          # Tool documentation generator
│   │   └── ConfirmationHandler.ts  # User confirmation system
│   ├── workflows/          # Workflow definitions
│   │   └── TaskWorkflow.ts         # Multi-step task orchestration
│   ├── types/              # TypeScript types
│   │   ├── env.d.ts               # Cloudflare bindings
│   │   └── tools.ts               # Tool & MCP types
│   └── index.ts            # Worker entry point
├── frontend/               # React frontend (Phase 5)
├── migrations/             # D1 migrations
├── tests/                  # Integration tests
├── wrangler.toml          # Cloudflare config
├── schema.sql             # Database schema
└── .dev.vars              # Local API keys (gitignored)
```

## Development

- `npm run dev` - Start development server
- `npm run deploy` - Deploy to Cloudflare
- `npm run d1:migrate` - Run database migrations

