export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  plan: 'free' | 'pro' | 'enterprise';
  joinedAt: string;
  notes?: string;
}

export interface Ticket {
  id: string;
  customerId: string;
  subject: string;
  description: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: string;
  updatedAt: string;
}

export interface Order {
  id: string;
  customerId: string;
  itemName: string;
  amount: number;
  status: 'placed' | 'processing' | 'shipped' | 'delivered' | 'failed';
  trackingId?: string;
  placedAt: string;
}

export const customers: Customer[] = [
  {
    id: 'cust_000',
    name: 'Urmil',
    phone: '+91-63555-58644',
    email: 'urmil@example.in',
    plan: 'enterprise',
    joinedAt: '2024-01-01',
    notes: 'Default account. Enterprise plan.',
  },
  {
    id: 'cust_001',
    name: 'Aarav Mehta',
    phone: '+91-98765-43210',
    email: 'aarav.mehta@example.in',
    plan: 'pro',
    joinedAt: '2024-08-12',
    notes: 'Long-time pro user. Has had two billing complaints in the past.',
  },
  {
    id: 'cust_002',
    name: 'Priya Sharma',
    phone: '+91-90123-45678',
    email: 'priya.s@example.in',
    plan: 'enterprise',
    joinedAt: '2023-02-04',
    notes: 'Enterprise account, dedicated CSM is Rahul.',
  },
  {
    id: 'cust_003',
    name: 'Vikram Iyer',
    phone: '+91-77777-12345',
    email: 'vikram.iyer@example.in',
    plan: 'free',
    joinedAt: '2026-04-18',
    notes: 'Brand-new free trial user.',
  },
];

export const tickets: Ticket[] = [
  {
    id: 'TCK-1042',
    customerId: 'cust_001',
    subject: 'Cannot export project to S3',
    description: 'IAM error when exporting; was working until yesterday.',
    status: 'open',
    priority: 'high',
    createdAt: '2026-04-21',
    updatedAt: '2026-04-22',
  },
  {
    id: 'TCK-1031',
    customerId: 'cust_001',
    subject: 'Invoice for March missing line item',
    description: 'Add-on bandwidth charge not itemised.',
    status: 'resolved',
    priority: 'low',
    createdAt: '2026-04-04',
    updatedAt: '2026-04-09',
  },
  {
    id: 'TCK-0987',
    customerId: 'cust_002',
    subject: 'SSO SAML metadata refresh',
    description: 'Quarterly cert rotation needs new metadata uploaded.',
    status: 'pending',
    priority: 'medium',
    createdAt: '2026-04-15',
    updatedAt: '2026-04-15',
  },
];

export const orders: Order[] = [
  {
    id: 'ORD-5521',
    customerId: 'cust_002',
    itemName: 'Enterprise add-on: 100 seats',
    amount: 89000,
    status: 'shipped',
    trackingId: 'INV-89-DEL',
    placedAt: '2026-04-20',
  },
  {
    id: 'ORD-5544',
    customerId: 'cust_001',
    itemName: 'Pro plan annual renewal',
    amount: 14990,
    status: 'delivered',
    placedAt: '2026-03-12',
  },
];

let ticketCounter = 1100;
export function nextTicketId(): string {
  ticketCounter += 1;
  return `TCK-${ticketCounter}`;
}
