-------------------------------- MODULE Send --------------------------------
(* Sending what was written on this device to a branch that others write to too (ui/send.js sendAll, ui/desk.js
   sendDrafts, keepText, readIn and the sends of 自動, lib/merge.js, lib/drafts.js afterSend). One episode: a text is
   the set of the letters typed into it, and a blob is its text (a blob is named by its content). The branch moves
   forward only from the commit the send read (never forced); a branch that moved on is read again, and a text changed
   there too is put together with the one there (lib/merge.js mergeLines): the two sets put together. Where both wrote
   the same lines (which the letters do not tell: either may be), the two versions are put side by side, and the text is
   marked: a marked text is not sent (Held), it stays on the device until the author has tidied it (Tidy). *)
EXTENDS Naturals, FiniteSets

CONSTANTS Here, There, Tries, Commits, Kept, Forced, Cleared, Held
  \* the letters typed on this device; the letters written elsewhere (another device, GitHub); how many times a send
  \* reads the branch again when it moved on (ui/send.js TRIES); Commits: the commits TLC follows the branch to (a
  \* send whose answer is lost may be made again and again: Bound); Kept: what is typed while a word is being converted
  \* (an input method) is kept as the draft too, as any other input; Forced: the branch is moved without checking that
  \* it is still where the send read it (a broken send); Cleared: a send clears the draft whatever was typed meanwhile
  \* (a broken afterSend); Held: a text with places side by side in it is not sent (FALSE: sent, as before)
None == [has |-> FALSE, text |-> {}, base |-> {}, marked |-> FALSE]

VARIABLES
  gh,        \* the branch on GitHub: its commit (a number), the text of the episode there and whether it is marked
  read,      \* the commit this device read (the work), as gh
  draft,     \* the draft kept on the device: its text, the blob it was written on and whether it is marked; or None
  screen,    \* what the text box shows
  composing, \* a word is being converted in the text box
  pc,        \* the send: "idle", "taken" (the drafts taken), "built" (the commit made on the head it read), "moved"
  s,         \* the send's values: the text taken, the blob it was written on and whether it was marked, the head read
             \* (its commit: `there`), the text made, whether it was put together with the one there, whether it is
             \* marked, how many times it read the branch
  typed,     \* the letters typed on this device
  written    \* the letters written elsewhere

vars == <<gh, read, draft, screen, composing, pc, s, typed, written>>

Commit0 == [n |-> 0, text |-> {}, marked |-> FALSE]
S0 == [taken |-> {}, base |-> {}, was |-> FALSE, head |-> 0, there |-> Commit0, text |-> {}, both |-> FALSE, marked |-> FALSE, tries |-> 0]

Init ==
  /\ gh = Commit0 /\ read = gh /\ draft = None /\ screen = {} /\ composing = FALSE
  /\ pc = "idle" /\ s = S0 /\ typed = {} /\ written = {}

DraftText == IF draft.has THEN draft.text ELSE {}

\* keepText: the text in the box kept as the draft at once, on the blob the draft was written on (else the blob read),
\* marked as it was (a letter typed leaves the places side by side as they are); no draft when it is the text read
\* (lib/drafts.js draftOf)
Keep(t) ==
  draft' = IF t = read.text THEN None ELSE [has |-> TRUE, text |-> t, base |-> IF draft.has THEN draft.base ELSE read.text, marked |-> draft.has /\ draft.marked]

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

\* the places side by side in the draft tidied by the author (the lines that mark them taken out): its letters stay
Tidy ==
  /\ draft.has /\ draft.marked
  /\ draft' = [draft EXCEPT !.marked = FALSE]
  /\ UNCHANGED <<gh, read, screen, composing, pc, s, typed, written>>

\* written elsewhere: a commit on the branch
Write(c) ==
  /\ c \in There \ written
  /\ gh' = [gh EXCEPT !.n = gh.n + 1, !.text = gh.text \cup {c}]
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
  /\ pc' = "taken" /\ s' = [S0 EXCEPT !.taken = draft.text, !.base = draft.base, !.was = draft.marked]
  /\ UNCHANGED <<gh, read, draft, screen, composing, typed, written>>

