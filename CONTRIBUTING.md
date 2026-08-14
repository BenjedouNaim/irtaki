# Contributing to Irtaki

## Source of Truth
The roadmap and build order are defined in the [docs/Irtaki-Development-Plan.md](docs/Irtaki-Development-Plan.md). Follow the epics and vertical slices sequentially.

## Git Workflow
We use a Trunk-Based Development model. All development is done on short-lived branches off `main` and merged via Pull Requests.

### Branch Naming Conventions
Create branches off `main` using the following prefixes:
* `feat/...` for new features
* `fix/...` for bug fixes
* `refactor/...` for code refactoring
* `test/...` for writing tests
* `docs/...` for documentation updates
* `chore/...` for build/CI/dependency updates

### Commit Messages
We follow the **Conventional Commits** specification:
* `feat: [description]` for new features
* `fix: [description]` for bug fixes
* `refactor: [description]` for refactoring
* `test: [description]` for tests
* `docs: [description]` for documentation
* `chore: [description]` for general chores

### Merging Policy
* **No Direct Commits:** All changes must go through a Pull Request.
* **Squash and Merge:** Pull requests must be squash-merged into `main`.
* **CI Validation:** The CI check pipeline (linting, type-checking, unit/integration testing) must be green before merging.
* **Releases:** Creating a tag matching `mobile-v*` will trigger the mobile deployment pipeline. Backend code deploys continuously upon merging to `main`.
