------------------------------- MODULE Rebase -------------------------------
(* An operation not sent yet (an episode renamed, moved or put in the trash: its file gone from where it was and put
   where it goes, lib/changes.js moveFiles) against a branch that others write to (ui/send.js sendAll, which does not
   send an operation whose files changed there: Overlapped; ui/desk.js rebaseChanges on reading the branch again, and
   lib/changes.js rebase, which gives the operation up and keeps the text typed in it as a draft where the file came
   from, on the blob it was written on). One episode at "a", renamed to "b"; a text is the set of the letters in it and
   a blob is its text. A text written alone (no operation) is sent as Send.tla says: both versions kept. *)
EXTENDS Naturals, FiniteSets

CONSTANTS Here, There, Tries, Commits, Checked, KeptText, Idle
  \* the letters typed on this device; the letters written elsewhere into the episode at "a"; how many times a send
  \* reads the branch again when it moved on (ui/send.js TRIES); the commits TLC follows
  \* the branch to (Bound); Checked: an operation whose files changed on the branch is not sent (a broken send sends
  \* it); KeptText: the text typed in an operation given up stays as a draft (a broken rebase drops it); Idle: an
  \* operation is made only while no send is on its way (ui/desk.js apply; before, the episode's title could be changed
  \* during a send, and the send's end made the operation's change of the draft it took a change of nothing)
Paths == {"a", "b"}
NoFile == [has |-> FALSE, text |-> {}]
Nothing == NoFile   \* the base of a change made where no file was
\* a change kept on the device (lib/changes.js Change): none, a text written ("text"), a blob of the branch put there
\* ("sha", its content in `text`), or the file gone ("gone"); the blob it was made on; whether an operation made it
NoChange == [kind |-> "none", text |-> {}, base |-> Nothing, op |-> FALSE]

VARIABLES
  gh,       \* the branch: its commit (a number) and its files, by path
  read,     \* the commit and the files this device read
  ch,       \* the changes not sent, by path
  pc,       \* the send: "idle", "taken", "built", "moved"
  s,        \* the send's values: the changes taken, the head read, the files it makes, the files kept both
  typed,    \* the letters typed on this device
  written   \* the letters written elsewhere

vars == <<gh, read, ch, pc, s, typed, written>>

Files0 == [p \in Paths |-> IF p = "a" THEN [has |-> TRUE, text |-> {}] ELSE NoFile]
S0 == [taken |-> [p \in Paths |-> NoChange], head |-> 0, files |-> Files0, both |-> {}, tries |-> 0]

Init ==
  /\ gh = [n |-> 0, f |-> Files0] /\ read = gh /\ ch = [p \in Paths |-> NoChange]
  /\ pc = "idle" /\ s = S0 /\ typed = {} /\ written = {}

\* the blob at p, as a base (Nothing when no file is there)
BaseOf(files, p) == files[p]
\* what the screen shows at p: the change over the file read
View(p) == IF ch[p].kind \in {"text", "sha"} THEN [has |-> TRUE, text |-> ch[p].text]
           ELSE IF ch[p].kind = "gone" THEN NoFile ELSE read.f[p]
\* the episode open: where it is in what the screen shows
Open == IF View("b").has THEN "b" ELSE "a"
OpPending == \E p \in Paths : ch[p].op

\* a letter typed in the episode: over a change of the operation, the same change with the text (lib/drafts.js
\* typedOver); else a draft on the change's blob, or on the blob read (keepText)
Type(c) ==
  /\ c \in Here \ typed /\ View(Open).has
  /\ LET p == Open
         t == View(p).text \cup {c}
     IN ch' = [ch EXCEPT ![p] = IF ch[p].op THEN [@ EXCEPT !.kind = "text", !.text = t]
                                ELSE [kind |-> "text", text |-> t, base |-> IF ch[p].kind = "text" THEN ch[p].base ELSE BaseOf(read.f, p), op |-> FALSE]]
  /\ typed' = typed \cup {c}
  /\ UNCHANGED <<gh, read, pc, s, written>>

\* the episode renamed (lib/changes.js moveFiles): gone from "a", on the blob its draft was written on (else the blob
\* read); put at "b" with its draft's text, or the blob read
Rename ==
  /\ Idle => pc = "idle"
  /\ ~OpPending /\ Open = "a" /\ View("a").has /\ ~View("b").has
  /\ ch' = [p \in Paths |->
             IF p = "a" THEN [kind |-> "gone", text |-> {}, base |-> IF ch.a.kind = "text" THEN ch.a.base ELSE BaseOf(read.f, "a"), op |-> TRUE]
             ELSE IF ch.a.kind = "text" THEN [kind |-> "text", text |-> ch.a.text, base |-> Nothing, op |-> TRUE]
             ELSE [kind |-> "sha", text |-> read.f.a.text, base |-> Nothing, op |-> TRUE]]
  /\ UNCHANGED <<gh, read, pc, s, typed, written>>

\* written elsewhere into the episode where it is on the branch
Write(c) ==
  /\ c \in There \ written /\ gh.f.a.has
  /\ gh' = [n |-> gh.n + 1, f |-> [gh.f EXCEPT !.a.text = @ \cup {c}]]
  /\ written' = written \cup {c}
  /\ UNCHANGED <<read, ch, pc, s, typed>>

