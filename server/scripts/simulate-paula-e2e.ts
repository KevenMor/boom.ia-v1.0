/**
 * E2E Simulator for Paula (Delta Empreendimentos)
 * Simulates conversation flows using direct fetch calls to OpenAI.
 */

import { SYSTEM_PROMPT, COMMUNICATION_RULES } from "../src/services/prompts/delta-empreendimentos.js";
import "dotenv/config";

const PAULA_PROMPT = `${SYSTEM_PROMPT}\n\n${COMMUNICATION_RULES}`;

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

async function simulateTurn(history: Message[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not found in .env");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        { role: "system", content: PAULA_PROMPT },
        ...history
      ],
      temperature: 0.7
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
  }

  const data = await response.json() as any;
  return data.choices[0].message.content;
}

async function runScenario(name: string, turns: string[]) {
  console.log(`\n=== CENÁRIO: ${name} ===`);
  const history: Message[] = [];
  
  for (const userMsg of turns) {
    console.log(`\n👤 Usuário: ${userMsg}`);
    history.push({ role: 'user', content: userMsg });
    
    const paulaResp = await simulateTurn(history);
    console.log(`\n👩 Paula:\n${paulaResp}`);
    history.push({ role: 'assistant', content: paulaResp });
    
    // Simple validation logs
    if (paulaResp.includes('**') || paulaResp.includes('__')) console.log('⚠️ AVISO: Detectado Markdown (Negrito/Itálico)');
    const qMarks = (paulaResp.match(/\?/g) || []).length;
    if (qMarks > 1) console.log(`⚠️ AVISO: ${qMarks} pontos de interrogação detectados`);
    
    const lowerResp = paulaResp.toLowerCase();
    const hasAI = /\b(ia|robô|robo|bot|botinho|inteligência artificial)\b/i.test(lowerResp);
    if (hasAI) console.log('⚠️ AVISO: Paula mencionou ser Robô/IA');
  }
}

async function main() {
  try {
    // Fluxo 1: Interesse geral no Vale dos Cervos + Qualificação
    await runScenario("Interesse geral no Vale dos Cervos", [
      "Olá, vi o anúncio sobre os lotes de chácara",
      "Me chamo Keven",
      "Queria o Vale dos Cervos",
      "Estou buscando para morar com a família, sou de Sorocaba",
      "E qual o preço do lote?"
    ]);

    // Fluxo 2: Pergunta sobre Reservas do Brasil (ver se o foco foi retirado)
    await runScenario("Pergunta sobre Reservas do Brasil", [
      "Quero saber mais sobre o Reservas do Brasil",
      "Keven",
      "quanto custa?"
    ]);

  } catch (error) {
    console.error("Erro na simulação:", error);
  }
}

main();
