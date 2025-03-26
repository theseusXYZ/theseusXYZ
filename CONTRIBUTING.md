# Contributing to theseus

Thank you for your interest in contributing to theseus! We welcome contributions from the community to help make theseus a powerful and widely-accessible AI assistant for software developers.

## Contribution Interests

If you would like to contribute to the project, please tweet us at [@Theseus_XYZ](https://x.com/Theseus_XYZ).

## Contribution Workflow

Here's an overview of the contribution workflow:

1. Fork the theseus repository to your own GitHub account
2. Clone your fork locally
3. Create a new branch for your changes (e.g. `git checkout -b my-feature-branch`)
4. Make your changes and commit them with descriptive messages
5. Push your changes to your fork on GitHub
6. Open a pull request from your fork to the main theseus repository

## Testing Locally

### Setup

Run the following commands in your terminal:

```bash
chmod u+x build.sh
./build.sh

export theseus_TELEMETRY_DISABLED=true
```

### Running the terminal UI

Either run:

```bash
theseus
```

Or

```bash
cd theseus-tui
npm run build && node dist/cli.js
```

## Coding Conventions

Please follow these coding conventions when contributing to theseus:

- Use 4 spaces for indentation (no tabs)
- Follow PEP 8 style guidelines 
- Include docstrings for all public modules, functions, classes, and methods
- Use descriptive variable and function names

## Pull Requests

When you open a pull request, please include:

- A clear and descriptive title
- A description of your changes and why they're needed
- Steps to test your changes
- Screenshots or animated GIFs if applicable

A maintainer will review your pull request and may request changes before merging it. 

Thank you again for contributing to theseus! We appreciate your help in making this project as useful and robust as possible.
