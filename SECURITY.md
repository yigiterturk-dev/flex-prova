# Security Policy

## Scope

This repository contains the Guest Automation Service practice assessment. Do not include real guest names, phone numbers, webhook secrets, or production database files in issues or pull requests.

## Reporting

For a suspected vulnerability, contact the repository owner privately with a concise description, reproduction steps, affected commit, and impact. Do not publish exploitable details until a fix or mitigation is available.

## Operational minimums

Use a unique `WEBHOOK_SECRET` outside fixtures, keep `DATABASE_PATH` on restricted durable storage, avoid exposing SQLite files or logs publicly, and run the service behind TLS and an authenticated network boundary in production.
