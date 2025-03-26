<div align="center">
  <h1 align="center">Theseus</h1>
</div>

<div align="center">
  <h1 align="center">A Solana DeFi AI Agent Builder that revolutionizes decentralized finance</h1>
</div>

[Video](https://github.com/user-attachments/assets/e9b10ccd-68da-4e69-a978-8ebd314213fd)

### How do you ship so quickly?
We have a __**community-driven Dev Team**__ for this repo.
  
# Installation

## Prerequisites

1. `node.js` and `npm`
2. `pipx`, if you don't have this go [here](https://pipx.pypa.io/stable/installation/)
3. API Key <samp>(just one is required)</samp>
   - [**Anthropic**](https://console.anthropic.com/settings/keys)
    - [**OpenAI**](https://platform.openai.com/api-keys)

> We're currently working on supporting Windows! (Let us know if you can help)

## Installation commands

To install using `pipx` + `npm`:

```bash
# Step 1: Ensure directory where pipx stores apps is in your PATH environment variable
pipx ensurepath

# Step 2: For the backend
pipx install theseus_agent

# Step 3: For the main UI (install and run)
npx theseus-ui
```


> If you already have theseus_agent installed, update it by running:
> ```pipx install --force theseus_agent```

### Thats it! Happy building :)


# Running the agent

Then to *run* the main ui, the command is:
```bash
npx theseus-ui
```

It's that simple.

# Terminal UI
> If you'd like to use the terminal interface, follow these steps:
### Install
1. Make sure you have the backend installed
```bash
# For the backend
pipx install theseus_agent
```
2. Install the tui
```bash
# For the tui
npm install -g theseus-tui
```
> [!NOTE]
> If you already have theseus-tui installed, update it by running:
```bash
npm uninstall -g theseus-tui
npm install -g theseus-tui
```

### Run

1. Navigate to your project folder and open the terminal.
2. Set your Anthropic API or OpenAI API key as an environment variable:

```bash
export ANTHROPIC_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

#OR

export OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

#OR

export GROQ_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

3. Then to *run* the terminal-ui, the command is:
```bash
theseus-tui
```

It's as easy as that.

> [!NOTE]
> Don't worry, the agent will be able to only access files and folders in the directory you started it from. You can also correct it while it's performing actions.

---

To run in *debug* mode, the command is:
```bash
theseus-tui --debug
```

---

To run in *local* mode:
> [!WARNING]
> The current version of local model support is not mature, proceed with caution, and expect the performance to degrade significantly compared to the other options.

1. Get deepseek running with [ollama](https://ollama.com/library/deepseek-coder:6.7b)

2. Start the local ollama server by running
```
ollama run deepseek-coder:6.7b
```

4. Then configure theseus to use the model
```bash
theseus-tui configure

Configuring theseus CLI...
? Select the model name: 
  claude-opus 
  gpt4-o 
  llama-3-70b 
❯ ollama/deepseek-coder:6.7b
```

4. And finally, run it with:
```
theseus-tui --api_key=FOSS
```

---

For a list of all commands available:
```bash
theseus-tui --help
```

# Features
- Smart Contract Generation
- Codebase exploration
- Config writing
- Test writing
- Bug fixing
- Protocol Integration
- Local model support

### Limitations
- Minimal functionality for non-Python languages
- Sometimes have to specify the file where you want the change to happen
- Local mode is not good right now. Please try to avoid using it.

# Progress

### This project is still super early and <ins>we would love your help</ins> to make it great!

### Current goals
- Multi-model support
  - [x] Claude 3.5 Sonnet
  - [x] GPT4-o
  - [x] Groq llama3-70b
  - [x] Ollama deepseek-6.7b
  - [x] Google Gemini 1.5 Pro
  - [ ] Deepseek r1
- Launch plugin system for tool and agent builders
- Improve our self-hostable Electron app
- Set SOTA on [SWE-bench Lite](https://www.swebench.com/lite.html)

### Past milestones

- [x] **June 28, 2024** - File and code referencing, improve steerability, Claude Sonnet support v0.0.16
- [x] **June 14, 2024** - Launch Electron UI v0.0.13
- [x] **June 1, 2024** - theseus V2 Beta Electron UI
- [x] **May 19, 2024** - GPT4o support + better interface support v0.1.7
- [x] **May 12, 2024** - Complete interactive agent v0.1.0
- [x] **May 10, 2024** - Add steerability features
- [x] **May 8, 2024** - Beat AutoCodeRover on SWE-Bench Lite
- [x] **Mid April, 2024** - Add repo level code search tooling
- [x] **April 2, 2024** - Begin development of v0.1.0 interactive agent
- [x] **March 17, 2024** - Launch non-interactive agent v0.0.1

> [!NOTE]
> If you already have the tui installed, run a clean reinstall:
```bash
npm uninstall -g theseus-tui
npm install -g theseus-tui
```

## Current development priorities

1. Improve context gathering and code indexing abilities ex:
    - Adding memory modules
    - Improved code indexing
2. Add alternative models and agents to:
    - a) Reduce end user cost and
    - b) Reduce end user latency
3. Electron app
    - Save and load in project overviews for agent context
    - Revert & "step back" timeline interface
    - Better code diff view
    - Send user file events/changes to theseus



# How can I contribute?

theseus is community-driven, and we welcome contributions from everyone!
From tackling issues to building features to creating datasets, there are many ways to get involved:

- **Core functionality:** Help us develop the core agents, user experience, tool integrations, plugins, etc.
- **Research:** Help us research agent performance (including benchmarks!), build data pipelines, and finetune models.
- **Feedback and Testing:** Use theseus, report bugs, suggest features, or provide feedback on usability.

For details, please check [CONTRIBUTING.md](./CONTRIBUTING.md).

# Feedback

We would love feedback! Tweet at us! [X](xxx)
We collect basic event type (i.e. "tool call") and failure telemetry to solve bugs and improve the user experience, but if you want to reach out, we would love to hear from you!

To disable telemetry, set the environment variable `theseus_TELEMETRY_DISABLED` to `true` 
```bash
export theseus_TELEMETRY_DISABLED=true
```

# Community

Tweet at us! [X](xxx)
