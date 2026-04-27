const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = new Map();

io.on('connection', (socket) => {
  console.log('Nouvel utilisateur connecté:', socket.id);

  socket.on('join-room', ({ roomId, userName }) => {
    socket.join(roomId);
    socket.data = { roomId, userName };

    if (!rooms.has(roomId)) {
      rooms.set(roomId, { noteContent: '', users: new Set() });
    }
    const room = rooms.get(roomId);
    room.users.add(socket.id);

    socket.emit('note-update', room.noteContent);
    broadcastUserList(roomId);
  });

  socket.on('note-change', ({ roomId, newNote }) => {
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.noteContent = newNote;
      socket.to(roomId).emit('note-update', newNote);
    }
  });

  socket.on('disconnect', () => {
    const roomId = socket.data?.roomId;
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.users.delete(socket.id);
      if (room.users.size === 0) {
        rooms.delete(roomId);
      } else {
        broadcastUserList(roomId);
      }
    }
  });

  function broadcastUserList(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    const users = [];
    for (const socketId of room.users) {
      const clientSocket = io.sockets.sockets.get(socketId);
      if (clientSocket && clientSocket.data?.userName) {
        users.push(clientSocket.data.userName);
      }
    }
    io.to(roomId).emit('user-list', users);
  }
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Serveur démarré sur http://localhost:${PORT}`);
});