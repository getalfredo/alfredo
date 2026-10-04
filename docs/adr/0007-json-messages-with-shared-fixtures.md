# HQ and Porter share JSON messages through fixtures, not a schema language

HQ and Porter exchange JSON text frames. Each side defines the messages by hand: Zod schemas in HQ and Go structs in Porter. A shared `protocol/` directory holds a catalog of message types and operation names, plus fixture messages. Both test suites round-trip every fixture strictly and check their registered types against the catalog.

The alternative was one definition that generates both sides. Generating Go from JSON Schema or TypeSpec doesn't work, because the tools drop or flatten the tagged union that the envelope depends on. Protocol Buffers with buf does work and adds a compatibility check in continuous integration. We rejected Protocol Buffers for v1 because it costs a code generation toolchain and frames that nobody can read without a decoder, and the protocol is small, closed, and released from one repository by one owner.

The cost is two definitions that can drift. The fixtures are the guard. Move to Protocol Buffers when the catalog grows well past v1, when third parties write clients, or when drift gets past the fixtures more than once. The handshake, the envelope shape, and the catalog stay the same in that move.

Agreed in [Build foundations: repository layout, message format, and test levels](https://github.com/getalfredo/alfredo/issues/43); see [the research](../research/hq-porter-message-format.md) and [the build conventions](../agents/build.md#message-format).
