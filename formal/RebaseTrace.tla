----------------------------- MODULE RebaseTrace -----------------------------
(* The trace check of Rebase.tla: the traces of the screen test tests/ui/trace.spec.mjs (Rebase), taken by
   Rebase.tla's steps one line after another. The screen writes down its steps (ui/trace.js: typed, the episode
   renamed, read in, sent, and the send's steps in ui/send.js), with the changes not sent at the two paths of the
   episode ("a" where it was, "b" where it is renamed to) and the work read; the test writes down what it writes
   elsewhere and the branch after a send moved it (tests/ui/lib/trace.mjs). tools/trace_check.mjs writes the trace in
   RebaseTraceData.tla, in the model's terms, and runs TLC on this module. The invariant NotDone is broken when the
   whole trace was taken. *)
EXTENDS Naturals, Sequences, TLC, RebaseTraceData

VARIABLES gh, read, ch, pc, s, typed, written,
  i,     \* the lines taken
  took   \* the model's steps taken (tools/trace_check.mjs counts them)

D == INSTANCE Rebase WITH Here <- {h1, h2, h3}, There <- {t1, t2}, Tries <- 3, Commits <- 1000, Checked <- TRUE, KeptText <- TRUE, Idle <- TRUE

model == <<gh, read, ch, pc, s, typed, written>>

\* what the line says after the step (a line says only what its side knows)
Has(e, f) == f \in DOMAIN e
Shows(e) ==
  /\ Has(e, "gh") => gh' = e.gh
  /\ Has(e, "read") => read' = e.read
  /\ Has(e, "ch") => ch' = e.ch

Act(n) ==
  CASE n = "Type" -> \E c \in {h1, h2, h3} : D!Type(c)
    [] n = "Rename" -> D!Rename
    [] n = "Write" -> \E c \in {t1, t2} : D!Write(c)
    [] n = "ReadIn" -> D!ReadIn
    [] n = "SendStart" -> D!SendStart
    [] n = "Build" -> D!Build
    [] n = "Move" -> D!Move
    [] n = "Moved" -> D!Moved
    [] n = "Failed" -> D!Failed
    [] n = "Sent" -> D!Sent
    [] OTHER -> FALSE

\* the model's steps, and whether a line took each (several may fit one line): tools/trace_check.mjs counts them
Steps == {"Type", "Rename", "Write", "ReadIn", "SendStart", "Build", "Move", "Moved", "Failed", "Sent"}
Count == took' = took \cup {n \in Steps : model' # model /\ Act(n)}

Init == D!Init /\ i = 0 /\ took = {} /\ TLCSet(1, 0)

\* (each line taken for the first time is printed, with the model after it: the last one printed is the farthest)
Next ==
  /\ i < Len(Trace)
  /\ Act(Trace[i + 1].a) /\ Shows(Trace[i + 1])
  /\ i' = i + 1
  /\ Count
  /\ IF i' > TLCGet(1)
       THEN TLCSet(1, i') /\ PrintT(<<"reached", i', [gh |-> gh', read |-> read', ch |-> ch', pc |-> pc']>>)
       ELSE TRUE

Spec == Init /\ [][Next]_<<model, i, took>>

NotDone == i < Len(Trace)
=============================================================================
