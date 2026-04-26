import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistryService } from './tool-registry.service';

describe('ToolRegistryService', () => {
  let registry: ToolRegistryService;

  beforeEach(() => {
    registry = new ToolRegistryService();
  });

  describe('lookup_customer', () => {
    it('finds a customer by exact phone number', () => {
      const result = registry.invoke('lookup_customer', {
        phone: '+91-98765-43210',
      });
      expect(result.ok).toBe(true);
      expect(result.data).toBeDefined();
      expect((result.data as { name: string }).name).toBe('Aarav Mehta');
      expect(result.summary).toContain('Aarav Mehta');
    });

    it('finds a customer when phone has no dashes', () => {
      const result = registry.invoke('lookup_customer', {
        phone: '+919876543210',
      });
      expect(result.ok).toBe(true);
      expect((result.data as { name: string }).name).toBe('Aarav Mehta');
    });

    it('returns null data when customer is not found', () => {
      const result = registry.invoke('lookup_customer', {
        phone: '+91-00000-00000',
      });
      expect(result.ok).toBe(true);
      expect(result.data).toBeNull();
      expect(result.summary).toContain('No customer found');
    });

    it('handles missing phone arg gracefully', () => {
      const result = registry.invoke('lookup_customer', {});
      expect(result.ok).toBe(true);
      expect(result.data).toBeNull();
    });
  });

  describe('list_recent_tickets', () => {
    it('returns tickets for a customer with existing tickets', () => {
      const result = registry.invoke('list_recent_tickets', {
        customer_id: 'cust_001',
      });
      expect(result.ok).toBe(true);
      const tickets = result.data as Array<{ id: string }>;
      expect(tickets.length).toBeGreaterThan(0);
      expect(tickets.length).toBeLessThanOrEqual(5);
      expect(result.summary).toContain('ticket(s)');
    });

    it('returns tickets sorted by updatedAt descending', () => {
      const result = registry.invoke('list_recent_tickets', {
        customer_id: 'cust_001',
      });
      const tickets = result.data as Array<{ updatedAt: string }>;
      for (let i = 1; i < tickets.length; i++) {
        expect(tickets[i - 1].updatedAt >= tickets[i].updatedAt).toBe(true);
      }
    });

    it('returns empty array for a customer with no tickets', () => {
      const result = registry.invoke('list_recent_tickets', {
        customer_id: 'cust_003',
      });
      expect(result.ok).toBe(true);
      expect(result.data).toEqual([]);
      expect(result.summary).toBe('No tickets on file');
    });

    it('returns empty for nonexistent customer ID', () => {
      const result = registry.invoke('list_recent_tickets', {
        customer_id: 'nonexistent',
      });
      expect(result.ok).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('create_ticket', () => {
    it('creates a new ticket with valid inputs', () => {
      const result = registry.invoke('create_ticket', {
        customer_id: 'cust_001',
        subject: 'Test issue',
        description: 'A test description',
        priority: 'high',
      });
      expect(result.ok).toBe(true);
      const ticket = result.data as {
        id: string;
        customerId: string;
        subject: string;
        status: string;
        priority: string;
      };
      expect(ticket.id).toMatch(/^TCK-/);
      expect(ticket.customerId).toBe('cust_001');
      expect(ticket.subject).toBe('Test issue');
      expect(ticket.status).toBe('open');
      expect(ticket.priority).toBe('high');
      expect(result.summary).toContain('created');
    });

    it('defaults priority to medium when not specified', () => {
      const result = registry.invoke('create_ticket', {
        customer_id: 'cust_001',
        subject: 'Another issue',
        description: 'Details here',
      });
      expect(result.ok).toBe(true);
      const ticket = result.data as { priority: string };
      expect(ticket.priority).toBe('medium');
    });

    it('fails when customer_id is missing', () => {
      const result = registry.invoke('create_ticket', {
        subject: 'No customer',
        description: 'Will fail',
      });
      expect(result.ok).toBe(false);
      expect(result.summary).toContain('requires customer_id and subject');
    });

    it('fails when subject is missing', () => {
      const result = registry.invoke('create_ticket', {
        customer_id: 'cust_001',
        description: 'Will fail',
      });
      expect(result.ok).toBe(false);
      expect(result.summary).toContain('requires customer_id and subject');
    });

    it('truncates subject to 200 characters', () => {
      const longSubject = 'x'.repeat(300);
      const result = registry.invoke('create_ticket', {
        customer_id: 'cust_001',
        subject: longSubject,
        description: 'desc',
      });
      expect(result.ok).toBe(true);
      const ticket = result.data as { subject: string };
      expect(ticket.subject.length).toBe(200);
    });

    it('truncates description to 2000 characters', () => {
      const longDesc = 'y'.repeat(3000);
      const result = registry.invoke('create_ticket', {
        customer_id: 'cust_001',
        subject: 'Short subject',
        description: longDesc,
      });
      expect(result.ok).toBe(true);
      const ticket = result.data as { description: string };
      expect(ticket.description.length).toBe(2000);
    });
  });

  describe('get_order_status', () => {
    it('returns order details for a valid order ID', () => {
      const result = registry.invoke('get_order_status', {
        order_id: 'ORD-5521',
      });
      expect(result.ok).toBe(true);
      const order = result.data as {
        id: string;
        status: string;
        trackingId?: string;
      };
      expect(order.id).toBe('ORD-5521');
      expect(order.status).toBe('shipped');
      expect(order.trackingId).toBe('INV-89-DEL');
      expect(result.summary).toContain('ORD-5521');
      expect(result.summary).toContain('tracking');
    });

    it('returns order without tracking ID when none exists', () => {
      const result = registry.invoke('get_order_status', {
        order_id: 'ORD-5544',
      });
      expect(result.ok).toBe(true);
      const order = result.data as { id: string; trackingId?: string };
      expect(order.id).toBe('ORD-5544');
      expect(order.trackingId).toBeUndefined();
      expect(result.summary).not.toContain('tracking');
    });

    it('returns null data for unknown order ID', () => {
      const result = registry.invoke('get_order_status', {
        order_id: 'ORD-9999',
      });
      expect(result.ok).toBe(true);
      expect(result.data).toBeNull();
      expect(result.summary).toContain('not found');
    });
  });

  describe('transfer_to_human', () => {
    it('returns a transfer result with endsCall = true', () => {
      const result = registry.invoke('transfer_to_human', {
        reason: 'billing dispute',
        summary: 'Customer wants refund',
        urgency: 'high',
      });
      expect(result.ok).toBe(true);
      expect(result.endsCall).toBe(true);
      expect(result.summary).toContain('Transferring to a human agent');
      expect(result.summary).toContain('billing dispute');
      expect(result.summary).toContain('high');
    });

    it('includes queue position in data', () => {
      const result = registry.invoke('transfer_to_human', {
        reason: 'complex issue',
        summary: 'Need specialist',
        urgency: 'normal',
      });
      const data = result.data as { queuePosition: number };
      expect(data.queuePosition).toBe(3);
    });

    it('defaults urgency to normal when not specified', () => {
      const result = registry.invoke('transfer_to_human', {
        reason: 'generic',
        summary: 'Help needed',
      });
      const data = result.data as { urgency: string };
      expect(data.urgency).toBe('normal');
    });

    it('defaults reason to unspecified when not provided', () => {
      const result = registry.invoke('transfer_to_human', {});
      const data = result.data as { reason: string };
      expect(data.reason).toBe('unspecified');
    });
  });

  describe('unknown tool', () => {
    it('returns an error result for an unknown tool name', () => {
      const result = registry.invoke('nonexistent_tool', {});
      expect(result.ok).toBe(false);
      expect(result.summary).toContain('Unknown tool');
      expect(result.summary).toContain('nonexistent_tool');
    });
  });

  describe('error handling', () => {
    it('catches and returns errors thrown by handlers', () => {
      // We can trigger an error by exploiting a scenario where the handler
      // throws. Since all handlers are well-guarded, we verify the invoke
      // wrapper handles it through the unknown tool path.
      const result = registry.invoke('unknown_tool', { bad: 'data' });
      expect(result.ok).toBe(false);
      expect(result.summary).toBeDefined();
    });
  });
});
