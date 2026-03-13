import fs from "fs/promises";
import path from "path";
import { ProcessDefinition, ProcessDefinitionSchema, StepSchema, ProcessStep } from "../types/workflow";

/**
 * Lê um arquivo Markdown que descreve um processo e converte seu conteúdo e etapas em um JSON estruturado.
 * 
 * Estratégia de parsing:
 * 1. O Frontmatter YAML (entre `---`) contém ID, Version, Description e Initial Step.
 * 2. Em algum lugar no texto, espera-se blocos ```json ... ``` ou estruturas padronizadas descrevendo cada passo.
 *    No nosso contrato, os metadados do Step estão em um bloco com a classe json na linguagem markdown logo 
 *    abaixo da seção do Step.
 */
export async function parseProcessMarkdown(processId: string, folderPath: string): Promise<{ definition: ProcessDefinition, content: string }> {
  const filePath = path.join(folderPath, `${processId}.md`);
  let rawContent: string;
  try {
    rawContent = await fs.readFile(filePath, "utf-8");
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new Error(`Arquivo de processo Markdown na pasta '${folderPath}' não encontrado para ID: ${processId}`);
    }
    throw err;
  }

  // 1. Parse Frontmatter 
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
  const fmMatch = rawContent.match(frontmatterRegex);
  
  if (!fmMatch) {
    throw new Error("O Markdown deve conter um bloco Frontmatter válido no formato YAML entre delimitadores --- no início do arquivo.");
  }

  const fmContent = fmMatch[1];
  const metadata: Record<string, string> = {};
  fmContent.split("\n").forEach((line) => {
    const divider = line.indexOf(":");
    if (divider > -1) {
      const key = line.substring(0, divider).trim();
      let value = line.substring(divider + 1).trim();
      // Remove quotes se existirem
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      }
      metadata[key] = value;
    }
  });

  // 2. Extrair blocos de metadados das Etapas (JSON code blocks)
  // Utilizamos um regex que busca ```json ou ```JSON seguido pelo conteúdo
  const jsonBlocksRegex = /```json\r?\n([\s\S]*?)\r?\n```/ig;
  const stepsMap: Record<string, ProcessStep> = {};

  let blockMatch;
  while ((blockMatch = jsonBlocksRegex.exec(rawContent)) !== null) {
    const jsonString = blockMatch[1];
    try {
      const parsedJson = JSON.parse(jsonString);
      // Validar o step against the schema
      const validStep = StepSchema.parse(parsedJson);
      stepsMap[validStep.id] = validStep;
    } catch (e: any) {
      console.warn("Um bloco JSON no markdown falhou no parse ou na validação Zod. Conteúdo:", jsonString);
      throw new Error(`Falha ao processar metadados de Etapa do processo ${processId}: ${e.message}`);
    }
  }

  // 3. Estruturar Definition Final e validar
  const definitionPayload = {
    id: metadata["id"],
    version: metadata["version"],
    description: metadata["description"],
    initial_step: metadata["initial_step"],
    steps: stepsMap,
  };

  const finalDefinition = ProcessDefinitionSchema.parse(definitionPayload);

  return {
    definition: finalDefinition,
    content: rawContent
  };
}
