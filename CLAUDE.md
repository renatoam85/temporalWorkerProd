# Project Directives: AI Agents Operating System

This specification is normative. All requirements are mandatory unless explicitly marked otherwise.

---

## Project Overview

This project implements a single-application architecture that orchestrates business processes using **Temporal** combined with **AI Agents via MCP (Model Context Protocol)**. 
Processes are defined completely in Markdown files (serving as "code" for the workflow).

The application runs a unified entry point containing:
- **Orchestration Worker (`orchestration-queue`)**: A deterministic Temporal Workflow that reads the Markdown file, parses its steps and routing rules, and dispatches tasks.
- **Automation Worker (`automation-queue`)**: An Activity Worker for automated tasks (native webhooks, logical deterministic code, or background internal AI calls).
- **HITL Worker (`hitl-queue`)**: A Human-in-the-Loop / Agent-in-the-Loop Activity Worker that persists pending tasks to a local lightweight JSON database.
- **MCP Server**: An interface exposing tools (`list_hitl_activities`, `start_activity`, `complete_activity`) so humans (via Claude Desktop/Cursor) or external AI Agents can interact with the workflow mid-flight and resolve pending tasks.

---

## Architecture Rules

- **Activity Isolation**: Each Activity MUST have its own dedicated source file. The file name MUST be identical to the activity name it implements (e.g. `extrair_dados_basicos.ts` for the `extrair_dados_basicos` activity).

---

## important

Enquanto não fizermos integração com node, podemos salvar os arquivos em pastas

## Philosophy

Be pragmatic. Be reliable. Prefer deterministic scripts over manual chat-based execution.  
Goal: leave the codebase stronger and better documented than you found it.

## Programming Language

Prefer TypeScript for new code