\* the changes of an operation whose files are no longer the blobs it was made on (lib/changes.js conflictsOf)
Overlaps(changes, files) == {p \in Paths : changes[p].op /\ BaseOf(files, p) # changes[p].base}

\* the branch read again (readIn, 再読み込み), no send on its way: an operation whose files changed there is given up;
\* the text typed in it stays as a draft where the file came from, on the blob it was written on (KeptText)
ReadIn ==
  /\ pc = "idle" /\ read # gh
  /\ read' = gh
  /\ ch' = IF Overlaps(ch, gh.f) = {} THEN ch
           ELSE [p \in Paths |->
                  IF p = "a" /\ KeptText /\ ch.b.kind = "text" THEN [kind |-> "text", text |-> ch.b.text, base |-> ch.a.base, op |-> FALSE]
                  ELSE NoChange]
  /\ UNCHANGED <<gh, pc, s, typed, written>>

\* 送る or 自動: the changes taken
SendStart ==
  /\ pc = "idle" /\ \E p \in Paths : ch[p].kind # "none"
  /\ pc' = "taken" /\ s' = [S0 EXCEPT !.taken = ch]
  /\ UNCHANGED <<gh, read, ch, typed, written>>

\* the head read: an operation whose files changed there is not sent (Overlapped: the send stops, the changes kept);
\* else the files it makes: an operation's as it says; a text written alone, both versions when the one there is not
\* the one it was written on
Build ==
  /\ pc = "taken"
  /\ IF Checked /\ Overlaps(s.taken, gh.f) # {}
       THEN pc' = "idle" /\ s' = S0
       ELSE LET t == s.taken
                both == {p \in Paths : t[p].kind = "text" /\ ~t[p].op /\ BaseOf(gh.f, p) # t[p].base /\ gh.f[p].has /\ gh.f[p].text # t[p].text}
            IN /\ s' = [s EXCEPT !.head = gh.n, !.both = both,
                          !.files = [p \in Paths |->
                                      CASE t[p].kind = "gone" -> NoFile
                                        [] t[p].kind = "none" -> gh.f[p]
                                        [] p \in both -> [has |-> TRUE, text |-> t[p].text \cup gh.f[p].text]
                                        [] OTHER -> [has |-> TRUE, text |-> t[p].text]]]
               /\ pc' = "built"
  /\ UNCHANGED <<gh, read, ch, typed, written>>

\* the branch moved to the commit, only from the head the send read
Move ==
  /\ pc = "built" /\ gh.n = s.head
  /\ gh' = [n |-> gh.n + 1, f |-> s.files] /\ pc' = "moved" /\ s' = [s EXCEPT !.head = gh.n + 1]
  /\ UNCHANGED <<read, ch, typed, written>>

\* moved on since it was read (422): the head read again with the same changes taken, a few times; then the send
\* fails, the changes kept
Moved ==
  /\ pc = "built" /\ gh.n # s.head
  /\ IF s.tries + 1 < Tries
       THEN pc' = "taken" /\ s' = [s EXCEPT !.tries = @ + 1]
       ELSE pc' = "idle" /\ s' = S0
  /\ UNCHANGED <<gh, read, ch, typed, written>>

\* GitHub not reached, or its answer lost: the send fails, the changes kept
Failed ==
  /\ pc \in {"taken", "built", "moved"}
  /\ pc' = "idle" /\ s' = S0
  /\ UNCHANGED <<gh, read, ch, typed, written>>

\* the send done (lib/drafts.js afterSend): a change goes when its text is still the one taken (a gone file, a blob
\* put there: no text); typed on meanwhile, it stays, a draft on the blob sent (on the blob it was, when both kept)
Sent ==
  /\ pc = "moved"
  /\ read' = [n |-> s.head, f |-> s.files]
  /\ ch' = [p \in Paths |->
             LET c == ch[p] IN
             IF c.kind = "none" \/ (c.kind \in {"gone", "sha"} /\ s.taken[p].kind = c.kind) \/ (c.kind = "text" /\ s.taken[p].kind = "text" /\ c.text = s.taken[p].text)
               THEN NoChange
             ELSE IF p \in s.both THEN c
             ELSE [kind |-> "text", text |-> c.text, base |-> BaseOf(s.files, p), op |-> FALSE]]
  /\ pc' = "idle" /\ s' = S0
  /\ UNCHANGED <<gh, typed, written>>

Next ==
  \/ \E c \in Here : Type(c)
  \/ Rename
  \/ \E c \in There : Write(c)
  \/ ReadIn \/ SendStart \/ Build \/ Move \/ Moved \/ Failed \/ Sent

Spec == Init /\ [][Next]_vars

\* (the state constraint of the checks: the branch followed up to Commits commits)
Bound == gh.n <= Commits

TypeOK ==
  /\ pc \in {"idle", "taken", "built", "moved"}
  /\ \A p \in Paths : ch[p].kind \in {"none", "text", "sha", "gone"}

OnBranch == UNION {gh.f[p].text : p \in Paths}
Kept == UNION {ch[p].text : p \in Paths}

\* nothing typed here or written elsewhere is lost: what was written elsewhere stays on the branch (an operation does not
\* take away a file changed there), and what was typed here is on the branch or kept on the device
NoLoss == written \subseteq OnBranch /\ typed \subseteq OnBranch \cup Kept

\* an operation's changes go together: the file gone from "a" and put at "b", or neither
Whole == ch.a.op <=> ch.b.op
=============================================================================
