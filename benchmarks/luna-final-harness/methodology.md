# Methodology

The final result is one fresh 60-run execution: the frozen 20-task corpus, three independent runs per task, GPT-5.6 Luna only, low reasoning effort, and the deployed ShotCount harness at commit `f03fd261ac67224c898ae7e1e42fdedbbd6b6b6b`. Normal bounded same-AgentRun recovery remained enabled. No failed case was rerun, and no manual rescue was used. Cross-04's controlled recipient is an evaluation environment actor that performs only the frozen real Gmail reply.
