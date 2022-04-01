const express = require("express");
const http = require("http");
const app = express();
const server = http.createServer(app);
const socket = require("socket.io");
const io = socket(server);
const rooms = {};

io.on("connection", (socket) => {
  socket.on("join room", (roomID) => {
    if (rooms[roomID]) {
      rooms[roomID].push(socket.id);
    } else {
      rooms[roomID] = [socket.id];
    }

    const otherUser = rooms[roomID].find((id) => id !== socket.id);
    if (otherUser) {
      socket.emit("other user", otherUser);
      socket.to(otherUser).emit("user joined", socket.id);
    }
  });

  socket.on("offer", (payload) => {
    io.to(payload.calle).emit("offer", payload);
  });

  socket.on("answer", (payload) => {
    io.to(payload.calle).emit("answer", payload);
  });

  socket.on("ice-candidate", (incoming) => {
    io.to(incoming.calle).emit("ice-candidate", incoming.candidate);
  });

  socket.on("call-end", (payload) => {
    console.log("ending room", rooms);
    delete rooms[payload.roomID];
    console.log("ended room", rooms);
    io.to(payload.otherUser).emit("call-end");
    // deleting room
  });
});

server.listen(8000, () => console.log("server is running on port 8000"));
