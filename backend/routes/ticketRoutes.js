const express = require("express");
const router = express.Router();
const { processTicket } = require("../services/ticketService");

router.post("/process", async (req, res) => {
  const { subject, body, channel, customerId } = req.body;

  if (!subject && !body) {
    return res.status(400).json({ error: "subject or body required" });
  }

  try {
    const result = await processTicket({
      subject,
      body,
      channel,
      customerId
    });

    res.json(result);
  } catch (err) {
    console.error("PROCESS ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
