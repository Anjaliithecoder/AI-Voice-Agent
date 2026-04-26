/**
 * OpenAI-compatible function-calling schemas for the tools the LLM can invoke.
 * These mirror the handlers in tool-registry.service.ts.
 */
export const TOOL_SCHEMAS = [
  {
    type: 'function' as const,
    function: {
      name: 'lookup_customer',
      description:
        'Look up a customer record by phone number. Returns customer info or null if not found.',
      parameters: {
        type: 'object',
        properties: {
          phone: {
            type: 'string',
            description:
              'Customer phone number, e.g. +91-98765-43210. Whitespace and dashes are tolerated.',
          },
        },
        required: ['phone'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_recent_tickets',
      description:
        'List up to 5 most recent support tickets for a customer, sorted by last update.',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: 'Customer id, e.g. cust_001' },
        },
        required: ['customer_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_ticket',
      description: 'Create a new support ticket for a customer.',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string' },
          subject: { type: 'string', description: 'One-line summary' },
          description: { type: 'string', description: 'Full details' },
          priority: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'urgent'],
            description: 'Default to medium if unsure',
          },
        },
        required: ['customer_id', 'subject', 'description', 'priority'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_order_status',
      description: 'Get the current status of an order by its order id.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'string', description: 'e.g. ORD-5521' },
        },
        required: ['order_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'transfer_to_human',
      description:
        'Transfer the call to a human agent. Use only when you cannot resolve the issue or escalation is required. This ends the AI call.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Why escalating' },
          summary: { type: 'string', description: 'Brief summary for the human agent' },
          urgency: {
            type: 'string',
            enum: ['low', 'normal', 'high', 'urgent'],
          },
        },
        required: ['reason', 'summary', 'urgency'],
      },
    },
  },
];
