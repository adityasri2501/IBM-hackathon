// ================== CONFIG ==================
const TEXT_BACKEND_URL = "http://localhost:5000/test-text";
const VOICE_BACKEND_URL = "http://localhost:5000/process-voice";
const CHAT_HISTORY_KEY = "orchiserve_cx_history_v1";

// ================== DOM ELEMENTS ==================
const chatDisplay = document.getElementById("chat-display");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const micBtn = document.getElementById("mic-btn");
const suggestionBtns = document.querySelectorAll(".suggestion-btn");

// Ticket panel
const ticketEmptyEl = document.getElementById("ticket-empty");
const ticketDetailsEl = document.getElementById("ticket-details");
const ticketIdEl = document.getElementById("ticket-id");
const ticketTypeEl = document.getElementById("ticket-type");
const ticketPriorityEl = document.getElementById("ticket-priority");
const ticketSentimentEl = document.getElementById("ticket-sentiment");
const ticketChannelEl = document.getElementById("ticket-channel");
const ticketStatusEl = document.getElementById("ticket-status");
const ticketUpdatedEl = document.getElementById("ticket-updated");

// Flow steps
const flowStepsContainer = document.getElementById("flow-steps");

// ================== CHAT UTILITIES ==================
function addMessage(text, sender = "user") {
  const msg = document.createElement("div");
  msg.classList.add("message", sender);
  msg.innerHTML = text.replace(/\n/g, "<br>");
  chatDisplay.appendChild(msg);
  chatDisplay.scrollTop = chatDisplay.scrollHeight;

  saveHistoryMessage({ sender, text });
}

function showTyping() {
  const existing = document.getElementById("typing");
  if (existing) return;
  const typing = document.createElement("div");
  typing.classList.add("typing-indicator");
  typing.id = "typing";
  typing.innerHTML = `
    <div class="dot"></div>
    <div class="dot"></div>
    <div class="dot"></div>
  `;
  chatDisplay.appendChild(typing);
  chatDisplay.scrollTop = chatDisplay.scrollHeight;
}

function removeTyping() {
  const t = document.getElementById("typing");
  if (t) t.remove();
}

// ================== TOASTS ==================
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.classList.add("toast", `toast-${type}`);

  const icon =
    type === "success" ? "✅" : type === "error" ? "⚠️" : "ℹ️";

  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-message">${message}</div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(6px) scale(0.98)";
    setTimeout(() => toast.remove(), 180);
  }, 3500);
}

// ================== FLOW DIAGRAM ANIMATION ==================
function animateFlow() {
  if (!flowStepsContainer) return;
  const steps = Array.from(
    flowStepsContainer.querySelectorAll(".flow-step")
  );
  steps.forEach((s) => s.classList.remove("active"));

  steps.forEach((step, index) => {
    setTimeout(() => step.classList.add("active"), index * 400);
  });
}

// ================== TICKET PANEL LOGIC ==================
function deriveTicketFromNLU(source, text, nlu) {
  const now = new Date();
  const id = "#T-" + now.getTime().toString().slice(-6);

  let type = "General Issue";
  if (nlu?.keywords?.[0]?.text) {
    type = nlu.keywords[0].text;
  } else if (nlu?.categories?.[0]?.label) {
    type = nlu.categories[0].label.split("/").slice(-1)[0] || type;
  }

  const sentimentLabel = nlu?.sentiment?.document?.label || "neutral";
  const emotions = nlu?.emotion?.document?.emotion || {};
  const anger = emotions.anger || 0;
  const fear = emotions.fear || 0;

  let priority = "Medium";
  if (sentimentLabel === "negative" || anger > 0.4 || fear > 0.4) {
    priority = "High";
  } else if (sentimentLabel === "positive") {
    priority = "Low";
  }

  const status = "Created · Awaiting Orchestrate actions";

  return {
    id,
    type,
    priority,
    sentiment: sentimentLabel,
    channel: source === "voice" ? "Voice" : "Chat",
    status,
    updated: now.toLocaleString(),
  };
}

function updateTicketPanel(source, inputText, nlu) {
  const ticket = deriveTicketFromNLU(source, inputText, nlu);

  ticketIdEl.textContent = ticket.id;
  ticketTypeEl.textContent = ticket.type;
  ticketPriorityEl.textContent = ticket.priority;
  ticketSentimentEl.textContent = ticket.sentiment;
  ticketChannelEl.textContent = ticket.channel;
  ticketStatusEl.textContent = ticket.status;
  ticketUpdatedEl.textContent = ticket.updated;

  ticketEmptyEl.style.display = "none";
  ticketDetailsEl.classList.remove("hidden");

  showToast(
    `Ticket ${ticket.id} created (${ticket.type} · ${ticket.priority})`,
    "success"
  );
}

