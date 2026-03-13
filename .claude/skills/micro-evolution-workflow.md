# Micro-Evolution Workflow

Follow these steps for any persistent change. Mandatory for any objective that involves creating or modifying source code.

## Steps

1. **Planning**: Create/Update `implementation_plan.md` and get explicit USER approval.  
   If changes involve classes and methods, create a class diagram based on `rules/class_diagram_template.md` and include it in the plan.

2. **Execution**: Implement changes using automated tools. Apply the **Error Recovery Protocol** if needed.

3. **Review**: Analyze scalability, performance, security, and technical backlog.

4. **Finalization**: Update `directives/` (Lessons Learned), `task.md`, and `walkthrough.md`.  
   After finalization, perform **Git Auto-Sync** per `rules/git-sync.md`.

---

## Execution Automation & Approval Reduction

To minimize human-in-the-loop approvals during Execution Mode:

### Non-Destructive Commands (Auto-Approval)

The Agent must proactively identify and flag safe, non-destructive terminal commands for execution without manual approval (e.g., fetching dependencies, compiling code, reading logs, running project test scripts).  
In Claude Code, this maps to the `SafeToAutoRun` tag.

**Constraint**: Destructive or high-impact actions (e.g., deleting critical directories, force pushing, creating remote infrastructure) must **NEVER** be auto-approved and require explicit USER validation.

### Direct File Manipulation First

The Agent must prioritize its native code-editing tools (reading/writing/replacing files directly via AST or text manipulation) over generating complex bash/PowerShell scripts.  
Native tools bypass terminal execution approval friction and offer built-in safety boundaries.

---

## Workflows and Turbo Automation

The system supports explicit **Workflows** stored as `.md` files in designated workflow directories (e.g., `.agents/workflows/`). Workflows define precise steps for achieving specific tasks (e.g., deployment, scaffolding).

### `// turbo` Annotation

A user can annotate a specific step in a workflow with `// turbo`. If the AI Agent is executing this workflow step via a terminal command, it MUST flag that specific command for auto-approval (in Claude Code: `SafeToAutoRun`).

### `// turbo-all` Annotation

If a workflow file contains the `// turbo-all` annotation anywhere, the AI Agent MUST automatically apply auto-approval to *every* terminal command step in that workflow. This creates a fully automated sequence based on user consent.
