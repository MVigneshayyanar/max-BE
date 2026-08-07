const { Server } = require('socket.io');

/**
 * Initialize Socket.IO for real-time session management.
 * 
 * The Flutter app connects via socket_io_client and joins a room
 * identified by the user's Firebase UID. When a session changes
 * (e.g., another device takes over), the server emits 'session_changed'
 * to all sockets in that user's room, causing the old device to sign out.
 */
function initializeSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id}`);

    // Client joins their user-specific room
    socket.on('join_user_room', (firebaseUid) => {
      socket.join(`user_${firebaseUid}`);
      console.log(`👤 Socket ${socket.id} joined room user_${firebaseUid}`);
    });

    // Client can also join a store room (for future multi-device stock sync)
    socket.on('join_store_room', (storeId) => {
      socket.join(`store_${storeId}`);
      console.log(`🏪 Socket ${socket.id} joined room store_${storeId}`);
    });

    socket.on('disconnect', (reason) => {
      console.log(`🔌 Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  console.log('📡 Socket.IO initialized');
  return io;
}

module.exports = { initializeSocket };
