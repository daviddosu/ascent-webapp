# Final minimal execution architecture

The architecture passed **3/3 targeted acceptance scenarios** with **100% execution precision**, no duplicate or unintended external actions, no manual rescue, and no infrastructure failure routed to Sol.

- Luna is the production default.
- Browser/provider and stale-state failures remain in deterministic ShotCount recovery on the same AgentRun.
- Sol is invoked only after deterministic semantic verification proves a reasoning mismatch, and repairs only that step.
- Terra is absent from the active execution path.

Measured model cost across the three final acceptances was **$0.031383 Luna + $0.003210 Sol = $0.034593 total**.
