# Documentation Guide

Welcome to the Grist MCP Server documentation!

---

## Quick Start by Role

### 🆕 New Users

1. **[../README.md](../README.md)** - Start here! Project overview, features, and installation
2. **[DOCKER_SETUP.md](DOCKER_SETUP.md)** - Set up local Docker Grist instance
3. **[STATUS.md](STATUS.md)** - Current project status and quality metrics

### 👨‍💻 Contributors & Developers

1. **[../CLAUDE.md](../CLAUDE.md)** - **For AI assistants** - Development requirements and workflows
2. **[DEVELOPMENT.md](DEVELOPMENT.md)** - Development guide, patterns, and workflows
3. **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture and design patterns
4. **[TESTING.md](TESTING.md)** - Testing strategy and procedures
5. **[VALIDATION_RULES.md](VALIDATION_RULES.md)** - Complete validation constraints reference

### 🤖 LLM/AI Assistants

**Start with [../CLAUDE.md](../CLAUDE.md)** - Comprehensive guide for AI development including:
- Required agents and skills to invoke
- Context7 MCP tool usage (documentation fetching)
- Grist API specifications and patterns
- Common pitfalls and solutions

---

## Documentation by Topic

### Project Status & History
- **[STATUS.md](STATUS.md)** - Current version, test status, quality metrics, roadmap
- **[CHANGELOG.md](CHANGELOG.md)** - Complete version history with detailed changes

### Architecture & Design
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - Registry-based tool system, type flow diagrams, multi-file patterns
- **[decisions/001-branded-types-at-api-boundaries.md](decisions/001-branded-types-at-api-boundaries.md)** - ADR for type assertions

### Development Workflow
- **[DEVELOPMENT.md](DEVELOPMENT.md)** - Project structure, TypeScript patterns, Grist formulas, coding standards
- **[DOCKER_SETUP.md](DOCKER_SETUP.md)** - Docker configuration, environment variables, troubleshooting
- **[TESTING.md](TESTING.md)** - Test suite overview, coverage, patterns, maintenance

### API & Validation
- **[VALIDATION_RULES.md](VALIDATION_RULES.md)** - Identifiers, widget options constraints, cross-field dependencies, Python keywords
- **[reference/](reference/)** - Grist API specifications (OpenAPI, TypeScript types, UserAction tuples, database schema)

---

## Documentation Structure

```
docs/
├── README.md                          # This file - navigation guide
├── STATUS.md                          # Current project status
├── CHANGELOG.md                       # Version history
├── ARCHITECTURE.md                    # System architecture
├── DEVELOPMENT.md                     # Development guide
├── TESTING.md                         # Testing guide
├── DOCKER_SETUP.md                    # Docker configuration
├── VALIDATION_RULES.md                # Validation reference
│
├── decisions/                         # Architectural Decision Records
│   └── 001-branded-types-at-api-boundaries.md
│
└── reference/                         # Grist API specifications (READ-ONLY)
    ├── grist-api-spec.yml             # OpenAPI spec
    ├── grist-types.d.ts               # TypeScript types
    ├── grist-apply-actions.d.ts       # UserAction tuples
    └── grist-database-schema.md       # Metadata schema v44
```

---

## Common Tasks

### Running Tests
```bash
# See DOCKER_SETUP.md and TESTING.md
docker compose up -d && sleep 12
export GRIST_API_KEY=test_api_key
export GRIST_BASE_URL=http://localhost:8989
npm test
```

### Adding a New Tool
See [DEVELOPMENT.md - Adding New Features](DEVELOPMENT.md#adding-new-features)

### Understanding Validation Rules
See [VALIDATION_RULES.md](VALIDATION_RULES.md) for:
- DocId format (Base58, 22 characters)
- TableId/ColId constraints (Python keywords forbidden)
- Widget options by column type
- CellValue encoding formats

### Checking Current Status
See [STATUS.md](STATUS.md) for:
- Build and test status
- Available tools (15 MCP tools)
- Quality metrics (9.8/10, A+)
- Recent changes and roadmap

---

## Key Concepts

### Registry-Based Tool System
See [ARCHITECTURE.md](ARCHITECTURE.md) - Modular architecture that reduced codebase by 80%

### Branded Types
See [decisions/001-branded-types-at-api-boundaries.md](decisions/001-branded-types-at-api-boundaries.md) - Type-safe IDs (DocId, TableId, RowId)

### CellValue Encoding
See [CLAUDE.md](../CLAUDE.md#cellvalue-encoding-critical-for-correctness) - Grist's special encoding for complex types:
- `["L", "item1", "item2"]` for ChoiceList
- `["d", timestamp]` for Date
- `["D", timestamp, "UTC"]` for DateTime

### Widget Options
See [VALIDATION_RULES.md - Widget Options Constraints](VALIDATION_RULES.md#widget-options-constraints) - Configuration by column type

---

## External Resources

### Grist Documentation
- **Grist Help Center:** https://support.getgrist.com/
- **Grist API Docs:** https://support.getgrist.com/api/
- **Formula Reference:** https://support.getgrist.com/formulas/

### MCP Protocol
- **MCP Specification:** https://modelcontextprotocol.io/
- **MCP SDK (TypeScript):** https://github.com/modelcontextprotocol/typescript-sdk

### TypeScript & Validation
- **TypeScript Handbook:** https://www.typescriptlang.org/docs/
- **Zod Documentation (v3):** https://v3.zod.dev/
- **Branded Types Article:** https://spin.atomicobject.com/2018/01/15/typescript-flexible-nominal-typing/

---

## Getting Help

### For Users
1. Check [STATUS.md](STATUS.md) for known issues
2. Review [VALIDATION_RULES.md](VALIDATION_RULES.md) for constraints
3. See [DOCKER_SETUP.md](DOCKER_SETUP.md) for setup issues
4. Open an issue on GitHub

### For Contributors
1. Read [CLAUDE.md](../CLAUDE.md) or [DEVELOPMENT.md](DEVELOPMENT.md)
2. Check [ARCHITECTURE.md](ARCHITECTURE.md) for design patterns
3. Review [TESTING.md](TESTING.md) for test requirements
4. See existing code for examples

### For AI Assistants
**Always start with [CLAUDE.md](../CLAUDE.md)** which includes:
- Mandatory agent/skill invocations
- Context7 documentation fetching patterns
- Grist API patterns and common pitfalls
- Development requirements and workflows

---

## Documentation Maintenance

**Last Updated:** 2025-01-12
**Current Version:** v1.2.2

### When to Update Documentation
- **STATUS.md** - After releases, quality changes, or roadmap updates
- **CHANGELOG.md** - With every version release
- **ARCHITECTURE.md** - When system design changes
- **DEVELOPMENT.md** - When workflows or patterns change
- **VALIDATION_RULES.md** - When adding new validation constraints
- **TESTING.md** - When test structure or coverage changes
- **DOCKER_SETUP.md** - When Docker configuration changes

### Documentation Style Guide
- Use **clear headings** with proper hierarchy
- Include **code examples** for complex concepts
- Add **cross-references** to related documentation
- Keep **table of contents** updated for long files (400+ lines)
- Use **consistent formatting** (see existing docs)

---

**Ready to start?**
- **New users:** [../README.md](../README.md)
- **Contributors:** [DEVELOPMENT.md](DEVELOPMENT.md)
- **AI assistants:** [../CLAUDE.md](../CLAUDE.md)
