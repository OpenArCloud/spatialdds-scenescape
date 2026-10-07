# Corpora

Six of the fifteen gates compare translated output against the recording it
came from, so they need the recording and not just the shipped MCAP.

The recordings are too large for the repository and live outside it. This file
says where, and pins the bytes, so anyone restoring them can prove they have
the same input the gates were run against.

## Where the gates look

    ../spatialdds-scenescape-corpora/20261003T050916Z

A sibling of this checkout, not a path inside it. `gates/run_all.py` uses that
directory when it exists and reports the six as SKIPPED when it does not.
`--corpus <dir>` overrides it, and `--no-corpus` ignores it.

## What to restore

Two objects in the OARC sidecar evidence bucket, under `scenescape-corpus/`.
The bucket is private and not named here; ask if you need it.

| object | sha256 |
|---|---|
| `corpora-20261003.tgz` | `5af06f7a963cd4f3b46e8da2e9c9aae714437c214056e100841401117f6a6bd8` |
| `corpora-20261003.manifest.txt` | `c4dcb245f4e1354e534e1c7938aae78bb460caf57408c205094c6ff3d2a0038c` |

The tarball is 5,070,181 bytes and unpacks to three dated directories. Restore
it into the sibling path and check the digest before trusting a gate result:

```sh
mkdir -p ../spatialdds-scenescape-corpora
cd ../spatialdds-scenescape-corpora
# fetch both objects here, then
shasum -a 256 -c <<< "5af06f7a963cd4f3b46e8da2e9c9aae714437c214056e100841401117f6a6bd8  corpora-20261003.tgz"
tar xzf corpora-20261003.tgz
```

`corpora-20261003.manifest.txt` carries a sha256, a byte count and a path for
each of the 33 files, which is the check that matters: the tarball digest tells
you the archive is intact, the manifest tells you every file inside it is the
one the gates read. `tools/verify_corpora.py` checks a restored copy against
it.

You do not have to remember to run that. `gates/run_all.py` verifies the
corpus it is about to use against this manifest and refuses to run if the
bytes differ, because six gates comparing output against a corpus nobody
checked would produce results that mean nothing. Its header says how many
files it verified. A corpus you recorded yourself has no published digest, so
the header says the results are not traceable and the gates run anyway.

## What the three directories are

| directory | lines | topics with data | what it is |
|---|---|---|---|
| `20261003T042853Z` | 0 | 0 of 11 | a capture that recorded nothing, kept because it is part of the record |
| `20261003T043354Z` | 22,160 | 4 of 11 | the first real capture |
| `20261003T050916Z` | 30,701 | 6 of 11 | the reference corpus, and the source of the shipped sample |

The two real captures total 52,861 messages, which is the number the README's
Status section quotes. `20261003T050916Z` is the one the gates default to and
the one every corpus-dependent number in `README.md` and `FINDINGS.md` was
measured on.

Twenty three of the 33 files are empty. Those are MQTT topics the recorder
subscribed to that this deployment never published on, and the gates count
them as deliberately absent rather than missing. An empty file has the sha256
`e3b0c442...`, which is why that digest repeats in the manifest.
