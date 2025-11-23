const { nluClient } = require("../config/ibm");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 1. IBM NLU
async function analyzeText(text) {
  try {
    const result = await nluClient.analyze({
      text,
      features: {
        sentiment: {},
        keywords: { limit: 5 }
      }
    });

    return result.result;
  } catch (err) {
    console.error("NLU ERROR:", err);
    throw new Error("NLU_FAILED");
  }
}

// 2. Gemini Classification
async function classifyUsingGemini(text, sentiment) {
  const model = genAI.getGenerativeModel({
    model: "models/gemini-1.5-flash-latest"
  });

  const prompt = `
You are a customer support triage AI.

Ticket:
${text}

Sentiment: ${sentiment}

Tasks:
1. issue_type (billing, technical, complaint, account, general)
2. urgency_level (1-5)
3. route_to (L1, L2, billing_team, tech_team, manager)
4. short reply

Return ONLY JSON:
{
  "issue_type": "",
  "urgency_level": 3,
  "route_to": "",
  "reply": ""
}
`;

  try {
    const result = await model.generateContent(prompt);

    // NEW SDK PARSING
    const output = result.response.text();

    return JSON.parse(output);

  } catch (err) {
    console.error("GEMINI ERROR:", err);
    throw new Error("GEMINI_FAILED");
  }
}

// 3. Final Pipeline
async function processTicket({ subject, body, channel, customerId }) {
  const text = `
Customer: ${customerId}
Channel: ${channel}
Subject: ${subject}
Body: ${body}
  `.trim();

  const nlu = await analyzeText(text);
  const sentiment = nlu?.sentiment?.document?.label || "neutral";

  const decision = await classifyUsingGemini(text, sentiment);

  return {
    ticket: { subject, body, channel, customerId },
    nlu,
    decision
  };
}

module.exports = { processTicket };
