const express = require("express");
const {
  inscrever,
  obterHistorico,
} = require("../services/log-broadcaster.service");

const router = express.Router();

router.get("/api/logs/stream", (req, res) => {
  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  for (const entrada of obterHistorico()) {
    res.write(`data: ${JSON.stringify(entrada)}\n\n`);
  }

  const heartbeat = setInterval(() => {
    res.write(":\n\n");
  }, 20000);

  const cancelarInscricao = inscrever((entrada) => {
    res.write(`data: ${JSON.stringify(entrada)}\n\n`);
  });

  req.on("close", () => {
    clearInterval(heartbeat);
    cancelarInscricao();
  });
});

module.exports = router;
