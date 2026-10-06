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

## Coverage census, `spatial.owm/0.1`

Every surface the provisional module declares, and whether this adapter
exercised it. The promotion argument rests on this table being honest, so an
unexercised surface is stated with the reason rather than quietly omitted.

| Surface | Exercised | Why |
|---|---|---|
| `Entity`, basis `OBSERVED` | yes | 47 fused tracks, one entity each |
| `Entity`, basis `DECLARED` | yes | 2 configured regions |
| `Entity`, basis `AUTHORED` | no | nothing northbound is authored content; inventing one would be fake coverage |
| `Entity`, basis `DERIVED` | no | nothing here is inferred from another model's output |
| `LifecycleState.ACTIVE` | yes | every create |
| `LifecycleState.RETIRED` | yes | 43 terminal samples, each with a reason, then dispose per §2.14 |
| `LifecycleState.UNOBSERVED` | no | SceneScape reports a track leaving its tracker, which is a claim about the tracker. UNOBSERVED is a claim about the world: the thing is there and nothing can see it. Asserting the stronger from the weaker would be over-claiming |
| `LifecycleState.SUPERSEDED` | no | needs identity semantics to say what superseded what, and 0.1 reserves them |
| `state_reason` | yes | every RETIRED sample; text names the retention rule, the measured gap and the last `reid_state` |
| `ModelLayer` | yes, as a hint | `FAST` on tracks, `STATIC` on regions. Informational in 0.1 and not used for topic splitting |
| `pose` on `Entity` | yes | on create, from the producer's first observed translation |
| `extent` on `Entity` | yes | regions only, as the axis-aligned fallback the module names |
| Zone footprint via `events::SpatialZone` | yes, by adapter convention | see the footprint finding below |
| `type_uris` | yes, with a caveat | COCO URIs, chosen by this adapter; see the vocabulary finding |
| `properties`, `external_refs` | `properties` yes, `external_refs` no | properties carry the provisional marking, the module id, the SceneScape track id and reid state. Nothing northbound has an external registry id to put in `external_refs` |
| `content_refs` | no | these entities are people and operator-drawn regions. Neither is rendered from catalogue content, and a `spatialdds://` URI pointing at nothing would be worse than an empty sequence |
| `ModelPose` | no | this adapter's fast tier is `FusedTrackSet`, which already carries the same pose with covariance and track provenance that `ModelPose` has nowhere to put. Publishing both would be two writers describing one physical thing, which Appendix M.2 forbids |
| `ModelCommand`, verbs | no | the sidecar is northbound only and issues no commands |
| `ModelCommand`, declines | no | follows from the above: nothing to decline |
| Two-tier tempo | half | the slow tier is exercised; the fast tier lives on the semantics lane instead |
| Relationships | n/a | excluded from 0.1 by design |

### The lane's sample count, decomposed

92 `owm::Entity` samples over the reference corpus, each term read off the
recording:

    47  OBSERVED / ACTIVE    one per track lifecycle
    43  OBSERVED / RETIRED   one per track that left within the window
    --
    90  track-lifecycle samples
     2  DECLARED / ACTIVE    one per configured region, latched
    --
    92  total

The four tracks that appear in the 47 but not the 43 were still live when the
recording ended, which is why creates exceed retires. Against 15,584 samples
on the other lanes that is one entity sample per 169, and against 5,947
`regulated/scene` frames it is one per 65. The lane is lifecycle-shaped, not
frame-shaped, which is what the tempo gate asserts rather than assumes.

## Specification and module findings

Each is written as the smallest change that would have closed it, because that
is the form a specification can act on.

### 1. An area entity cannot reference its own footprint

**The headline finding.** The module says area and region entities "describe
their footprint with `events::SpatialZone`" and adds no zone type of its own.
`Entity` has no field that can carry which `SpatialZone`. Not `content_refs`,
whose canonical form is a `spatialdds://` manifest URI for catalogue assets.
Not a relationship, which 0.1 explicitly reserves. The module directs an
implementer to a type and gives no way to name the instance.

This adapter closes it with a declared property, `footprint_zone_id`, whose
value is exactly the `SpatialZone.zone_id` published on the events lane. It is
on the wire rather than in this repository's documentation, so a consumer who
has never read our README still sees an explicit reference, and migration to a
typed field is mechanical.

*Lossiness class: adapter convention, pending a module decision.*

Smallest change that would close it: one guarded field on `Entity`,
`boolean has_footprint_ref; string footprint_ref;`. Noting that if a base
relationship type joins 0.2, footprint-of may belong there instead, which is a
fork for the identity and relationship design rather than a drafting choice.

