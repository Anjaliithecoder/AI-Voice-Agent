import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSocket, disconnectSocket } from './socket';

const mockDisconnect = vi.fn();
const mockSocket = {
  connected: false,
  disconnect: mockDisconnect,
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

// We need to reset the module-level `socket` variable between tests.
// Since it's a private module variable, we re-import the module fresh.
// However, with vi.mock above, the simplest approach is to call disconnectSocket
// to null out the cached instance.

describe('socket utility', () => {
  beforeEach(async () => {
    // Reset the module-level socket reference first, then clear mock call counts
    // so tests start with a clean slate.
    disconnectSocket();
    vi.clearAllMocks();
  });

  it('creates a socket with correct config', async () => {
    const { io } = await import('socket.io-client');
    const socket = getSocket();

    expect(io).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        path: '/voice',
        transports: ['websocket'],
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      }),
    );
    expect(socket).toBe(mockSocket);
  });

  it('returns the same instance on subsequent calls', async () => {
    const { io } = await import('socket.io-client');
    const first = getSocket();
    const second = getSocket();

    expect(first).toBe(second);
    // io should only be called once (first call creates, second reuses)
    // Note: one call from the first getSocket; the cached instance is reused after
    expect(io).toHaveBeenCalledTimes(1);
  });

  it('disconnects and nullifies the socket on disconnectSocket', () => {
    // Create a socket first
    getSocket();

    // Clear any prior calls from beforeEach
    mockDisconnect.mockClear();

    // Now disconnect
    disconnectSocket();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('creates a new socket after disconnectSocket is called', async () => {
    const { io } = await import('socket.io-client');
    getSocket();
    disconnectSocket();

    // Clear the mock call count after setup
    vi.mocked(io).mockClear();

    getSocket();
    expect(io).toHaveBeenCalledTimes(1);
  });

  it('handles disconnectSocket when no socket exists', () => {
    // Should not throw when called without a socket
    expect(() => disconnectSocket()).not.toThrow();
    expect(mockDisconnect).not.toHaveBeenCalled();
  });
});
