import { Injectable, Logger } from '@nestjs/common';
import {
  customers,
  tickets,
  orders,
  nextTicketId,
  type Ticket,
} from './mock-data';

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  summary: string;
  /** If true, signals the call should end after this turn (e.g. transfer_to_human). */
  endsCall?: boolean;
}

type ToolHandler = (args: Record<string, unknown>) => ToolResult;

@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);
  private readonly handlers = new Map<string, ToolHandler>();

  constructor() {
    this.register('lookup_customer', this.lookupCustomer);
    this.register('list_recent_tickets', this.listRecentTickets);
    this.register('create_ticket', this.createTicket);
    this.register('get_order_status', this.getOrderStatus);
    this.register('transfer_to_human', this.transferToHuman);
  }

  private register(name: string, handler: ToolHandler): void {
    this.handlers.set(name, handler.bind(this));
  }

  invoke(name: string, args: Record<string, unknown>): ToolResult {
    const handler = this.handlers.get(name);
    if (!handler) {
      this.logger.warn(`Unknown tool: ${name}`);
      return { ok: false, summary: `Unknown tool: ${name}` };
    }
    try {
      return handler(args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      this.logger.error(`Tool ${name} threw: ${msg}`);
      return { ok: false, summary: `Tool ${name} failed: ${msg}` };
    }
  }

  private lookupCustomer(args: Record<string, unknown>): ToolResult {
    const phone = String(args.phone ?? '').replace(/\s|-/g, '');
    const found = customers.find(
      (c) => c.phone.replace(/\s|-/g, '') === phone,
    );
    if (!found) {
      return {
        ok: true,
        data: null,
        summary: `No customer found for ${args.phone}`,
      };
    }
    return {
      ok: true,
      data: found,
      summary: `Customer ${found.name} (${found.plan}), since ${found.joinedAt}`,
    };
  }

  private listRecentTickets(args: Record<string, unknown>): ToolResult {
    const customerId = String(args.customer_id ?? '');
    const matched = tickets
      .filter((t) => t.customerId === customerId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 5);
    return {
      ok: true,
      data: matched,
      summary:
        matched.length === 0
          ? 'No tickets on file'
          : `${matched.length} ticket(s): ${matched
              .map((t) => `${t.id} (${t.status})`)
              .join(', ')}`,
    };
  }

  private createTicket(args: Record<string, unknown>): ToolResult {
    const customerId = String(args.customer_id ?? '');
    const subject = String(args.subject ?? '').slice(0, 200);
    const description = String(args.description ?? '').slice(0, 2000);
    const priority = String(args.priority ?? 'medium') as Ticket['priority'];
    if (!customerId || !subject) {
      return {
        ok: false,
        summary: 'create_ticket requires customer_id and subject',
      };
    }
    const ticket: Ticket = {
      id: nextTicketId(),
      customerId,
      subject,
      description,
      status: 'open',
      priority,
      createdAt: new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString().slice(0, 10),
    };
    tickets.push(ticket);
    return {
      ok: true,
      data: ticket,
      summary: `Ticket ${ticket.id} created (${priority})`,
    };
  }

  private getOrderStatus(args: Record<string, unknown>): ToolResult {
    const orderId = String(args.order_id ?? '');
    const found = orders.find((o) => o.id === orderId);
    if (!found) {
      return { ok: true, data: null, summary: `Order ${orderId} not found` };
    }
    return {
      ok: true,
      data: found,
      summary: `Order ${found.id}: ${found.status}${
        found.trackingId ? ` (tracking ${found.trackingId})` : ''
      }`,
    };
  }

  private transferToHuman(args: Record<string, unknown>): ToolResult {
    const reason = String(args.reason ?? 'unspecified');
    const summary = String(args.summary ?? '');
    const urgency = String(args.urgency ?? 'normal');
    return {
      ok: true,
      data: { reason, summary, urgency, queuePosition: 3 },
      summary: `Transferring to a human agent — reason: ${reason}, urgency: ${urgency}`,
      endsCall: true,
    };
  }
}
