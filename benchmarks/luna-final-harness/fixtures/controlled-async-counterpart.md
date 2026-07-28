# Controlled async counterpart

Cross-04 uses two connected Gmail identities. The benchmark controller searches Account B for the real message from Account A, reads it, and sends the frozen reply through Gmail in the original thread. ShotCount then polls the real watch and resumes the same AgentRun. No AgentRun state is injected and Luna never controls the counterpart.
