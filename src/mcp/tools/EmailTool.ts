import { ToolDefinition, ToolContext, ToolResult, SendEmailSchema, SendEmailParams, EmailResult } from '../../types/tools';

  /**
   * Send an email using PostMarkApp API
   */
  export const sendEmailTool: ToolDefinition = {
    name: 'sendEmail',
    description: 'Send a transactional email via PostMarkApp',
    parameters: SendEmailSchema,
    async execute(params: SendEmailParams, context: ToolContext): Promise<ToolResult> {
      try {
        const { to, subject, textBody, htmlBody } = params;
        const apiKey = context.env.POSTMARK_API_KEY;
        const fromEmail = context.env.POSTMARK_FROM_EMAIL;

        if (!apiKey || !fromEmail) {
          return {
            success: false,
            error: 'PostMark API credentials not configured',
          };
        }

        // Security: Rate limiting - 10 emails per hour per user
        if (!context.agent.checkRateLimit(context.userId, 'email', 10, 3600000)) {
          return {
            success: false,
            error: 'Rate limit exceeded. You can send up to 10 emails per hour. Please try again later.',
          };
        }

        // Security: Spam prevention - validate subject length (max 200 chars)
        if (subject.length > 200) {
          return {
            success: false,
            error: 'Email subject too long (max 200 characters)',
          };
        }

        // Security: Spam prevention - validate body length (max 10KB)
        const MAX_BODY_LENGTH = 10 * 1024;
        if (textBody.length > MAX_BODY_LENGTH) {
          return {
            success: false,
            error: `Email body too long (max ${MAX_BODY_LENGTH} characters)`,
          };
        }

        // Security: Strip all HTML from htmlBody to prevent XSS attacks
        let sanitizedHtmlBody: string | undefined = undefined;
        if (htmlBody) {
          // Remove all HTML tags (simple but effective for security)
          sanitizedHtmlBody = htmlBody.replace(/<[^>]*>/g, '');

          // Also validate sanitized HTML length
          if (sanitizedHtmlBody.length > MAX_BODY_LENGTH) {
            return {
              success: false,
              error: `Email HTML body too long (max ${MAX_BODY_LENGTH} characters)`,
            };
          }
        }

        // Call PostMark API
        const response = await fetch('https://api.postmarkapp.com/email', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Postmark-Server-Token': apiKey,
          },
          body: JSON.stringify({
            From: fromEmail,
            To: to,
            Subject: subject,
            TextBody: textBody,
            HtmlBody: sanitizedHtmlBody, // Use sanitized HTML (all tags stripped)
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})) as any;
          return {
            success: false,
            error: errorData.Message || `Email API error: ${response.status}`,
          };
        }

        const data = await response.json() as any;

        // Transform API response to EmailResult interface
        const emailResult: EmailResult = {
          messageId: data.MessageID,
          to: data.To,
          submittedAt: data.SubmittedAt,
        };

        // Record successful email send for rate limiting
        context.agent.recordRateLimitCall(context.userId, 'email');

        return {
          success: true,
          data: emailResult,
          message: `Email sent to ${to}`,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message || 'Failed to send email',
        };
      }
    },
  };