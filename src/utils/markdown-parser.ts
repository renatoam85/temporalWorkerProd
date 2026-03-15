import fs from "fs/promises";
import path from "path";
import yaml from "yaml";
import { ProcessDefinition, ProcessDefinitionSchema, StepSchema, ProcessStep } from "../types/workflow";

/**
 * Lê um arquivo Markdown que descreve um processo e converte seu conteúdo e etapas em um JSON estruturado.
 * 
 * Estratégia de parsing:
 * 1. O Frontmatter YAML (entre `---`) contém ID, Version, Description e Initial Step.
 * 2. Em algum lugar no texto, espera-se blocos ```yaml ... ``` ou estruturas padronizadas descrevendo cada passo.
 *    No nosso contrato, os metadados do Step estão em um bloco com a classe yaml na linguagem markdown logo 
 *    abaixo da seção do Step.
 */
export async function parseProcessMarkdown(fileNameWithoutExt: string, folderPath: string): Promise<{ definition: ProcessDefinition, content: string }> {
  const filePath = path.join(folderPath, `${fileNameWithoutExt}.md`);
  let rawContent: string;
  try {
    rawContent = await fs.readFile(filePath, "utf-8");
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new Error(`Arquivo de processo Markdown na pasta '${folderPath}' não encontrado para o arquivo: ${fileNameWithoutExt}`);
    }
    throw err;
  }

  return parseProcessMarkdownString(rawContent, fileNameWithoutExt);
}

/**
 * Realiza o parse de uma string com conteúdo Markdown de um Processo
 */
export function parseProcessMarkdownString(rawContent: string, sourceName?: string): { definition: ProcessDefinition, content: string } {
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

  // 2. Extrair blocos de metadados das Etapas (YAML code blocks)
  // Utilizamos um regex que busca ```yaml ou ```YAML seguido pelo conteúdo
  const yamlBlocksRegex = /```yaml\r?\n([\s\S]*?)\r?\n```/ig;
  const stepsMap: Record<string, ProcessStep> = {};

  let blockMatch;
  while ((blockMatch = yamlBlocksRegex.exec(rawContent)) !== null) {
    const yamlString = blockMatch[1];
    try {
      const parsedYaml = yaml.parse(yamlString);
      // Validar o step against the schema
      const validStep = StepSchema.parse(parsedYaml);
      stepsMap[validStep.id] = validStep;
    } catch (e: any) {
      console.warn("Um bloco YAML no markdown falhou no parse ou na validação Zod. Conteúdo:", yamlString);
      const name = sourceName || "desconhecido (em memória)";
      throw new Error(`Falha ao processar metadados de Etapa do arquivo ${name}: ${e.message}`);
    }
  }

  // 3. Estruturar Definition Final e validar
  const definitionPayload = {
    id: metadata["id"],
    version: metadata["version"],
    description: metadata["description"],
    abreviacao: metadata["abreviacao"],
    initial_step: metadata["initial_step"],
    steps: stepsMap,
  };

  const finalDefinition = ProcessDefinitionSchema.parse(definitionPayload);

  return {
    definition: finalDefinition,
    content: rawContent
  };
}

/**
 * Encontra a versão mais recente de um Processo em uma pasta.
 */
export async function findLatestProcessVersion(processId: string, folderPath: string): Promise<string | null> {
  try {
    const files = await fs.readdir(folderPath);
    // Procurar arquivos que cobrem processId_vX.Y.Z.md ou apenas processId.md (v0 implícita)
    const matchingFiles = files.filter(f => f.startsWith(processId) && f.endsWith(".md"));
    
    if (matchingFiles.length === 0) return null;

    // Assumimos formato {id}_v{version}.md ou apenas {id}.md
    // Usa ordenação simples lexical reversa ou parse de semver (simplificado aqui)
    const sorted = matchingFiles.sort((a, b) => b.localeCompare(a));
    // Removemos o '.md' do final para retornar fileNameWithoutExt
    return sorted[0].replace(".md", "");

  } catch (err: any) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Valida e Salva um novo Markdown de processo em disco.
 * Exige versionamento (Falha se arquivo já existe).
 */
export async function saveProcessMarkdown(rawContent: string, folderPath: string): Promise<string> {
  // 1. Testa parsing lógico
  const { definition } = parseProcessMarkdownString(rawContent);
  
  // 2. Monta novo nome
  const fileNameWithoutExt = `${definition.id}_v${definition.version}`;
  const filePath = path.join(folderPath, `${fileNameWithoutExt}.md`);

  // 3. Testa se arquivo exato com essa versão já existe
  try {
    await fs.access(filePath);
    throw new Error(`O arquivo do processo na versão ${definition.version} já existe. Por favor, incremente a propriedade "version" no Frontmatter (Ex: v1.0.1) antes de salvar as modificações.`);
  } catch (err: any) {
    if (err.code !== "ENOENT") {
      throw err; // Outro erro desconhecido
    }
    // ENOENT significa que não existe, podemos seguir para salvar!
  }

  // 4. Salva no Disco
  await fs.writeFile(filePath, rawContent, "utf-8");
  return fileNameWithoutExt;
}
