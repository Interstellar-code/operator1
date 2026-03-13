---
name: logs
description: Show recent gateway logs
emoji: 📋
category: system
user-command: true
model-invocation: false
args:
  - name: lines
    type: number
    required: false
    default: "30"
---

Show the last {{lines}} lines of gateway logs.
Highlight any errors or warnings.
Include timestamps for each entry.
