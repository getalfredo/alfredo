# bun-react-tailwind-shadcn-template

Install the published Linux binary:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/getalfredo/bunalfredo/main/scripts/install.sh)
```

To install dependencies:

```bash
bun install
```

To start a development server:

```bash
bun dev
```

To run for production:

```bash
bun start
```

To trigger a release workflow that creates the next tag and GitHub release:

```bash
bin/release patch
bin/release minor
bin/release major
```

This requires the GitHub CLI (`gh`) to be installed and authenticated.

This project was created using `bun init` in bun v1.3.0. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