\* the head read (and its tree when it moved on): the text taken, or, when the text there is not the one it was written
\* on, the two put together (lib/merge.js sendPlan, mergeLines; lib/send.js sentText). It is marked when it was, or
\* when both wrote the same lines (only when both wrote)
Both == s.base # gh.text /\ s.taken # gh.text
Made(m) == [s EXCEPT !.head = gh.n, !.there = gh, !.text = IF Both THEN s.taken \cup gh.text ELSE s.taken, !.both = Both, !.marked = m]
Marks == IF Both THEN {s.was, TRUE} ELSE {s.was}

\* then the blobs, the tree and the commit made on that head (not for a marked text, when it is Held)
Build ==
  /\ pc = "taken"
  /\ \E m \in Marks : ~(Held /\ m) /\ s' = Made(m)
  /\ pc' = "built"
  /\ UNCHANGED <<gh, read, draft, screen, composing, typed, written>>

\* or, the text marked, nothing sent (ui/send.js `held`: no commit, nothing else to send in the model)
Hold ==
  /\ pc = "taken" /\ Held
  /\ \E m \in Marks : m /\ s' = Made(m)
  /\ pc' = "held"
  /\ UNCHANGED <<gh, read, draft, screen, composing, typed, written>>

\* the branch moved to the commit: only from the head the send read (Forced: from wherever it is)
Move ==
  /\ pc = "built" /\ (Forced \/ gh.n = s.head)
  /\ gh' = [n |-> gh.n + 1, text |-> s.text, marked |-> s.marked]
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
  /\ pc \in {"taken", "built", "moved", "held"}
  /\ pc' = "idle" /\ s' = S0
  /\ UNCHANGED <<gh, read, draft, screen, composing, typed, written>>

\* the send done: the work is the commit made; the draft goes when it is still the text taken; typed on meanwhile, it
\* stays, written on the blob sent, what was typed put in the text sent (lib/drafts.js afterSend: the union; marked
\* when the two were put together, and what was typed is in the same lines as what was written there, which either
\* may be). Held: the work is the commit read; the draft, still the text taken, is the text made, marked, written on
\* the blob there (lib/drafts.js afterHeld); typed on meanwhile, as it is. The text box shows the draft, else the text
\* read
Sent ==
  /\ pc \in {"moved", "held"}
  /\ read' = IF pc = "held" THEN s.there ELSE [n |-> s.head, text |-> s.text, marked |-> s.marked]
  /\ \E m \in BOOLEAN :
       draft' = IF pc = "held"
                  THEN IF draft.has /\ draft.text = s.taken THEN [has |-> TRUE, text |-> s.text, base |-> s.there.text, marked |-> TRUE] ELSE draft
                  ELSE IF Cleared \/ draft.text = s.taken THEN None
                  ELSE [has |-> TRUE, text |-> draft.text \cup s.text, base |-> s.text, marked |-> s.both /\ m]
  /\ screen' = IF draft'.has THEN draft'.text ELSE read'.text
  /\ pc' = "idle" /\ s' = S0
  /\ UNCHANGED <<gh, composing, typed, written>>

Next ==
  \/ \E c \in Here : Type(c) \/ Compose(c)
  \/ Converted \/ Tidy
  \/ \E c \in There : Write(c)
  \/ ReadIn \/ SendStart \/ Build \/ Hold \/ Move \/ Moved \/ Failed \/ Sent

Spec == Init /\ [][Next]_vars

\* (the state constraint of the checks: the branch followed up to Commits commits)
Bound == gh.n <= Commits

TypeOK ==
  /\ gh \in [n : Nat, text : SUBSET (Here \cup There), marked : BOOLEAN] /\ read \in [n : Nat, text : SUBSET (Here \cup There), marked : BOOLEAN]
  /\ pc \in {"idle", "taken", "built", "moved", "held"} /\ composing \in BOOLEAN

\* nothing typed here or written elsewhere is lost: what was written elsewhere stays on the branch, and what was typed
\* here is on the branch, in the draft, or still in the box
NoLoss == written \subseteq gh.text /\ typed \subseteq gh.text \cup DraftText \cup screen

\* with no draft and no send on its way, everything typed here is on the branch (FR-SAVE-03)
CleanIsSent == (~draft.has /\ ~composing /\ pc = "idle") => typed \subseteq gh.text

\* GitHub never has a text with places side by side: a marked text stays on the device until it is tidied
Unmarked == ~gh.marked

\* the box shows the draft, or the text read when there is none (what is typed goes into what is shown); before (not
\* Kept), not while a word is being converted
Shown == (Kept \/ ~composing) => screen = IF draft.has THEN draft.text ELSE read.text
=============================================================================
