require("dotenv").config();

const NaturalLanguageUnderstandingV1 = require("ibm-watson/natural-language-understanding/v1");
const SpeechToTextV1 = require("ibm-watson/speech-to-text/v1");
const TextToSpeechV1 = require("ibm-watson/text-to-speech/v1");
const { IamAuthenticator } = require("ibm-watson/auth");

// NLU
const nluClient = new NaturalLanguageUnderstandingV1({
  version: "2021-08-01",
  authenticator: new IamAuthenticator({ apikey: process.env.NLU_APIKEY }),
  serviceUrl: process.env.NLU_URL
});

// STT
const sttClient = new SpeechToTextV1({
  authenticator: new IamAuthenticator({ apikey: process.env.STT_APIKEY }),
  serviceUrl: process.env.STT_URL
});

// TTS
const ttsClient = new TextToSpeechV1({
  authenticator: new IamAuthenticator({ apikey: process.env.TTS_APIKEY }),
  serviceUrl: process.env.TTS_URL
});

module.exports = {
  nluClient,
  sttClient,
  ttsClient
};
