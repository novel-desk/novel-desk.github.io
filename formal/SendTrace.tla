------------------------------ MODULE SendTrace ------------------------------
(* The trace check of Send.tla: the traces of the screen test tests/ui/trace.spec.mjs (Send), taken by Send.tla's
   steps one line after another. The screen writes down its steps (ui/trace.js: typed, read in, sent, and the send's
   steps in ui/send.js), with what it shows after each: the episode followed as read, its draft, the text box; the
   test writes down what it writes elsewhere and the branch after a send moved it (tests/ui/lib/trace.mjs).
   tools/trace_check.mjs writes the trace in SendTraceData.tla, in the model's terms (a letter typed here a, b, c is
   h1, h2, h3; one written elsewhere x, y is t1, t2), and runs TLC on this module. The invariant NotDone is broken when
   the whole trace was taken. *)
EXTENDS Naturals, Sequences, TLC, SendTraceData

VARIABLES gh, read, draft, screen, composing, pc, s, typed, written,
  i,     \* the lines taken
  took   \* the model's steps taken (tools/trace_check.mjs counts them)

D == INSTANCE Send WITH Here <- {h1, h2, h3}, There <- {t1, t2}, Tries <- 3, Commits <- 1000, Kept <- TRUE, Forced <- FALSE, Cleared <- FALSE

model == <<gh, read, draft, screen, composing, pc, s, typed, written>>

\* what the line says after the step (a line says only what its side knows)
Has(e, f) == f \in DOMAIN e
Shows(e) ==
  /\ Has(e, "gh") => gh' = e.gh
  /\ Has(e, "read") => read' = e.read
  /\ Has(e, "draft") => draft' = e.draft
  /\ Has(e, "screen") => screen' = e.screen
  /\ Has(e, "composing") => composing' = e.composing

\* (an input that leaves the text as it was, the word converted by the input method, is no step of the model: what
\* the line says must be the model as it is)
Act(n) ==
  CASE n = "Type" -> (\E c \in {h1, h2, h3} : D!Type(c)) \/ UNCHANGED model
    [] n = "Compose" -> (\E c \in {h1, h2, h3} : D!Compose(c)) \/ UNCHANGED model
    [] n = "Converted" -> D!Converted
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
Steps == {"Type", "Compose", "Converted", "Write", "ReadIn", "SendStart", "Build", "Move", "Moved", "Failed", "Sent"}
Count == took' = took \cup {n \in Steps : model' # model /\ Act(n)}

Init == D!Init /\ i = 0 /\ took = {} /\ TLCSet(1, 0)

\* (each line taken for the first time is printed, with the model after it: the last one printed is the farthest)
Next ==
  /\ i < Len(Trace)
  /\ Act(Trace[i + 1].a) /\ Shows(Trace[i + 1])
  /\ i' = i + 1
  /\ Count
  /\ IF i' > TLCGet(1)
       THEN TLCSet(1, i') /\ PrintT(<<"reached", i', [gh |-> gh', read |-> read', draft |-> draft', screen |-> screen', pc |-> pc']>>)
       ELSE TRUE

Spec == Init /\ [][Next]_<<model, i, took>>

NotDone == i < Len(Trace)
=============================================================================
