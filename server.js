const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

// Initialize app
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// In-Memory Storage
const rooms = {};

// Ensure "uploads" directory exists
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

// Serve static files for uploaded images
app.use("/uploads", express.static(UPLOAD_DIR));

// WebSocket Events
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Emit the current list of rooms to the client
  socket.on("get-rooms", () => {
    const roomList = Object.entries(rooms).map(([roomId, room]) => ({
      roomId,
      name: room.name,
    }));
    socket.emit("room-list", roomList);
  });

  // Create a new room
  socket.on("create-room", (roomName) => {
    const roomId = `room-${Date.now()}`;
    rooms[roomId] = { name: roomName, queue: [], messages: [], images: [] };
    io.emit(
      "room-list",
      Object.entries(rooms).map(([roomId, room]) => ({
        roomId,
        name: room.name,
      }))
    );
  });

  // Join a room
  socket.on("join-room", (roomId) => {
    if (!rooms[roomId]) {
      socket.emit("error", "Room not found");
      return;
    }
    socket.join(roomId);
    socket.emit("room-joined", { roomId, name: rooms[roomId].name });
    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  // Send a message
  socket.on("send-message", ({ roomId, message, sender }) => {
    if (!rooms[roomId]) return;

    const newMessage = { text: message, sender };
    rooms[roomId].messages.push(newMessage);
    io.to(roomId).emit("new-message", newMessage); // Broadcast to all clients in the room
  });

  // Add media to the queue
  socket.on("add-to-queue", ({ roomId, media }) => {
    if (!rooms[roomId]) return;

    rooms[roomId].queue.push(media);
    io.to(roomId).emit("update-queue", rooms[roomId].queue); // Broadcast the updated queue
  });

  // Notify and play the next video in the queue
  socket.on("play-next", (roomId) => {
    if (!rooms[roomId] || rooms[roomId].queue.length === 0) return;

    const nextVideo = rooms[roomId].queue.shift(); // Remove the first video
    io.to(roomId).emit("play-video", nextVideo); // Notify all clients in the room
  });

  // Handle image uploads
  socket.on("upload-image", ({ roomId, imageBase64 }) => {
    if (!rooms[roomId]) return;

    const imageName = `image-${Date.now()}.png`;
    const imagePath = path.join(UPLOAD_DIR, imageName);

    // Decode Base64 and save the file
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    fs.writeFileSync(imagePath, base64Data, "base64");

    const imageUrl = `/uploads/${imageName}`;
    rooms[roomId].images.push(imageUrl);
    io.to(roomId).emit("new-image", imageUrl); // Broadcast the new image URL to all clients
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id);
  });
});

app.use(express.static(__dirname));

// Start server
server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
