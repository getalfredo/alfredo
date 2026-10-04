# One message format for HQ and Porter

How do HQ (TypeScript on Bun) and Porter (Go) share one definition of the messages they exchange over the WebSocket? This document compares four options and recommends one. It answers [#41](https://github.com/getalfredo/alfredo/issues/41) and feeds [#43](https://github.com/getalfredo/alfredo/issues/43). It doesn't repeat [worker-agent-patterns.md](./worker-agent-patterns.md), which covers how comparable tools enroll, authenticate, and transport.

The contract comes from the [Porter spec](../spec/porter.md), the [compose spec](../spec/compose.md), [ADR 0001](../adr/0001-porter-outbound-api-token.md), and [ADR 0005](../adr/0005-closed-operation-catalog.md). The Porter spec leaves "wire schemas" and "the compatibility mechanism" to implementation.

Citation convention: every claim links to the doc or repository that owns it. Claims that follow from the sources without being stated in them are marked *(inferred)*. Claims that no primary source confirmed are marked **unverified**. Results marked *(tested)* come from a throwaway experiment that is described in [What was tested](#what-was-tested). Sources fetched 2026-10-04.

## Summary

- The message surface is small: about five envelope types and roughly a dozen operations, each with arguments and a result.
- The core shape is a tagged union: one envelope with a `type` field that selects the body. Every option stands or falls on how well it handles that union in Go.
- JSON Schema code generation fails that test for Go. go-jsonschema doesn't implement `oneOf`, and quicktype flattens the union into one struct of optional fields. TypeSpec has no Go emitter.
- Protocol Buffers pass every technical test. Tooling is mature on Bun and Go, the union is a real `oneof`, and `buf breaking` checks compatibility in CI. The cost is a code generation toolchain and binary frames that you can't read without a decoder.
- Hand-written types with shared fixtures need no tooling. Strict round-trip tests on both sides caught every drift that was tried.
- The version compatibility mechanism is the same for every option: a handshake in which Porter states its version, a protocol number, and the operations it supports. The format choice doesn't decide it.

**Recommendation:** JSON text frames, hand-written types on both sides, and one shared directory of fixture messages that both test suites check. Move to Protocol Buffers with buf if drift becomes a real problem. Don't generate Go from JSON Schema.

## What the format has to carry

| Message | Direction | Notes |
| --- | --- | --- |
| Hello | Both | Porter ID, versions, `ws://` or `wss://`, Docker mode, supported operations |
| Heartbeat | Porter to HQ | Every 10 seconds. Host CPU, memory, and disk, plus CPU and memory per service |
| Operation request | HQ to Porter | Operation ID, name from the closed catalog, typed arguments |
| Operation result and status | Porter to HQ | By operation ID, also after reconnection |
| Log and progress chunks | Porter to HQ | By operation ID, ordered, buffered during disconnection |

The catalog in v1 is the nine compose operations, the Machine checks, and applying the Proxy configuration. That's a small, closed set that changes only with a Porter release.

Three properties follow from the spec:

- **The union is the hard part.** Each side receives one stream of mixed messages and dispatches on a tag. Operations add a second union: the name selects the argument type.
- **Volume is low.** One heartbeat per Porter every 10 seconds, and log lines. Encoding speed and size don't matter at this scale *(inferred)*.
- **Operators debug this.** V1 allows plain `ws://`, and a single operator runs both programs. Being able to read a frame in a log or a network capture has real value.

## Option A: JSON with a schema source that generates both sides

The idea: write the messages once in a schema language, then generate TypeScript types and Go structs from it.

### The TypeScript side works

- Zod 4 converts schemas to JSON Schema with `z.toJSONSchema()`. It targets draft 2020-12 by default and also draft 7, draft 4, and OpenAPI 3.0 ([Zod JSON Schema docs](https://zod.dev/json-schema)).
- Zod has `z.discriminatedUnion` and gives static types with `z.infer` ([Zod API docs](https://zod.dev/api)). A Zod discriminated union comes out as a JSON Schema `oneOf` whose branches each have a `const` tag *(tested)*.
- TypeSpec's JSON Schema emitter is one of the stable emitters in TypeSpec 1.0 ([TypeSpec 1.0 GA announcement](https://typespec.io/blog/typespec-1-0-GA-release/)). It can bundle all schemas into one document under `$defs` ([emitter README](https://github.com/microsoft/typespec/tree/main/packages/json-schema)). The latest stable release is 1.16.0, from 2026-09-09 ([releases](https://github.com/microsoft/typespec/releases)).

### The Go side doesn't

- **TypeSpec has no Go emitter.** The repository's packages cover C#, Java, JavaScript, and Python clients, and C# and JavaScript servers. There is no Go package ([packages directory](https://github.com/microsoft/typespec/tree/main/packages)). A community project exists with 4 stars ([typespec-community/typespec-go](https://github.com/typespec-community/typespec-go)). So TypeSpec to Go means TypeSpec to JSON Schema to a Go generator, which is two tools in a row.
- **go-jsonschema doesn't implement unions.** Its README status list leaves `allOf`, `anyOf`, `oneOf`, and `const` unchecked ([status section](https://github.com/omissis/go-jsonschema#status)). Given a schema whose root is a `oneOf`, version 0.24.1 emitted an empty package. Given the union as a property, it emitted `interface{}` *(tested)*. Plain object schemas generate well, with required-field checks in `UnmarshalJSON` *(tested)*.
- **quicktype flattens unions.** It accepts JSON Schema and emits both Go and TypeScript ([README](https://github.com/glideapps/quicktype)). For the envelope union, version 26.0.0 produced a single `Message` struct with every field of every message as an optional pointer, in Go and in TypeScript *(tested)*. That type checks nothing about which fields belong to which message.
- **No tool checks JSON Schema changes for compatibility.** No first-party equivalent of `buf breaking` was found for JSON Schema (**unverified**: absence is hard to prove, and third-party diff tools weren't evaluated).

### A variant: Go as the source

tygo generates TypeScript from Go source files ([README](https://github.com/gzuidhof/tygo)). Version 0.2.21 turned Go structs into clean TypeScript interfaces *(tested)*. Go has no union type, so the envelope union would still be hand-written in TypeScript, and HQ would get types without runtime validation *(inferred)*. Komodo does the same thing from Rust: it runs `typeshare` and then patches the output with a list of string replacements ([generate_types.mjs](https://github.com/moghtech/komodo/blob/main/client/core/ts/generate_types.mjs)). That patch list shows what one-way generation costs when the two type systems differ.

### Verdict

The promise of this option is "one definition, both sides generated". For this protocol it isn't kept. The generators handle the easy part, the flat structs, and fail on the envelope, which is the part where drift does damage. You'd maintain a schema, a generation step, and hand-written union code in Go. That's more moving parts than Option C for less safety than Option B.

## Option B: Protocol Buffers with buf

The idea: write `.proto` files, generate both sides with buf, and send binary frames over the WebSocket.

### Tooling is mature on both sides

- protobuf-es supports "Bun: Latest v1 release" and passes the Protobuf conformance suite ([README](https://github.com/bufbuild/protobuf-es)). Version 2.0 shipped in August 2024 ([announcement](https://buf.build/blog/protobuf-es-v2)). The latest release is 2.16.0, from 2026-09-29 ([releases](https://github.com/bufbuild/protobuf-es/releases)).
- Go uses `google.golang.org/protobuf`, the module that the Go team recommends for new code ([Go protobuf FAQ](https://protobuf.dev/reference/go/faq/)). The latest release is 1.36.12, from 2026-08-10 ([releases](https://github.com/protocolbuffers/protobuf-go/releases)).
- The buf CLI is one binary. It installs from npm as `@bufbuild/buf`, and it doesn't need `protoc` ([installation docs](https://buf.build/docs/cli/installation/)). The latest release is 1.73.0, from 2026-09-11 ([releases](https://github.com/bufbuild/buf/releases)).
- One `buf generate` run produced both sides from a 70-line `.proto` file: 294 lines of TypeScript and 813 lines of Go. The envelope `oneof` became a real discriminated union in TypeScript, with a `case` tag, and typed wrapper structs in Go *(tested)*.

### It fits single-binary builds

`bun build --compile` bundles all imported packages into the executable ([Bun docs](https://bun.com/docs/bundler/executables)). The protobuf-es runtime is plain JavaScript with no native addon. A compiled binary that uses it ran correctly and was 0.17 MB larger than an empty one, on a base of 63 MB *(tested)*. On the Go side a static build with `CGO_ENABLED=0` worked, and the binary grew from 2.6 MB to 3.9 MB *(tested)*.

### Compatibility checking is the best of any option

- Old code ignores new fields and keeps them: "Proto3 messages preserve unknown fields and include them during parsing and in the serialized output" ([proto3 guide](https://protobuf.dev/programming-guides/proto3/)).
- The rules for changing a schema are written down. Field numbers "should never be reused", and deleted numbers must be reserved ([proto3 guide](https://protobuf.dev/programming-guides/proto3/)).
- `buf breaking` "compares the current version of your Protobuf schema against a past version and reports any changes that would break clients, servers, or the code generated from those schemas". It has four rule sets, from `FILE` to `WIRE`, and compares against a Git branch or a saved image ([buf breaking docs](https://buf.build/docs/breaking/)). Changing one field from `int64` to `string` failed the check with exit code 100 and a message that named the field *(tested)*.

This is real, but it guards something that the handshake below already handles for a two-program system that one owner releases together.

### The costs

- **Binary frames aren't readable.** A captured frame or a logged message needs the schema and a decoder. The 40-byte heartbeat in the test is opaque without one *(tested)*.
- **ProtoJSON isn't a way out.** Protobuf has a JSON mapping, and it gives up the main advantages. "The protobuf JSON parser should reject unknown fields by default", and "ProtoJSON implementations generally do not propagate unknown fields" ([ProtoJSON guide](https://protobuf.dev/programming-guides/json/)). 64-bit integers become strings ([ProtoJSON guide](https://protobuf.dev/programming-guides/json/)). In the test, `memoryBytes: 1024` came out as `"1024"` *(tested)*. The Go team also declines to keep its JSON output stable: "Do not depend on the output being stable" ([protojson docs](https://pkg.go.dev/google.golang.org/protobuf/encoding/protojson)).
- **64-bit integers are `bigint` in TypeScript.** Memory and disk byte counts need `1024n` literals and conversion before they reach JSON or the UI *(tested)*.
- **A toolchain to own.** That's buf, two plugins, two config files, generated code in the repository or a generate step before every build, and a CI check that generated code is current *(inferred)*.
- **Connect doesn't apply.** The Connect protocol is defined over HTTP. Its specification doesn't mention WebSocket, and "Bidirectional streaming requires HTTP/2" ([Connect protocol](https://connectrpc.com/docs/protocol/)). [ADR 0001](../adr/0001-porter-outbound-api-token.md) fixes one outbound WebSocket, and HQ sends operations to the side that dialed. So this option means protobuf-es messages over WebSocket frames with a hand-written dispatch loop, without an RPC framework *(inferred)*.

### Verdict

This is the only option where one definition really generates both sides, union included. It's the right answer when several teams or several released versions must interoperate for years. For v1 it buys safety that Alfredo doesn't yet need, and it costs readability that the operator would use.

## Option C: hand-written types with shared fixtures

The idea: JSON text frames. HQ defines the messages as Zod schemas. Porter defines them as Go structs. A directory of fixture files, one or more real message per type, sits between them. Both test suites load every fixture.

### What each side already gives

- Go's `encoding/json` ignores unknown keys by default: "object keys which don't have a corresponding struct field are ignored". `Decoder.DisallowUnknownFields` turns that into an error. `RawMessage` "can be used to delay JSON decoding", which is the standard way to read a tag first and the body second ([encoding/json docs](https://pkg.go.dev/encoding/json)).
- Zod's default objects strip unknown keys, and `z.strictObject` rejects them ([Zod API docs](https://zod.dev/api)). So both sides can be lenient in production and strict in tests *(inferred)*.
- Bun's WebSocket server delivers text frames as strings and has a 16 MB default payload limit ([Bun WebSocket docs](https://bun.com/docs/runtime/http/websockets)).
- Go has no WebSocket in the standard library. `github.com/coder/websocket` has zero dependencies, takes a `context.Context`, and ships a `wsjson` helper. Its latest release is 1.8.15, from 2026-06-15 ([package docs](https://pkg.go.dev/github.com/coder/websocket)). `gorilla/websocket` last released in June 2024 ([releases](https://github.com/gorilla/websocket/releases)). This choice is the same for every option.

### How drift gets caught

The fixture test on each side does three things: decode the fixture strictly, encode it again, and compare the result to the fixture as JSON values. A 20-line Go helper did this in the test *(tested)*:

| Drift | What happened |
| --- | --- |
| Fixture matches the struct | Pass |
| Fixture has a field that the struct lacks | Fail: `json: unknown field "swapBytes"` |
| Struct has a field that the fixture lacks | Fail: round trip differs, with both documents printed |

The same three steps work in TypeScript with a strict Zod schema *(inferred, not run)*.

One more shared file closes the remaining gap, which is a message with no fixture at all. A small `catalog.json` lists every message type and operation name. Each side tests that its registered set equals the list and that every entry has a fixture. That file is the one shared definition of names, and it needs no generator *(inferred)*.

### The costs

- **Two definitions, not one.** The fixtures are the contract. Each new field is typed twice. At this size that's minutes per change.
- **Fixtures only cover what they contain.** An optional field that no fixture sets isn't checked. The rule has to be that fixtures set every field.
- **No automatic breaking-change check.** A reviewer has to notice that a field was renamed. Changed fixture files in a pull request make that visible, but nothing enforces it.
- **JSON limits.** Numbers above 2^53 lose precision in JavaScript, which doesn't matter for byte counts on real machines *(inferred)*. Go replaces invalid UTF-8 in strings with the replacement character when encoding ([encoding/json docs](https://pkg.go.dev/encoding/json)), so raw container output that isn't UTF-8 gets altered. If that matters, log chunks can carry base64 or travel as binary frames next to the JSON ones.

### Verdict

This is the simplest option, and it's good enough. It has no generator, no extra build step, and nothing new in either binary. Frames are readable in any log. The safety comes from tests that are cheap to write and that failed correctly on each drift tried.

## Version compatibility is separate from the format

The Porter spec asks for three things: HQ shows Porter versions, flags incompatibility, and blocks only the commands it can't safely exchange. A version difference alone must not block operations. No serialization format provides that by itself. It needs a handshake, and the same handshake works for every option above.

A sketch that satisfies the spec, for the implementation ticket to refine:

1. **Hello.** Porter's first message carries its version, a protocol number, and the list of operation names it supports. HQ replies with its version and the range of protocol numbers it accepts. Porter already reports its Docker mode and connection scheme at this point.
2. **Additive changes don't bump the protocol number.** Receivers ignore unknown fields and unknown message types. New fields are optional. Both JSON libraries do this by default, as cited above.
3. **Inside the range, HQ gates each operation.** HQ sends an operation only if Porter listed it. An older Porter keeps working with a newer HQ, minus the new operations. HQ shows those as unavailable on that Porter. An operation whose arguments change incompatibly gets a new name.
4. **Outside the range, HQ blocks all operations.** It still shows the Porter, its version, and its heartbeats. That requires the hello and heartbeat shapes to stay stable across protocol numbers.

Docker uses the same pattern. Client and daemon negotiate "the highest version of the API supported by both the client and daemon" ([Docker Engine API docs](https://docs.docker.com/reference/api/engine/)). The closed catalog of [ADR 0005](../adr/0005-closed-operation-catalog.md) makes step 3 cheap, because the list of operations is already compiled into Porter.

Protocol Buffers would improve step 2 with field numbers and `buf breaking`. They wouldn't replace steps 1, 3, and 4.

## Comparison

| Criterion | A: JSON Schema codegen | B: Protocol Buffers and buf | C: hand-written and fixtures |
| --- | --- | --- | --- |
| Bun tooling | Good (Zod, TypeSpec) | Good (protobuf-es 2.16) | Nothing needed beyond Zod |
| Go tooling | Weak: no union support | Good (protobuf-go 1.36) | Standard library |
| Single-binary builds | Fine | Fine: +0.17 MB in Bun, +1.3 MB in Go | Fine: nothing added |
| One definition | Partly: the union is hand-written in Go | Yes | No: two definitions and one fixture set |
| Compatibility check | Handshake, no schema diff tool found | Handshake plus `buf breaking` | Handshake plus fixture review |
| Debuggability | Readable frames | Binary frames need a decoder | Readable frames |
| Build steps added | Generator on one or both sides | buf, two plugins, generated code | None |
| Simplicity | Low | Medium | High |

## What was tested

A throwaway project outside the repository, with Bun 1.4.2 and Go 1.27.1 on Linux x64. Tool versions: zod 4.6.5, quicktype 26.0.0, go-jsonschema 0.24.1, tygo 0.2.21, @bufbuild/buf 1.73.0, @bufbuild/protobuf and protoc-gen-es 2.16.0, protoc-gen-go 1.36.12.

- **Schema.** One envelope with five message types as a Zod discriminated union, exported with `z.toJSONSchema`. The same messages as a `.proto` file with a `oneof`.
- **JSON Schema to Go.** go-jsonschema emitted nothing for the root union and `interface{}` for the union as a property. quicktype emitted one flat struct with optional pointer fields.
- **Protocol Buffers.** `buf generate` produced both sides. A Bun script encoded and decoded a heartbeat, also from a `bun build --compile` binary. A Go program did the same from a static build. `buf breaking` with the `WIRE_JSON` rules caught a field type change.
- **Fixtures.** A Go round-trip helper passed a matching fixture and failed on an extra field and on a missing field.

Nothing was tested over a real WebSocket, and nothing was tested on arm64.

## Shortlist

1. **Option C: JSON text frames, hand-written Zod schemas and Go structs, shared fixtures and a shared catalog list.** Recommended.
2. **Option B: Protocol Buffers with buf and protobuf-es, binary frames.** The upgrade path. Take it when the catalog grows well past v1, when third parties write clients, or when drift gets past the fixtures more than once.
3. **Option C plus schema validation in Go tests.** Export JSON Schema from the Zod schemas and have Porter's tests validate its own output against it. This makes Zod the single definition without generating Go code. It needs a Go validator such as [google/jsonschema-go](https://github.com/google/jsonschema-go), which has no dependencies outside the standard library. Its draft 2020-12 coverage is **unverified**. Worth a look only if fixtures prove too coarse.

Not on the shortlist: generating Go from JSON Schema or TypeSpec (Option A), and generating TypeScript from Go with tygo. Both leave the union hand-written and add a build step.

## Recommendation

Use Option C.

- **Wire format:** JSON text frames over the one WebSocket. Every message is an object with a `type` field. Operation requests add an `id`, a `name`, and an `args` object.
- **HQ:** Zod schemas, one per message, joined with `z.discriminatedUnion`. Types come from `z.infer`. HQ validates every incoming frame, because Porter is a separate program and its input shouldn't be trusted to be well formed.
- **Porter:** Go structs with `json` tags. Decode the envelope into a struct with `type` and a `json.RawMessage` body, then decode the body by type. Porter validates operation arguments itself, as the closed catalog requires.
- **Shared contract:** a top-level directory with `catalog.json` and one fixture file or more per message type. Both test suites round-trip every fixture strictly. Both check their registered types against the catalog.
- **Compatibility:** the handshake in [Version compatibility is separate from the format](#version-compatibility-is-separate-from-the-format).

The simplest option is good enough here, and the reasons are specific. The protocol is small and closed. One owner releases both programs from one repository. The strongest argument for a schema language is generating the union on both sides, and the only tool that does that well is Protocol Buffers, which costs readable frames and a build toolchain. The fixture tests caught the drift cases that matter.

Moving to Option B later is contained. The handshake, the envelope shape, and the catalog stay the same. The fixtures become the test data for the migration. Only the encoding and the type definitions change.

## Open questions for #43

- Where the shared directory lives, and how the Go module and the Bun project both reach it.
- Whether log chunks must preserve bytes that aren't valid UTF-8. If so, pick base64 fields or binary frames for log data.
- The read limit on Porter's side. `coder/websocket` defaults to 32,768 bytes per message ([package docs](https://pkg.go.dev/github.com/coder/websocket)), and a deploy operation carries compose files and a `.env` file, so the limit has to be raised deliberately.
