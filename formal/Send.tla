-------------------------------- MODULE Send --------------------------------
(* Sending what was written on this device to a branch that others write to too (ui/send.js sendAll, ui/desk.js
   sendDrafts, keepText, readIn and the sends of 自動, lib/merge.js, lib/drafts.js afterSend). One episode: a text is
   the set of the letters typed into it, and a blob is its text (a blob is named by its content). The branch moves
   forward only from the commit the send read (never forced); a branch that moved on is read again, and a text changed
   there too keeps both versions: the two sets put together. *)
EXTENDS Naturals, FiniteSets

CONSTANTS Here, There, Tries, Commits, Kept, Forced, Cleared
  \* the letters typed on this device; the letters written elsewhere (another device, GitHub); how many times a send
  \* reads the branch again when it moved on (ui/send.js TRIES); Commits: the commits TLC follows the branch to (a
  \* send whose answer is lost may be made again and again: Bound); Kept: what is typed while a word is being converted
  \* (an input method) is kept as the draft too, as any other input; Forced: the branch is moved without checking that
  \* it is still where the send read it (a broken send); Cleared: a send clears the draft whatever was typed meanwhile
  \* (a broken afterSend)
None == [has |-> FALSE, text |-> {}, base |-> {}]

VARIABLES
  gh,        \* the branch on GitHub: its commit (a number) and the text of the episode there
  read,      \* the commit and the text this device read (the work)
  draft,     \* the draft kept on the device: its text and the blob it was written on; or None
  screen,    \* what the text box shows
  composing, \* a word is being converted in the text box
  pc,        \* the send: "idle", "taken" (the drafts taken), "built" (the commit made on the head it read), "moved"
  s,         \* the send's values: the text taken, the blob it was written on, the head read, the text there then,
             \* the text sent, whether both were kept, how many times it read the branch
  typed,     \* the letters typed on this device
  written    \* the letters written elsewhere

vars == <<gh, read, draft, screen, composing, pc, s, typed, written>>

S0 == [taken |-> {}, base |-> {}, head |-> 0, theirs |-> {}, text |-> {}, both |-> FALSE, tries |-> 0]

Init ==
  /\ gh = [n |-> 0, text |-> {}] /\ read = gh /\ draft = None /\ screen = {} /\ composing = FALSE
  /\ pc = "idle" /\ s = S0 /\ typed = {} /\ written = {}

DraftText == IF draft.has THEN draft.text ELSE {}

\* keepText: the text in the box kept as the draft at once, on the blob the draft was written on (else the blob read);
\* no draft when it is the text read (lib/drafts.js draftOf)
Keep(t) ==
  draft' = IF t = read.text THEN None ELSE [has |-> TRUE, text |-> t, base |-> IF draft.has THEN draft.base ELSE read.text]

\* a letter typed
Type(c) ==
  /\ ~composing /\ c \in Here \ typed
  /\ screen' = screen \cup {c} /\ Keep(screen \cup {c})
  /\ typed' = typed \cup {c}
  /\ UNCHANGED <<gh, read, composing, pc, s, written>>

\* a letter typed while a word is being converted: kept as the draft too (Kept), or only shown (before)
Compose(c) ==
  /\ c \in Here \ typed
  /\ composing' = TRUE /\ screen' = screen \cup {c}
  /\ IF Kept THEN Keep(screen \cup {c}) ELSE UNCHANGED draft
  /\ typed' = typed \cup {c}
  /\ UNCHANGED <<gh, read, pc, s, written>>

\* the word converted: the text in the box kept (compositionend)
Converted ==
  /\ composing
  /\ composing' = FALSE /\ Keep(screen)
  /\ UNCHANGED <<gh, read, screen, pc, s, typed, written>>

\* written elsewhere: a commit on the branch
Write(c) ==
  /\ c \in There \ written
  /\ gh' = [n |-> gh.n + 1, text |-> gh.text \cup {c}]
  /\ written' = written \cup {c}
  /\ UNCHANGED <<read, draft, screen, composing, pc, s, typed>>

\* readIn: the branch read again while no send is on its way; the text box shows it when there is no draft
ReadIn ==
  /\ pc = "idle" /\ read # gh
  /\ read' = gh
  /\ screen' = IF draft.has THEN screen ELSE gh.text
  /\ UNCHANGED <<gh, draft, composing, pc, s, typed, written>>

