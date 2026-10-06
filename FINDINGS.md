# Findings

Things this adapter learned by being built against a real system, kept because
they are useful to whoever builds the next one. Defects in our own work are
here alongside gaps in the specification, which is the only honest way to keep
such a list.

## Method

### A gate only checks what it reads

`parse_iso` converted SceneScape's ISO timestamps through
`datetime.timestamp()`, a float64, whose resolution near 1.79e9 seconds is
about 440 ns. Over the reference corpus, 15,522 of 15,581 published stamps
were wrong, a median of 59 ns and a maximum of 118 ns, on every lane at once.

Nine gates passed over it, and the reason each one could not see it is the
finding:

| gate | why it could not see a wrong timestamp |
|---|---|
| conservation audit | counts messages; a wrong stamp still counts as one |
| determinism | compares a run against another run of the same code, so a consistent error reproduces consistently and passes |
| golden point, golden vector | read positions, not times |
| schema and loadability checks | read structure, not values |
| route regression | compares two implementations that shared the parser |

The first check that compared a published stamp against the string it came
from found it immediately, in every lane. **Golden vectors earn their keep by
being computed from the source rather than from the system**, and the
corollary is that a field no gate ever reads is a field with no coverage,
however many gates are green.

### A verification claim is an output, and an output needs a producer

The same lesson one level up. Three of the ten gates cannot run on the shipped
sample, because they compare output against the recorded input it came from
and the sample is an output. The README said so plainly, and the clean-clone
verification then exercised seven gates and was reported as though it had
covered all ten.

Two of the three unexercised gates were broken in the published repository.
`determinism` invoked a path that had not existed since the repository was
curated. `conservation_audit` read its declared-dropped table from a file that
`.gitignore` excluded, so on a fresh clone it reported every deliberately
dropped input topic as unexplained. Both would have been hit by the first
person following the README's own instructions.

So the claim is now generated rather than asserted: `gates/run_all.py` runs
every gate and prints PASS, FAIL, or SKIPPED with the reason, and the README
quotes that output. A gate that cannot run says so by name, in the place that
previously said nothing at all.

The sentence the pair implies, and the reason both notes are here together:
**a verification claim is itself an output, and an output nobody produces is
an output nobody checked.** The runner is now that producer. Prose beside a
test run is not evidence that the run happened, or that it covered what the
prose says it covered.

## Specification and module findings

*Phase 2 findings against `spatial.owm/0.1` are added here as they land.*
