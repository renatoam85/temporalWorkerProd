# Error Recovery Protocol (Self-Annealing)

When a script fails (status: error) or a timeout occurs:

1. **Analyze**: Read the error message, stack trace, and available artifacts.
2. **Fix**: Modify the execution script to resolve the root cause.
3. **Verify**: Test the fixed script immediately.
4. **Document**: Update the relevant directive's "Learned Lessons".
5. **Stop Rule**: If a script fails **5 consecutive times**, STOP and ask for human assistance. Label the directive as **BROKEN**.

---

## Observability Contract

Each Activity must emit structured logs 

Structured logs must be machine-readable (JSON preferred) and must not contain sensitive credentials or PII.
