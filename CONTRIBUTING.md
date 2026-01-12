# Contributing to Shellwright

We welcome any and all contributions to Shellwright, at whatever level you can manage. Here are a few suggestions, but you are welcome to suggest anything else that you think improves the project for us all!

## Ways to Contribute

There are quite a few ways to contribute, such as:

* **Report bugs and security vulnerabilities**: We use [GitHub issues](https://github.com/dwmkerr/shellwright/issues) to keep track of known bugs and security vulnerabilities. We keep a close eye on them and update them when we have an internal fix in progress. Before you report a new issue, do your best to ensure your problem hasn't already been reported. If it has, just leave a comment on the existing issue, rather than create a new one.
* **Propose new features or improvements**: If you have ideas for new features or improvements to existing functionality, please open a [GitHub issue](https://github.com/dwmkerr/shellwright/issues) and describe what you would like to see, why you need it, and how it should work.
* **Review pull requests**: See the [repo](https://github.com/dwmkerr/shellwright) to find open pull requests and contribute a review!
* **Contribute a fix or improvement**: If you're interested in contributing fixes or improvements, first read our guidelines for contributing developers below. Once you are ready to contribute, feel free to pick one of the issues and create a PR.
* **Contribute to the documentation**: You can help us improve the [documentation](https://github.com/dwmkerr/shellwright#readme). Send us feedback as a GitHub issue or start a discussion on GitHub. You are also welcome to raise a PR with a bug fix or addition to the documentation.
* **Add new themes**: Contribute new color themes for terminal recordings. See the [Adding Themes](#adding-themes) section below.
* **Add new examples**: Share interesting use cases or demos that showcase Shellwright's capabilities.

## Code of Conduct

We pledge to foster and maintain a friendly community. We ask all contributors to be respectful, inclusive, and constructive in their interactions.

## Ways of Working

**Principle 1: Discuss Before Implementation**

For non-trivial changes:
- Open an issue to discuss your proposed change before starting work
- Gather feedback from maintainers and community members
- For significant architectural changes, consider creating an RFC (Request for Comments) as a draft PR

**Principle 2: Test and Validate**

Ensure contributions include appropriate tests and validation to demonstrate functionality and prevent regressions:
- Run `npm test` to execute the test suite
- Test your changes manually with the MCP Inspector or demo agent
- Include test cases for new features or bug fixes

**Principle 3: Implementation**

- Keep development focused on the issue requirements. If additional features or ideas arise, create new issues and track as separate work.
- Use PR title prefixes (`feat:`, `fix:`, `docs:`, etc.) to ensure changelog updates and semantic versioning are managed properly.
- All pull requests must use conventional commit format in their titles. This is required for:
  - Automatic version determination
  - Changelog generation
  - Semantic versioning compliance
- Supported commit types:
  - `feat`: New features (triggers minor version bump)
  - `fix`: Bug fixes (triggers patch version bump)
  - `docs`: Documentation changes
  - `chore`: Maintenance tasks
  - `refactor`: Code refactoring
  - `test`: Test additions or changes
  - `ci`: CI/CD changes
  - `build`: Build system changes
  - `perf`: Performance improvements
- Breaking changes can be indicated with `!` after the type (e.g., `feat!:`) or by including `BREAKING CHANGE:` in the commit body.

**Principle 4: Releasing**

Releases are automated using conventional commits and semantic versioning via Release Please. When a PR is merged to main:
- Release Please analyzes commit messages to determine the version bump
- A release PR is automatically created/updated with changelog
- When the release PR is merged, the package is published to npm, Docker, and Helm

## Development Setup

### Prerequisites

- Node.js 20 or higher
- npm (comes with Node.js)
- Git

### Getting Started

1. **Fork and clone the repository**

```bash
git clone https://github.com/YOUR_USERNAME/shellwright.git
cd shellwright
```

2. **Install dependencies**

```bash
npm install
```

3. **Build the project**

```bash
npm run build
```

4. **Run tests**

```bash
npm test
```

### Development Workflow

**Option 1: Local Development with HTTP Mode**

Run the MCP server in HTTP mode with hot-reload:

```bash
npm run dev:http
```

The server runs at `http://localhost:7498/mcp`.

**Option 2: Test with MCP Inspector**

In another terminal, open the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector

# Connect to: http://localhost:7498/mcp
```

**Option 3: Test with Demo Agent**

Run the Python demo agent (requires MCP server running in HTTP mode):

```bash
# Setup virtual environment (optional but recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install requirements and run
pip install -r ./demo/requirements.txt
python ./demo/demo.py
```

**Option 4: Test with Your MCP Client (Cursor, Claude Code, etc.)**

After building, configure your MCP client to use your local build:

```json
{
  "mcpServers": {
    "shellwright-dev": {
      "command": "node",
      "args": ["/absolute/path/to/shellwright/dist/index.js"]
    }
  }
}
```

For Claude Code:

```bash
npm run build
claude mcp add shellwright-dev --scope project -- node "${PWD}/dist/index.js"
```

### Code Style

- Use TypeScript for all source code
- Follow the existing code style (enforced by ESLint)
- Run `npm run lint` to check for linting issues
- Write clear, descriptive variable and function names
- Add comments for complex logic

### Testing

We use Jest for testing. Test files should be placed alongside the code they test with a `.test.ts` extension.

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Adding Themes

Shellwright supports custom color themes for terminal recordings. To add a new theme:

1. **Define the theme** in `src/lib/themes.ts`:

```typescript
export const myTheme: AnsiTheme = {
  name: 'my-theme',
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  cursor: '#aeafad',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
};
```

2. **Add to the themes object**:

```typescript
export const themes: Record<string, AnsiTheme> = {
  // ... existing themes
  'my-theme': myTheme,
};
```

3. **Test your theme**:

```bash
npm run build
npm run dev:http -- --theme my-theme
```

4. **Generate a preview** (optional):

Create a demo script in `scripts/theme-demo.sh` that showcases your theme, then generate a preview GIF.

5. **Update documentation** in `docs/themes.md` with your theme details.

## Project Structure

```
shellwright/
├── src/                      # TypeScript source code
│   ├── index.ts             # MCP server entry point
│   ├── prompts.ts           # MCP prompts
│   ├── lib/                 # Core libraries
│   │   ├── buffer-to-ansi.ts
│   │   ├── buffer-to-svg.ts
│   │   ├── render-gif.ts
│   │   └── themes.ts        # Color themes
│   └── types/               # TypeScript type definitions
├── demo/                     # Demo Python agent
├── evaluations/             # Evaluation framework
├── chart/                   # Helm chart for Kubernetes
├── docs/                    # Documentation and examples
├── scripts/                 # Utility scripts
└── dist/                    # Compiled output (generated)
```

## Pull Request Process

1. **Create a feature branch** from `main`:

```bash
git checkout -b feat/my-new-feature
```

2. **Make your changes** and commit using conventional commit format:

```bash
git commit -m "feat: add support for custom fonts"
```

3. **Push your branch** to your fork:

```bash
git push origin feat/my-new-feature
```

4. **Open a Pull Request** against the `main` branch:
   - Use a clear, descriptive title with conventional commit prefix (e.g., `feat: add custom font support`)
   - Describe what changes you've made and why
   - Reference any related issues (e.g., "Closes #123")
   - Include screenshots or GIFs for UI/visual changes
   - Ensure all tests pass and linting is clean

5. **Address review feedback** if requested by maintainers

6. **Once approved**, a maintainer will merge your PR

## Guidelines for Contributing Developers

- Any contributions you make will be under the [MIT License](./LICENSE)
- Keep PRs focused on a single feature or fix
- Write clear commit messages following conventional commit format
- Update documentation if you're changing functionality
- Add tests for new features or bug fixes
- Be responsive to feedback during code review
- Be patient - maintainers may take time to review

## Common Tasks

### Adding a New MCP Tool

1. Define the tool schema in `src/index.ts`
2. Implement the tool handler
3. Add tests for the new tool
4. Update documentation in README.md
5. Consider adding a prompt in `src/prompts.ts` if it's a common workflow

### Fixing a Bug

1. Create an issue describing the bug (if one doesn't exist)
2. Write a failing test that reproduces the bug
3. Fix the bug
4. Ensure the test now passes
5. Submit a PR with the fix

### Improving Documentation

1. For README changes, edit `README.md`
2. For example GIFs, add them to `docs/examples/`
3. For theme documentation, edit `docs/themes.md`
4. Submit a PR with your improvements

## Getting Help

If you need help or have questions:

- Open a [GitHub issue](https://github.com/dwmkerr/shellwright/issues)
- Check existing issues and discussions
- Review the [README](./README.md) and documentation

## Recognition

We appreciate all contributions! Contributors will be recognized in release notes and the project's history.

Thank you for contributing to Shellwright! 🎉
