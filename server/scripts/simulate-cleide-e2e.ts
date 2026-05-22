/**
 * E2E Simulator for Cleide (Monte Verde Ranch)
 * Simulates conversation flows using direct fetch calls to OpenAI/Gemini.
 */

import { SYSTEM_PROMPT, COMMUNICATION_RULES } from "../src/services/prompts/monte-verde-ranch.js";
import "dotenv/config";

const CLEIDE_PROMPT = `${SYSTEM_PROMPT}\n\n${COMMUNICATION_RULES}`;

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
        { role: "system", content: CLEIDE_PROMPT },
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
    
    const cleideResp = await simulateTurn(history);
    console.log(`\n🤠 Cleide:\n${cleideResp}`);
    history.push({ role: 'assistant', content: cleideResp });
    
    // Simple validation logs
    if (cleideResp.includes('**') || cleideResp.includes('__')) console.log('⚠️ AVISO: Detectado Markdown (Negrito/Itálico)');
    const qMarks = (cleideResp.match(/\?/g) || []).length;
    if (qMarks > 1) console.log(`⚠️ AVISO: ${qMarks} pontos de interrogação detectados`);
    
    // Melhorando a detecção de IA/Robô para evitar falsos positivos como "dia", "família", "história"
    const lowerResp = cleideResp.toLowerCase();
    const hasAI = /\b(ia|robô|robo|bot|botinho|inteligência artificial)\b/i.test(lowerResp);
    if (hasAI) console.log('⚠️ AVISO: Cleide mencionou ser Robô/IA');
  }
}

async function main() {
  try {
    // Fluxo 1: Reserva de Almoço (BBQ)
    await runScenario("Reserva de Almoço de Domingo", [
      "oi",
      "meu nome é Ricardo",
      "queria saber como funciona o almoço de domingo e o preço",
      "legal, quero reservar pra esse domingo agora",
      "seremos 4 adultos e 2 crianças de 7 anos",
      "pode anotar, Ricardo Silva"
    ]);

    // Fluxo 2: Passeio a Cavalo e Dúvida de Trilhas
    await runScenario("Atividades e Trilhas", [
      "bom dia!",
      "sou a Juliana. voces tem passeio a cavalo?",
      "e voces alugam quadriciclo pra trilha?",
      "ah entendi, e quanto custa pra levar meu proprio quadriciclo entao?",
      "show, vou ver com meu marido e te aviso"
    ]);

    // Fluxo 3: Evento e Fora de Escopo
    await runScenario("Evento e Pernoite", [
      "boa tarde, cleide",
      "queria saber se voces fazem casamento pra 100 pessoas",
      "perfeito. e vcs tem quartos pra gente dormir ai dps da festa?",
      "entendi, obrigada pelas informações!"
    ]);

  } catch (error) {
    console.error("Erro na simulação:", error);
  }
}

main();
