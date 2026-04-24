# Contributing to AI Strategy Hub

First off, thank you for considering contributing to AI Strategy Hub! It's people like you that make this tool a powerful, ever-evolving platform for organizational AI maturity.

## 🧠 Philosophy

The core of this project is the **Meta-Model** — a synthesis of global best practices. Our goal is not to invent a new framework from scratch, but rather to translate established standards (like the EU AI Act, NIST AI RMF, Google, and Microsoft guidelines) into actionable, measurable checkpoints.

## 🚀 How to Contribute

### 1. Expanding the Meta-Model (`dimensions.json`)

The most valuable contribution you can make is expanding the platform's knowledge base. The `dimensions.json` file located in `backend/knowledge_base/` defines the entire assessment logic.

You can add new checkpoints by either:
1. **Using the Framework Builder:** Run the app locally, import a new official guideline via the Research Agent, and use the "Framework Builder" UI to automatically extract and integrate new checkpoints into your local `dimensions.json`. Then, submit a Pull Request with the updated file!
2. **Manual Addition:** Directly edit `dimensions.json`. Please ensure every new checkpoint includes:
   - A descriptive `text`
   - A minimum `min_level` (1-5)
   - An array of `sources` pointing back to the official framework
   - A clear `rationale`

### 2. Code Contributions

If you want to contribute to the codebase (Python/FastAPI backend or Vanilla JS/Vite frontend):

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/jonasarmbrust/AIStrategyHub.git
   ```
3. **Create a new branch** for your feature or bugfix:
   ```bash
   git checkout -b feature/amazing-new-feature
   ```
4. **Make your changes** and test them locally.
   - For frontend changes, run `npm run dev` in the `/frontend` directory.
   - For backend changes, run `python -m uvicorn main:app --reload` in the `/backend` directory.
5. **Commit your changes** with clear, descriptive commit messages.
6. **Push to your fork** and submit a **Pull Request**.

### 3. Bug Reports and Feature Requests

Found a bug? Have a great idea for a new feature? Please use the GitHub Issue Tracker to report it. Provide as much context as possible, including steps to reproduce bugs and expected behavior.

## 🛠️ Development Environment Setup

Please refer to the "Quick Start" section in the `README.md` for detailed instructions on setting up your local development environment using Docker or manually installing Node.js and Python dependencies.

## ⚖️ Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before contributing.

Thank you for helping us make AI Strategy Hub better!
