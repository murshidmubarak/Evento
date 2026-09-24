# EventOps ERP — Bug Log and Solutions

## Purpose

This document is the permanent project bug history.

Every important bug, error, failure, unexpected behavior, and its verified solution must be recorded here.

The purpose is to prevent solving the same problem repeatedly and to give future development work a reliable project-specific troubleshooting reference.

---

# Mandatory Bug Workflow

Before investigating a new error:

1. Read this document first.
2. Search for the current error, error message, affected file, module, or related symptom.
3. If the same or similar bug already exists:
   - Review the previous solution.
   - Verify whether the same conditions exist.
   - Prefer the documented solution when it is still applicable.
4. Do not blindly repeat an old solution if the architecture or dependencies have changed.
5. If the bug is new:
   - Investigate it.
   - Fix it.
   - Verify the fix.
   - Append the bug and verified solution to this document.

---

# Bug Record Format

Every bug entry should use the following format.

## BUG-[NUMBER] — [Short Bug Title]

### Date

YYYY-MM-DD

### Feature / Module

Example:

Authentication

### Severity

- Critical
- High
- Medium
- Low

### Status

- Open
- Investigating
- Fixed
- Verified
- Reopened

### Error / Symptom

Describe exactly what happened.

Include the exact error message where available.

Example:

```text
Error: Port 5000 is already in use