// ================== AUDIO (VOICE) LOGIC ==================
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

async function toggleRecording() {
  try {
    if (!isRecording) {
      // Start recording
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunks.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: "audio/webm" });
        audioChunks = [];
        addMessage("🎙 Voice query sent to OrchiServe CX", "user");
        animateFlow();
        await sendVoiceToBackend(blob);
      };

      mediaRecorder.start();
      isRecording = true;
      micBtn.classList.add("recording");
      micBtn.textContent = "⏺";
      showToast("Recording... click again to stop", "info");
    } else {
      // Stop recording
      mediaRecorder.stop();
      isRecording = false;
      micBtn.classList.remove("recording");
      micBtn.textContent = "🎙";
    }
  } catch (err) {
    console.error(err);
    showToast("Mic access blocked or not available", "error");
  }
}

async function sendVoiceToBackend(blob) {
  try {
    showTyping();

    const formData = new FormData();
    formData.append("audio", blob, "voice.webm");

    const response = await fetch(VOICE_BACKEND_URL, {
      method: "POST",
      body: formData,
    });

    removeTyping();
    const data = await response.json();

    if (data.error) {
      addMessage("⚠️ Error: " + (data.details || data.error), "ai");
      showToast("Voice pipeline failed", "error");
      return;
    }

    // optional: show STT text if backend sent it
    if (data.input) {
      addMessage("📝 STT: " + data.input, "user");
    }

    if (data.response) {
      addMessage(data.response, "ai");
    }

    if (data.nlu) {
      updateTicketPanel("voice", data.input || "Voice query", data.nlu);
    }

    if (data.audio) {
      playAudioBase64(data.audio);
    }

  } catch (err) {
    removeTyping();
    console.error(err);
    addMessage("⚠️ Backend error (voice): " + err.message, "ai");
    showToast("Backend error (voice)", "error");
  }
}

// ================== TEXT PIPELINE ==================
function playAudioBase64(base64Audio) {
  try {
    const audio = new Audio("data:audio/mp3;base64," + base64Audio);
    audio.play();
  } catch (err) {
    console.error("Audio play error:", err);
  }
}

async function sendTextToBackend(message) {
  try {
    showTyping();
    animateFlow();

    const response = await fetch(TEXT_BACKEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: message }),
    });

    removeTyping();
    const data = await response.json();

    if (data.error) {
      addMessage("⚠️ Error: " + (data.details || data.error), "ai");
      showToast("Text pipeline failed", "error");
      return;
    }

    if (data.response) {
      addMessage(data.response, "ai");
    }

    if (data.nlu) {
      updateTicketPanel("chat", data.input || message, data.nlu);
    }

    if (data.audio) {
      playAudioBase64(data.audio);
    }

  } catch (err) {
    removeTyping();
    console.error(err);
    addMessage("⚠️ Backend error: " + err.message, "ai");
    showToast("Backend error (text)", "error");
  }
}

// ================== CHAT HISTORY (LOCALSTORAGE) ==================
function saveHistoryMessage(msg) {
  try {
    const existing = JSON.parse(
      localStorage.getItem(CHAT_HISTORY_KEY) || "[]"
    );
    existing.push({
      sender: msg.sender,
      text: msg.text,
      ts: Date.now(),
    });
    // limit history length
    const trimmed = existing.slice(-80);
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore storage errors
  }
}

function loadHistory() {
  try {
    const existing = JSON.parse(
      localStorage.getItem(CHAT_HISTORY_KEY) || "[]"
    );
    existing.forEach((m) => {
      const msg = document.createElement("div");
      msg.classList.add("message", m.sender);
      msg.innerHTML = m.text.replace(/\n/g, "<br>");
      chatDisplay.appendChild(msg);
    });
    chatDisplay.scrollTop = chatDisplay.scrollHeight;
  } catch {
    // ignore
  }
}

// ================== EVENT LISTENERS ==================
sendBtn.addEventListener("click", () => {
  const message = chatInput.value.trim();
  if (!message) return;

  addMessage(message, "user");
  chatInput.value = "";

  sendTextToBackend(message);
});

chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendBtn.click();
  }
});

suggestionBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const message = btn.getAttribute("data-msg");
    addMessage(message, "user");
    sendTextToBackend(message);
  });
});

if (micBtn) {
  micBtn.addEventListener("click", toggleRecording);
}

// On load
window.addEventListener("load", () => {
  loadHistory();
  animateFlow();
});
