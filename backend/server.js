// ----------------------------
// ENV + BASE IMPORTS
// ----------------------------
import dotenv from "dotenv";
dotenv.config(); // CRITICAL

import express from "express";
import cors from "cors";
import fileUpload from "express-fileupload";

import SpeechToTextV1 from "ibm-watson/speech-to-text/v1.js";
import TextToSpeechV1 from "ibm-watson/text-to-speech/v1.js";
import NaturalLanguageUnderstandingV1 from "ibm-watson/natural-language-understanding/v1.js";
import { IamAuthenticator } from "ibm-cloud-sdk-core";

import { GoogleGenerativeAI } from "@google/generative-ai";

// Debug Logging
console.log("ENV CHECK:", {
  STT: !!process.env.IBM_STT_APIKEY,
  TTS: !!process.env.IBM_TTS_APIKEY,
  NLU: !!process.env.IBM_NLU_APIKEY,
  GEMINI: !!process.env.GEMINI_APIKEY,
});

// ----------------------------
// APP INIT
// ----------------------------
const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload());

// ----------------------------
// IBM SERVICES
// ----------------------------

// Speech-to-Text
const stt = new SpeechToTextV1({
  authenticator: new IamAuthenticator({
    apikey: process.env.IBM_STT_APIKEY,
  }),
  serviceUrl: process.env.IBM_STT_URL,
});

// Text-to-Speech
const tts = new TextToSpeechV1({
  authenticator: new IamAuthenticator({
    apikey: process.env.IBM_TTS_APIKEY,
  }),
  serviceUrl: process.env.IBM_TTS_URL,
});

// NLU
const nlu = new NaturalLanguageUnderstandingV1({
  authenticator: new IamAuthenticator({
    apikey: process.env.IBM_NLU_APIKEY,
  }),
  serviceUrl: process.env.IBM_NLU_URL,
  version: "2023-07-01",
});

// ----------------------------
// GEMINI AI
// ----------------------------
const genAI = new GoogleGenerativeAI(process.env.GEMINI_APIKEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });


// ----------------------------
// VOICE PIPELINE (AUDIO INPUT)
// ----------------------------
app.post("/process-voice", async (req, res) => {
  try {
    if (!req.files || !req.files.audio) {
      return res.status(400).json({ error: "Audio file missing" });
    }

    const audioBuffer = req.files.audio.data;

    // 1) Speech-to-Text
    const sttResult = await stt.recognize({
      audio: audioBuffer,
      contentType: "audio/wav",
      model: "en-US_BroadbandModel",
    });

    const userText =
      sttResult.result.results?.[0]?.alternatives?.[0]?.transcript ||
      "Unable to transcribe.";

    console.log("STT Output:", userText);

    // 2) NLU
    const nluResult = await nlu.analyze({
      text: userText,
      features: {
        sentiment: {},
        emotion: {},
        keywords: {},
        categories: {},
      },
    });

    // 3) Gemini Reasoning
    const prompt = `
User said: ${userText}

NLU Understanding:
${JSON.stringify(nluResult.result, null, 2)}

Respond clearly and helpfully.
    `;

    const g = await model.generateContent(prompt);
    const aiText = g.response.text();

    console.log("Gemini Response:", aiText);

    // 4) TTS Output
    const ttsResult = await tts.synthesize({
      text: aiText,
      accept: "audio/mp3",
      voice: "en-US_MichaelV3Voice",
    });

    const audioStream = ttsResult.result;
    const chunks = [];
    for await (const chunk of audioStream) chunks.push(chunk);

    const audioBufferOut = Buffer.concat(chunks);

    res.json({
      text: aiText,
      audio: audioBufferOut.toString("base64"),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Voice pipeline failed",
      details: err.message,
    });
  }
});


// ----------------------------
// TEXT TEST ENDPOINT
// ----------------------------
app.post("/test-text", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    // 1) NLU
    const nluResult = await nlu.analyze({
      text,
      features: {
        sentiment: {},
        emotion: {},
        keywords: {},
        categories: {},
      },
    });

    // 2) Gemini Response
    const g = await model.generateContent({
      contents: [{ role: "user", parts: [{ text }] }],
    });

    const reply = g.response.text();

    // 3) TTS
    const ttsResult = await tts.synthesize({
      text: reply,
      accept: "audio/mp3",
      voice: "en-US_MichaelV3Voice",
    });

    const chunks = [];
    for await (const chunk of ttsResult.result) chunks.push(chunk);
    const audioBufferOut = Buffer.concat(chunks);

    res.json({
      input: text,
      nlu: nluResult.result,
      response: reply,
      audio: audioBufferOut.toString("base64"),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Test endpoint failed",
      details: err.message,
    });
  }
});

// ----------------------------
// ROOT
// ----------------------------
app.get("/", (req, res) => {
  res.send("IBM + Gemini Backend Running Successfully");
});

// ----------------------------
// START SERVER
// ----------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running on ${PORT}`));
