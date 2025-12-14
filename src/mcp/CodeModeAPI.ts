import { ALL_TOOLS } from "./tools/index";
import { ToolDefinition } from "../types/tools";

/**
 * Tool Documentation Generator
 *
 * Generates tool documentation for the LLM system prompt
 */
export class ToolDocumentation {
  /**
   * Generate tool documentation for LLM prompt
   *
   * This creates documentation showing all available tools
   * and their parameters in JSON format
   */
  static generateToolDocs(): string {
    const docs = ALL_TOOLS.map(tool => {
      const paramsExample = this.generateParamsExample(tool);

      return `
### ${tool.name}
${tool.description}

Parameters: ${this.formatSchema(tool.parameters)}

Example:
\`\`\`json
{
  "tool": "${tool.name}",
  "params": ${paramsExample}
}
\`\`\`
      `;
    }).join('\n');

    return `
${docs}

## Important Notes:
- All tool calls require user confirmation before execution
- Parameters are validated using Zod schemas
- Invalid parameters will result in execution failure
- Only use tools when necessary to fulfill the user's request
    `;
  }

  /**
   * Generate example parameters for a tool
   */
  private static generateParamsExample(tool: ToolDefinition): string {
    // Generate simple example based on tool name
    switch (tool.name) {
      case 'createTask':
        return `{
    "title": "Example task",
    "priority": "medium"
  }`;
      case 'listTasks':
        return `{
    "filter": "pending"
  }`;
      case 'updateTask':
        return `{
    "taskId": "task-id-here",
    "updates": {
      "title": "Updated title"
    }
  }`;
      case 'completeTask':
        return `{
    "taskId": "task-id-here"
  }`;
      case 'deleteTask':
        return `{
    "taskId": "task-id-here"
  }`;
      case 'getWeather':
        return `{
    "city": "London",
    "countryCode": "GB"
  }`;
      case 'sendEmail':
        return `{
    "to": "user@example.com",
    "subject": "Subject",
    "textBody": "Email message body text here"
  }`;
      default:
        return `{}`;
    }
  }

  /**
   * Format Zod schema as a simple string description
   */
  private static formatSchema(schema: any): string {
    // Simple description - in production you might want to introspect the Zod schema
    return "See example for required/optional parameters";
  }

  /**
   * Get list of all tool names
   */
  static getToolNames(): string[] {
    return ALL_TOOLS.map(tool => tool.name);
  }

  /**
   * Get detailed tool information for a specific tool
   */
  static getToolInfo(toolName: string): ToolDefinition | undefined {
    return ALL_TOOLS.find(tool => tool.name === toolName);
  }
}

/**
 * Helper function for generating tool documentation
 * Used in the LLM system prompt
 */
export function generateToolDocs(): string {
  return ToolDocumentation.generateToolDocs();
}
