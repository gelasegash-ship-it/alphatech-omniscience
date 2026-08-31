# WealthAI integration

This directory is reserved for the WealthAI application link.

## Safety contract

- The Replit workspace remains the runtime source of truth for the mobile app and API.
- This GitHub repository is public; secrets, tokens, session data, and bank credentials must never be committed.
- Real banking access is only enabled after an authorized provider connection and explicit user consent.
- Financial actions must remain approval-gated; GitHub automation must not initiate transfers.

## Authentication

WealthAI uses managed Clerk authentication for user sessions and role-based access. The owner account is the only account eligible for administrator capabilities; regular users receive limited access.

## Providers

Provider credentials are configured through Replit Secrets and are intentionally not included here. See .env.example for variable names only.