Arrived at independently, from the implementation side, without reading the
first implementation. It is the same gap the module's own Reserved section
names when it says 0.1 "cannot express the reference deployment's own
containment edges".

### 2. Line geometry has nowhere to go

Tripwires get no entity here. A `CrossingLine` is not an area: 0.1 has no line
shape, and an axis-aligned box drawn around a line asserts an area the
operator never drew. `CrossingLine` stays on the events lane where it is
already correct, and the entity lane says nothing rather than something false.

*Not exercised: line-geometry entities. Over-claiming via `extent` declined.*

### 3. `Entity` cannot satisfy §2.11's provisional marking

§2.11 says producers of provisional types SHOULD mark data with a `MetaKV`
entry, `namespace = "schema"`, `stability = "provisional"`. `owm::Entity` has
no `MetaKV` field; it has `sequence<KV, 32> properties`, whose `KV` is a flat
pair with no namespace. The other route §2.11 offers is `caps.features` on
`Announce`, a type a northbound sidecar does not publish.

Closest conforming form available on the type itself is a namespace-prefixed
key in `properties`, which is what this adapter publishes
(`schema.stability = provisional`). Smallest change: either a `MetaKV` field on
`Entity`, or a sentence in §2.11 blessing a prefixed `KV` where no `MetaKV`
exists.

### 4. §2.11 and the module disagree about `schema_version`

§2.11 says `schema_version` appears on latched and durable types. `Entity` is
RELIABLE and TRANSIENT_LOCAL, and has no such field; the module states this
deliberately. The two documents disagree in writing. This adapter carries the
module id as a property so a recording stays self-describing, which matters
more than usual for a module whose layout may change incompatibly between
revisions.

### 5. No topic names exist for the module

The module adds no registry rows, so §3.3.1 defines no topic name for its
types. This adapter publishes `spatialdds/<scene>/model/entity/v0`, following
§3.3.1's pattern with the version segment set to the profile MAJOR version,
which for `spatial.owm/0.1` is 0. Flagged because it is invented. §3.3.1 says
the authoritative type is the `type` field in `TopicMeta` rather than the topic
name, so a wrong guess is recoverable.

A wrinkle worth a sentence in the module: §3.3.1's topic-version rule says
names change only on a MAJOR increment, while this module says MINOR revisions
MAY break the wire. So `v0` would stay `v0` across a 0.1 to 0.2 change that
breaks every reader. The topic name cannot be the compatibility signal here;
the pinned content digest has to be.

### 6. `type_uris` asks for a borrowed vocabulary and names none

The field wants "borrowed vocabularies only" with no guidance on which.
SceneScape's class strings are not a vocabulary, and Phase 1 records that as a
census MISMATCH, passing `category` through unchanged. This adapter publishes
COCO URIs, COCO being what SceneScape's own detectors are trained against,
which makes it the least invented option available. A class with no mapping
gets an empty sequence rather than a URI in a namespace nobody owns.

*Flagged for review: the adapter is choosing a vocabulary the producer never
stated.*

### 7. A dangling cross-reference

The module cites "the two-tier tempo pattern of Appendix M". Appendix M
contains M.1 (keyed commands with explicit declines) and M.2 (shared
multi-writer lanes). There is no tempo convention there. The pattern is
legible from the module's own text, so nothing is lost, but the reference
points at nothing.

## Witness notes, identity

Observed, dated, no proposals. The identity design needs to know which
questions are live and unobserved rather than absent.

**2026-10-05, re-identification never completed in the recorded window.**
`reid_state` is `pending_collection` on all 9,583 occurrences across the
corpus. No track id was retired and replaced by a successor, so the stitching
question the module reserves never arose in this data. The question is live:
SceneScape clearly has a re-identification path and a `previous_ids_chain`
field. It simply did not fire here. A negative observation, and worth having
as one.

**2026-10-05, identity is mechanical and unstitched by construction.** Entity
id is the namespaced SceneScape track id. If re-identification ever does
retire one id and introduce a successor, this adapter will publish two entity
lifecycles and stitch nothing. That is a deliberate refusal, not an oversight:
merging them is an identity decision, and 0.1 reserves identity semantics.

**2026-10-05, no track id reuse observed.** 47 distinct track ids across the
window, none reappearing after retirement. If a producer ever did reuse an id
after a retire, this adapter would publish a create for an entity id it had
already disposed, and the lifecycle gate would catch it as an entity created
twice. Untested against real reuse because none occurred.