\* 送る, or 自動 (a while after the last key, the page left, back online): one send at a time, the drafts taken
SendStart ==
  /\ pc = "idle" /\ draft.has
  /\ pc' = "taken" /\ s' = [S0 EXCEPT !.taken = draft.text, !.base = draft.base]
  /\ UNCHANGED <<gh, read, draft, screen, composing, typed, written>>

\* the head read (and its tree when it moved on): the text taken, or both when the text there is not the one it was
\* written on (lib/merge.js sendPlan, keptBoth); then the blobs, the tree and the commit made on that head
Build ==
  /\ pc = "taken"
  /\ LET both == s.base # gh.text /\ s.taken # gh.text
     IN s' = [s EXCEPT !.head = gh.n, !.theirs = gh.text, !.text = IF both THEN s.taken \cup gh.text ELSE s.taken, !.both = both]
  /\ pc' = "built"
  /\ UNCHANGED <<gh, read, draft, screen, composing, typed, written>>

\* the branch moved to the commit: only from the head the send read (Forced: from wherever it is)
Move ==
  /\ pc = "built" /\ (Forced \/ gh.n = s.head)
  /\ gh' = [n |-> gh.n + 1, text |-> s.text]
  /\ pc' = "moved" /\ s' = [s EXCEPT !.head = gh.n + 1]
  /\ UNCHANGED <<read, draft, screen, composing, typed, written>>

\* moved on since it was read (422): the head read again, a few times; then the send fails, the drafts kept
Moved ==
  /\ pc = "built" /\ ~Forced /\ gh.n # s.head
  /\ IF s.tries + 1 < Tries
       THEN pc' = "taken" /\ s' = [s EXCEPT !.tries = @ + 1]
       ELSE pc' = "idle" /\ s' = S0
  /\ UNCHANGED <<gh, read, draft, screen, composing, typed, written>>

\* GitHub not reached, or its answer lost (before the branch moved, or after: the commit is made, the page does not
\* know): the send fails, the drafts kept as they are
Failed ==
  /\ pc \in {"taken", "built", "moved"}
  /\ pc' = "idle" /\ s' = S0
  /\ UNCHANGED <<gh, read, draft, screen, composing, typed, written>>

\* the send done: the work is the commit made; the draft goes when it is still the text taken; typed on meanwhile, it
\* stays, written on the blob sent (on the blob it was, when both were kept: its next send keeps the other version too).
\* The text box shows the text sent when no draft is left
Sent ==
  /\ pc = "moved"
  /\ read' = [n |-> s.head, text |-> s.text]
  /\ draft' = IF Cleared \/ draft.text = s.taken THEN None ELSE IF s.both THEN draft ELSE [draft EXCEPT !.base = s.text]
  /\ screen' = IF draft'.has THEN screen ELSE s.text
  /\ pc' = "idle" /\ s' = S0
  /\ UNCHANGED <<gh, composing, typed, written>>

Next ==
  \/ \E c \in Here : Type(c) \/ Compose(c)
  \/ Converted
  \/ \E c \in There : Write(c)
  \/ ReadIn \/ SendStart \/ Build \/ Move \/ Moved \/ Failed \/ Sent

Spec == Init /\ [][Next]_vars

\* (the state constraint of the checks: the branch followed up to Commits commits)
Bound == gh.n <= Commits

TypeOK ==
  /\ gh \in [n : Nat, text : SUBSET (Here \cup There)] /\ read \in [n : Nat, text : SUBSET (Here \cup There)]
  /\ pc \in {"idle", "taken", "built", "moved"} /\ composing \in BOOLEAN

\* nothing typed here or written elsewhere is lost: what was written elsewhere stays on the branch, and what was typed
\* here is on the branch, in the draft, or still in the box
NoLoss == written \subseteq gh.text /\ typed \subseteq gh.text \cup DraftText \cup screen

\* with no draft and no send on its way, everything typed here is on the branch (FR-SAVE-03)
CleanIsSent == (~draft.has /\ ~composing /\ pc = "idle") => typed \subseteq gh.text

\* the box shows the draft, or the text read when there is none (what is typed goes into what is shown); before (not
\* Kept), not while a word is being converted
Shown == (Kept \/ ~composing) => screen = IF draft.has THEN draft.text ELSE read.text
=============================================================================
