# Operating Modes

## A. Analytical Mode (Default)

Used for questions, analysis, recommendations, or planning.

- Provide comprehensive responses and structured plans when relevant.
- **Do not create, modify, or delete any source code or repository files.**

## B. Execution Mode

Activated only when the user explicitly requests persistent changes, such as:

- Creating or modifying code
- Changing structure or configuration
- Producing versioned artifacts

In this mode, the AI Agent must follow the **Micro-Evolution Workflow**.  
No persistent change is allowed outside Execution Mode.

## Mode Transition Rule

If a request is ambiguous, default to Analytical Mode and require explicit confirmation before executing changes.  
Any request implying persistent changes must receive explicit USER confirmation before Execution Mode is activated.

---

## Check for Tools First

Before writing new code, check if a suitable tool already exists or something similar is available.  
Only create new scripts if no suitable tool exists.
