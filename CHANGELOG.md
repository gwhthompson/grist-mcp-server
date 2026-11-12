# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.34] - 2026-11-12

### Security

- The npm package is now packed from an allowlist (the `files` field in package.json).
- Version 2.0.33 shipped a `.env` file and MCP registry token files. Upgrade to 2.0.34.
- The Grist API key in that `.env` file has been rotated, and the GitHub token in the token files is no longer valid.
- Version 2.0.34 runs the same code as 2.0.32.

## [2.0.0] - 2025-12-17

Major release consolidating tools for better usability.

### Changed

- Consolidated 22 tools into 11 focused tools
- `grist_manage_records` replaces separate add/update/delete/upsert tools
- `grist_manage_schema` replaces separate table/column management tools
- Improved error messages and validation

### Added

- `visible_fields` and `link_widgets` operations
- MCP compliance improvements

## [1.0.0] - 2025-11-27

Initial public release.

### Features

- 22 tools for Grist document, table, record, page, and webhook management
- SQL query support with JOINs and aggregations
- Summary table creation for analytics
- Conditional formatting rules
- Widget configuration and page building
- Progressive disclosure pattern for efficient context usage
- Comprehensive `grist_help` tool for on-demand documentation
